package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.service.interfaces.IPosteService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/postes")
@RequiredArgsConstructor
public class PosteController {

    private final IPosteService svc;

    @GetMapping
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAll() {
        return ResponseEntity.ok(ApiResponse.ok(svc.getPostes()));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Void>> create(@RequestBody Map<String, String> body) {
        String nom = body.get("nom");
        if (nom == null || nom.isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Nom requis"));
        }
        svc.createPoste(nom, body.get("code"));
        return ResponseEntity.ok(ApiResponse.ok(null, "Poste créé"));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> update(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        String nom = body.get("nom");
        if (nom == null || nom.isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Nom requis"));
        }
        svc.updatePoste(id, nom, body.get("code"));
        return ResponseEntity.ok(ApiResponse.ok(null, "Poste mis à jour"));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        svc.deletePoste(id);
        return ResponseEntity.ok(ApiResponse.ok(null, "Poste supprimé"));
    }

    @PostMapping("/bulk")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> bulkCreate(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<String> noms = (List<String>) body.get("noms");
        if (noms == null || noms.isEmpty()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Liste de noms requise"));
        }
        int inserted = svc.bulkCreatePostes(noms);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("inserted", inserted), inserted + " poste(s) créé(s)"));
    }
}
