package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.dto.RapportDto;
import com.adient.firewall.dto.StatsProjetResponseDto;
import com.adient.firewall.dto.StatsResponseDto;
import com.adient.firewall.dto.SuiviQualiteDashboardDto;
import com.adient.firewall.dto.SuiviQualiteShiftDto;
import com.adient.firewall.service.interfaces.ISuiviQualiteService;
import com.adient.firewall.service.interfaces.ISuiviQualiteShiftService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Dashboard "Suivi Qualité des Coiffes" — pilotage temps réel Limite vs quantité de coiffes
 * avec défaut, par ligne de projet, avec le détail par créneau horaire. Expose également le
 * module Statistiques &amp; Rapport : agrégation historique (tendances dans le temps) et rapport
 * exportable (Excel/PDF).
 *
 * GET /api/suivi-qualite/dashboard?projet=X&ligne=Y&shift=MATIN&date=2026-07-04
 *   ligne, shift, date sont optionnels (ligne = toutes les lignes du projet,
 *   shift = shift courant, date = aujourd'hui, fuseau Africa/Tunis).
 */
@RestController
@RequestMapping("/api/suivi-qualite")
@RequiredArgsConstructor
public class SuiviQualiteController {

    private final ISuiviQualiteService svc;
    private final ISuiviQualiteShiftService shiftSvc;

    // GET /api/suivi-qualite/shift?projet=X&shift=1&date=2026-07-04&ligne=Y
    //   shift: 1 (06h-16h) ou 2 (20h-06h, traverse minuit), défaut 1. date, ligne optionnels.
    @GetMapping("/shift")
    public ResponseEntity<ApiResponse<SuiviQualiteShiftDto>> shift(
            @RequestParam String projet,
            @RequestParam(required = false) Integer shift,
            @RequestParam(required = false) String date,
            @RequestParam(required = false) String ligne) {

        if (projet == null || projet.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Projet requis"));

        return ResponseEntity.ok(ApiResponse.ok(shiftSvc.getShiftReport(projet, shift, date, ligne)));
    }

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

    // GET /api/suivi-qualite/stats/global?dateDebut=2026-06-01&dateFin=2026-07-01&granularite=JOUR
    @GetMapping("/stats/global")
    public ResponseEntity<ApiResponse<StatsResponseDto>> statsGlobal(
            @RequestParam String dateDebut,
            @RequestParam String dateFin,
            @RequestParam(required = false) String granularite) {

        return ResponseEntity.ok(ApiResponse.ok(svc.getStatsGlobal(dateDebut, dateFin, granularite)));
    }

    // GET /api/suivi-qualite/stats/projet?projet=X&ligne=Y&dateDebut=...&dateFin=...&granularite=HEURE&shift=MATIN
    // granularite: HEURE | SHIFT (occurrence de shift 8h) — la Limite n'a de sens qu'à l'intérieur d'un shift.
    @GetMapping("/stats/projet")
    public ResponseEntity<ApiResponse<StatsProjetResponseDto>> statsProjet(
            @RequestParam String projet,
            @RequestParam(required = false) String ligne,
            @RequestParam String dateDebut,
            @RequestParam String dateFin,
            @RequestParam(required = false) String granularite,
            @RequestParam(required = false) String shift) {

        if (projet == null || projet.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Projet requis"));

        return ResponseEntity.ok(ApiResponse.ok(svc.getStatsProjet(projet, ligne, dateDebut, dateFin, granularite, shift)));
    }

    // GET /api/suivi-qualite/rapport?projet=X&dateDebut=...&dateFin=...&shift=MATIN
    @GetMapping("/rapport")
    public ResponseEntity<ApiResponse<RapportDto>> rapport(
            @RequestParam String projet,
            @RequestParam String dateDebut,
            @RequestParam String dateFin,
            @RequestParam(required = false) String shift) {

        if (projet == null || projet.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Projet requis"));

        return ResponseEntity.ok(ApiResponse.ok(svc.getRapport(projet, dateDebut, dateFin, shift)));
    }

    @GetMapping("/rapport/export.xlsx")
    public ResponseEntity<byte[]> rapportExportExcel(
            @RequestParam String projet,
            @RequestParam String dateDebut,
            @RequestParam String dateFin,
            @RequestParam(required = false) String shift) throws Exception {

        byte[] data = svc.exportRapportExcel(projet, dateDebut, dateFin, shift);
        String name = "rapport_qualite_" + projet + "_" + dateDebut + "_" + dateFin + ".xlsx";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(data);
    }

    @GetMapping("/rapport/export.pdf")
    public ResponseEntity<byte[]> rapportExportPdf(
            @RequestParam String projet,
            @RequestParam String dateDebut,
            @RequestParam String dateFin,
            @RequestParam(required = false) String shift) throws Exception {

        byte[] data = svc.exportRapportPdf(projet, dateDebut, dateFin, shift);
        String name = "rapport_qualite_" + projet + "_" + dateDebut + "_" + dateFin + ".pdf";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(data);
    }
}
