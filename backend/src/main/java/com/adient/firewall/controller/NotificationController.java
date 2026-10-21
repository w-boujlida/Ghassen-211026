package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.repository.NotificationRepository;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Routes :
 *   GET  /api/notifications              → list for current user
 *   GET  /api/notifications/unread-count → count of unread
 *   POST /api/notifications/{id}/read   → mark as read
 *   POST /api/notifications/{id}/action → validate or reject
 */
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
@Slf4j
public class NotificationController {

    private final NotificationRepository repo;

    // ─── List ─────────────────────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> list(
            @RequestParam(defaultValue = "1")  int page,
            @RequestParam(defaultValue = "20") int limit) {

        String[] ctx = currentUserCtx();
        String matricule = ctx[0];
        String role      = ctx[1];

        int total = repo.countForRole(role, matricule);
        List<Map<String, Object>> rows = repo.listForRole(role, matricule, page, limit);
        int totalPages = (int) Math.ceil((double) total / limit);

        Map<String, Object> pagination = Map.of(
            "currentPage", page, "totalPages", Math.max(1, totalPages),
            "totalRecords", total, "recordsPerPage", limit);

        return ResponseEntity.ok(ApiResponse.ok(Map.of("notifications", rows, "pagination", pagination)));
    }

    // ─── Unread count ─────────────────────────────────────────────────────────

    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<Integer>> unreadCount() {
        String[] ctx = currentUserCtx();
        return ResponseEntity.ok(ApiResponse.ok(repo.countUnread(ctx[1], ctx[0])));
    }

    // ─── Mark read ────────────────────────────────────────────────────────────

    @PostMapping("/{id}/read")
    public ResponseEntity<ApiResponse<Void>> markRead(@PathVariable Long id) {
        String matricule = currentUserCtx()[0];
        repo.markRead(id, matricule);
        return ResponseEntity.ok(ApiResponse.ok(null, "Marquée comme lue"));
    }

    // ─── Action: validate / reject ────────────────────────────────────────────

    @PostMapping("/{id}/action")
    public ResponseEntity<ApiResponse<Void>> action(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {

        String action  = body.get("action");   // "validated" | "rejected"
        String comment = body.getOrDefault("comment", "");
        String matricule = currentUserCtx()[0];

        if (!"validated".equals(action) && !"rejected".equals(action)) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Action invalide"));
        }

        repo.saveAction(id, matricule, action, comment);
        return ResponseEntity.ok(ApiResponse.ok(null, "Action enregistrée"));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private String[] currentUserCtx() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return new String[]{"", ""};
        if (auth.getDetails() instanceof Claims claims) {
            String matricule = (String) claims.get("matricule");
            if (matricule == null) matricule = claims.getSubject();
            String role = claims.get("role", String.class);
            return new String[]{matricule != null ? matricule : "", role != null ? role : ""};
        }
        return new String[]{auth.getName(), ""};
    }
}
