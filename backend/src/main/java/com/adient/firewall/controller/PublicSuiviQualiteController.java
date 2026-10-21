package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.dto.SuiviQualiteDashboardDto;
import com.adient.firewall.service.interfaces.IProjectService;
import com.adient.firewall.service.interfaces.ISuiviQualiteService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Endpoints publics, en lecture seule et sans authentification, pour l'écran
 * "Grand Affichage" du Suivi Qualité des Coiffes consulté en atelier (TV murale,
 * tablette) sans compte utilisateur.
 *
 * N'expose que le strict nécessaire à l'affichage (noms de projet/ligne, créneaux,
 * limite, quantité de défauts, statut couleur) — aucune action d'écriture et aucune
 * autre donnée du système. Délègue toute la logique métier (agrégation horaire,
 * limites, calcul de statut) aux mêmes services que le dashboard authentifié
 * ({@link SuiviQualiteController}), sans duplication.
 */
@RestController
@RequestMapping("/api/public/suivi-qualite")
@RequiredArgsConstructor
public class PublicSuiviQualiteController {

    private final ISuiviQualiteService svc;
    private final IProjectService projectSvc;

    @GetMapping("/dashboard")
    public ResponseEntity<ApiResponse<SuiviQualiteDashboardDto>> dashboard(
            @RequestParam String projet,
            @RequestParam(required = false) String ligne,
            @RequestParam(required = false) String shift,
            @RequestParam(required = false) String date) {

        if (projet == null || projet.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Projet requis"));

        return ResponseEntity.ok(ApiResponse.ok(svc.getDashboard(projet, ligne, shift, date)));
    }

    /** Noms de projet uniquement (pas de compteurs de références ni d'indicateurs internes). */
    @GetMapping("/projects")
    public ResponseEntity<ApiResponse<Map<String, Object>>> projects() {
        List<String> names = projectSvc.getProjects().stream()
                .map(p -> String.valueOf(p.get("name")))
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("projects", names)));
    }

    @GetMapping("/lignes")
    public ResponseEntity<ApiResponse<Map<String, Object>>> lignes(@RequestParam String projet) {
        if (projet == null || projet.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Projet requis"));

        return ResponseEntity.ok(ApiResponse.ok(Map.of("lignes", projectSvc.getLignesProjet(projet))));
    }
}
