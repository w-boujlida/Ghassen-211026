package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.dto.LoginRequest;
import com.adient.firewall.dto.LoginResponse;
import com.adient.firewall.security.JwtUtil;
import com.adient.firewall.service.impl.PermissionService;
import com.adient.firewall.service.interfaces.IAuthService;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final IAuthService svc;
    private final JwtUtil jwtUtil;
    private final PermissionService permSvc;

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginResponse>> login(@RequestBody LoginRequest req) {
        LoginResponse resp = svc.login(req);
        return ResponseEntity.ok(ApiResponse.ok(resp, "Connexion réussie"));
    }

    /**
     * Sliding-session refresh: exchange a still-valid token for a fresh one.
     * Called automatically by the frontend when less than 60 min remain.
     */
    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<LoginResponse>> refresh(
            @RequestHeader("Authorization") String bearerToken) {
        String token = bearerToken.startsWith("Bearer ") ? bearerToken.substring(7) : bearerToken;
        LoginResponse resp = svc.refreshToken(token);
        return ResponseEntity.ok(ApiResponse.ok(resp, "Token renouvelé"));
    }

    /**
     * Returns the full module→permission map for the currently authenticated user's role.
     * Accessible to any authenticated user (interceptor excludes /api/auth/**).
     * Used by the frontend to enforce route guards without hardcoding roles.
     */
    @GetMapping("/my-permissions")
    public ResponseEntity<ApiResponse<Map<String, String>>> myPermissions(Authentication auth) {
        if (auth == null || !(auth.getDetails() instanceof Claims claims)) {
            return ResponseEntity.ok(ApiResponse.ok(Map.of()));
        }
        String role = String.valueOf(claims.get("role")).toLowerCase();
        return ResponseEntity.ok(ApiResponse.ok(permSvc.getPermissionsForRole(role)));
    }

    @PostMapping("/change-password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @RequestHeader("Authorization") String bearerToken,
            @RequestBody Map<String, String> body) {

        String token  = bearerToken.substring(7);
        Long   userId = jwtUtil.getUserId(token);
        svc.changePassword(userId, body.get("old_password"), body.get("new_password"));
        return ResponseEntity.ok(ApiResponse.ok(null, "Mot de passe modifié avec succès"));
    }
}
