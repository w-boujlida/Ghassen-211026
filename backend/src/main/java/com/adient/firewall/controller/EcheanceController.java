package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.service.interfaces.IEcheanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;

/**
 * Endpoints échéances — module 3.
 *
 * GET /api/echeances/projets                            → résumé tous projets
 * GET /api/echeances/projets/{projetCode}               → résumé un projet
 * GET /api/echeances/projets/{projetCode}/retard        → records en retard
 * GET /api/echeances/projets/{projetCode}/proches       → records proches (&lt;48h)
 *
 * Paramètre optionnel : ?module=firewall|csl  (défaut = les deux)
 */
@RestController
@RequestMapping("/api/echeances")
@RequiredArgsConstructor
public class EcheanceController {

    private final IEcheanceService svc;

    @GetMapping("/projets")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> allProjects() {
        return ResponseEntity.ok(ApiResponse.ok(svc.getAllProjectsSummary()));
    }

    @GetMapping("/projets/{projetCode}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> oneProject(
            @PathVariable String projetCode,
            @RequestParam(required = false) String module) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getProjectSummary(projetCode.toUpperCase(), module)));
    }

    @GetMapping("/projets/{projetCode}/retard")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> retard(
            @PathVariable String projetCode,
            @RequestParam(required = false) String module) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getRetardRecords(projetCode.toUpperCase(), module)));
    }

    @GetMapping("/projets/{projetCode}/proches")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> proches(
            @PathVariable String projetCode,
            @RequestParam(defaultValue = "48") int heures,
            @RequestParam(required = false) String module) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getProcheRecords(projetCode.toUpperCase(), module, heures)));
    }

    @PatchMapping("/{barcode}/statut")
    public ResponseEntity<ApiResponse<Void>> updateStatut(
            @PathVariable String barcode,
            @RequestBody Map<String, String> body) {
        String reprise = body.get("reprise");
        String module  = body.get("module");
        String projet  = body.get("projet");
        svc.updateStatut(barcode, reprise, module, projet);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }
}
