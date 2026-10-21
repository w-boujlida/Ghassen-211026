package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.repository.AuditFormsRepository;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Formulaires Auditeur — 3 types : routine | revuposte | palliatives
 *
 * Routes :
 *   GET    /api/audit-forms/{type}        → list (paginé)
 *   POST   /api/audit-forms/{type}        → create
 *   GET    /api/audit-forms/{type}/{id}   → get one
 *   PUT    /api/audit-forms/{type}/{id}   → update
 *   DELETE /api/audit-forms/{type}/{id}   → delete
 *
 * {type} : routine | revuposte | palliatives
 */
@RestController
@RequestMapping("/api/audit-forms")
@RequiredArgsConstructor
@Slf4j
public class AuditFormsController {

    private final AuditFormsRepository repo;

    private static final Set<String> VALID_TYPES = Set.of("routine", "revuposte", "palliatives");

    // ─── List ─────────────────────────────────────────────────────────────────

    @GetMapping("/{type}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> list(
            @PathVariable String type,
            @RequestParam(required = false) String projet,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(defaultValue = "1")   int page,
            @RequestParam(defaultValue = "10")  int limit) {

        if (!VALID_TYPES.contains(type))
            return ResponseEntity.badRequest().body(ApiResponse.error("Type invalide : " + type));

        int total = repo.countForms(type, projet, dateFrom, dateTo);
        List<Map<String, Object>> rows = repo.listForms(type, projet, dateFrom, dateTo, page, limit);
        int totalPages = (int) Math.ceil((double) total / limit);

        Map<String, Object> pagination = Map.of(
            "currentPage", page, "totalPages", Math.max(1, totalPages),
            "totalRecords", total, "recordsPerPage", limit);

        return ResponseEntity.ok(ApiResponse.ok(Map.of("forms", rows, "pagination", pagination)));
    }

    // ─── Get one ──────────────────────────────────────────────────────────────

    @GetMapping("/{type}/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getOne(
            @PathVariable String type,
            @PathVariable Long id) {

        if (!VALID_TYPES.contains(type))
            return ResponseEntity.badRequest().body(ApiResponse.error("Type invalide : " + type));

        return repo.findById(type, id)
            .map(f -> ResponseEntity.ok(ApiResponse.ok(f)))
            .orElseGet(() -> ResponseEntity.status(404).body(ApiResponse.error("Formulaire introuvable")));
    }

    // ─── Create ───────────────────────────────────────────────────────────────

    @PostMapping("/{type}")
    public ResponseEntity<ApiResponse<Map<String, Long>>> create(
            @PathVariable String type,
            @RequestBody Map<String, Object> body) {

        if (!VALID_TYPES.contains(type))
            return ResponseEntity.badRequest().body(ApiResponse.error("Type invalide : " + type));

        String projet   = (String) body.get("projet");
        String formData = (String) body.get("formData");
        String filledBy = currentUser();

        if (formData == null || formData.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("formData requis"));

        long id = repo.insertForm(type, projet, formData, filledBy);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("id", id), "Formulaire enregistré"));
    }

    // ─── Update ───────────────────────────────────────────────────────────────

    @PutMapping("/{type}/{id}")
    public ResponseEntity<ApiResponse<Void>> update(
            @PathVariable String type,
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {

        if (!VALID_TYPES.contains(type))
            return ResponseEntity.badRequest().body(ApiResponse.error("Type invalide : " + type));

        if (repo.findById(type, id).isEmpty())
            return ResponseEntity.status(404).body(ApiResponse.error("Formulaire introuvable"));

        String projet   = (String) body.get("projet");
        String formData = (String) body.get("formData");

        if (formData == null || formData.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("formData requis"));

        repo.updateForm(type, id, projet, formData);
        return ResponseEntity.ok(ApiResponse.ok(null, "Formulaire mis à jour"));
    }

    // ─── Delete ───────────────────────────────────────────────────────────────

    @DeleteMapping("/{type}/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable String type,
            @PathVariable Long id) {

        if (!VALID_TYPES.contains(type))
            return ResponseEntity.badRequest().body(ApiResponse.error("Type invalide : " + type));

        if (repo.findById(type, id).isEmpty())
            return ResponseEntity.status(404).body(ApiResponse.error("Formulaire introuvable"));

        repo.deleteForm(type, id);
        return ResponseEntity.ok(ApiResponse.ok(null, "Formulaire supprimé"));
    }

    // ─── Helper ───────────────────────────────────────────────────────────────

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getDetails() instanceof Claims claims) {
            String name = claims.get("fullName", String.class);
            if (name != null && !name.isBlank()) return name;
            return String.valueOf(claims.get("matricule"));
        }
        return "inconnu";
    }
}
