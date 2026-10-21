package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.security.JwtUtil;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/profile")
@RequiredArgsConstructor
public class ProfileController {

    private final QualityRepository repo;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    // ─── GET /api/profile ──────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> getProfile(Authentication auth) {
        Long userId = userId(auth);
        Map<String, Object> row = repo.findUserById(userId)
                .orElseThrow(() -> new RuntimeException("Utilisateur introuvable"));

        // fetch full info
        List<Map<String, Object>> rows = repo.getJdbcTemplate().queryForList(
                "SELECT ID,MATRICULE,FULL_NAME,EMAIL,PHONE,ROLE FROM SYSTEM.APP_USERS WHERE ID=?", userId);
        if (rows.isEmpty()) throw new RuntimeException("Utilisateur introuvable");

        Map<String, Object> u = rows.get(0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id",         u.get("ID"));
        result.put("matricule",  u.get("MATRICULE"));
        result.put("fullName",   u.get("FULL_NAME"));
        result.put("email",      u.get("EMAIL"));
        result.put("phone",      u.get("PHONE"));
        result.put("role",       u.get("ROLE"));
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    // ─── PUT /api/profile ──────────────────────────────────────────────────

    @PutMapping
    public ResponseEntity<ApiResponse<Void>> updateProfile(
            Authentication auth,
            @RequestBody Map<String, String> body) {

        Long userId   = userId(auth);
        String name   = body.getOrDefault("fullName", "").trim();
        String email  = body.getOrDefault("email", "").trim();
        String phone  = body.getOrDefault("phone",  "");

        if (name.isBlank())  throw new IllegalArgumentException("Le nom complet est requis");
        if (email.isBlank()) throw new IllegalArgumentException("L'email est requis");

        // Check email uniqueness (exclude current user)
        List<Map<String, Object>> conflict = repo.getJdbcTemplate().queryForList(
                "SELECT ID FROM SYSTEM.APP_USERS WHERE UPPER(EMAIL)=UPPER(?) AND ID<>?", email, userId);
        if (!conflict.isEmpty()) throw new IllegalArgumentException("Cet email est déjà utilisé");

        repo.getJdbcTemplate().update(
                "UPDATE SYSTEM.APP_USERS SET FULL_NAME=?,EMAIL=?,PHONE=? WHERE ID=?",
                name, email, phone, userId);
        return ResponseEntity.ok(ApiResponse.ok(null, "Profil mis à jour"));
    }

    // ─── PUT /api/profile/password ─────────────────────────────────────────

    @PutMapping("/password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            Authentication auth,
            @RequestBody Map<String, String> body) {

        Long userId = userId(auth);
        String current = body.getOrDefault("currentPassword", "");
        String newPwd  = body.getOrDefault("newPassword", "");

        if (newPwd.length() < 6)
            throw new IllegalArgumentException("Le nouveau mot de passe doit contenir au moins 6 caractères");

        List<Map<String, Object>> rows = repo.getJdbcTemplate().queryForList(
                "SELECT PWD_HASH FROM SYSTEM.APP_USERS WHERE ID=?", userId);
        if (rows.isEmpty()) throw new RuntimeException("Utilisateur introuvable");

        String hash = (String) rows.get(0).get("PWD_HASH");
        if (!passwordEncoder.matches(current, hash))
            throw new IllegalArgumentException("Mot de passe actuel incorrect");

        repo.updatePassword(userId, passwordEncoder.encode(newPwd));
        return ResponseEntity.ok(ApiResponse.ok(null, "Mot de passe modifié avec succès"));
    }

    // ─── Helper ────────────────────────────────────────────────────────────

    private Long userId(Authentication auth) {
        if (auth != null && auth.getDetails() instanceof Claims claims) {
            Object id = claims.get("user_id");
            if (id instanceof Number n) return n.longValue();
        }
        throw new RuntimeException("Non authentifié");
    }
}
