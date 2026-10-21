package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.service.interfaces.ITargetService;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Endpoints Target — objectifs de production par projet/shift/heure.
 *
 * GET    /api/targets       → liste des targets
 * GET    /api/targets/{id}  → détail (grille ligne de projet × heure)
 * POST   /api/targets       → création (admin uniquement)
 * PUT    /api/targets/{id}  → mise à jour des valeurs (admin uniquement)
 * DELETE /api/targets/{id}  → suppression (admin uniquement)
 */
@RestController
@RequestMapping("/api/targets")
@RequiredArgsConstructor
public class TargetController {

    private final ITargetService svc;

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> list() {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("targets", svc.listTargets())));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getOne(@PathVariable long id) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getTargetDetail(id)));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Long>>> create(@RequestBody Map<String, Object> body) {
        String projet = (String) body.get("projet");
        String shift  = (String) body.get("shift");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> cells = (List<Map<String, Object>>) body.getOrDefault("cells", List.of());

        long id = svc.createTarget(projet, shift, cells, currentUser());
        return ResponseEntity.ok(ApiResponse.ok(Map.of("id", id), "Target enregistré"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> update(@PathVariable long id, @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> cells = (List<Map<String, Object>>) body.getOrDefault("cells", List.of());

        svc.updateTarget(id, cells);
        return ResponseEntity.ok(ApiResponse.ok(null, "Target mis à jour"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable long id) {
        svc.deleteTarget(id);
        return ResponseEntity.ok(ApiResponse.ok(null, "Target supprimé"));
    }

    private String currentUser() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getDetails() instanceof Claims claims) {
            String name = claims.get("fullName", String.class);
            if (name != null && !name.isBlank()) return name;
            return String.valueOf(claims.get("matricule"));
        }
        return "inconnu";
    }
}
