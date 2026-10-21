package com.adient.firewall.controller;

import com.adient.firewall.dto.AlerteCouturiereDto;
import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.dto.DefautCouturiereDetailDto;
import com.adient.firewall.dto.DefautCouturiereRapportDto;
import com.adient.firewall.dto.DefautCouturiereTableauDto;
import com.adient.firewall.service.interfaces.IDefautCouturiereService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Suivi des Défauts par Couturière : tableau agrégé, détail par couturière, alertes (3 codes
 * défauts / heure calendaire, consultation seule — le calcul se fait en temps réel au moment du
 * scan, voir DeliberaController) et rapport exportable (Excel/PDF).
 */
@RestController
@RequestMapping("/api/defauts-couturiere")
@RequiredArgsConstructor
public class DefautCouturiereController {

    private final IDefautCouturiereService svc;

    @GetMapping("/tableau")
    public ResponseEntity<ApiResponse<DefautCouturiereTableauDto>> tableau(
            @RequestParam String projet,
            @RequestParam(required = false) String ligne,
            @RequestParam(required = false) String shift,
            @RequestParam(required = false) String date) {

        if (projet == null || projet.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Projet requis"));

        return ResponseEntity.ok(ApiResponse.ok(svc.getTableau(projet, ligne, shift, date)));
    }

    @GetMapping("/detail")
    public ResponseEntity<ApiResponse<DefautCouturiereDetailDto>> detail(
            @RequestParam String matricule,
            @RequestParam String projet,
            @RequestParam(required = false) String ligne,
            @RequestParam(required = false) String shift,
            @RequestParam(required = false) String date) {

        if (matricule == null || matricule.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Matricule requis"));
        if (projet == null || projet.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Projet requis"));

        return ResponseEntity.ok(ApiResponse.ok(svc.getDetail(matricule, projet, ligne, shift, date)));
    }

    @GetMapping("/alertes")
    public ResponseEntity<ApiResponse<List<AlerteCouturiereDto>>> alertes(
            @RequestParam(required = false) String projet,
            @RequestParam(required = false) String ligne,
            @RequestParam(required = false) String date) {

        return ResponseEntity.ok(ApiResponse.ok(svc.getAlertes(projet, ligne, date)));
    }

    @GetMapping("/rapport")
    public ResponseEntity<ApiResponse<DefautCouturiereRapportDto>> rapport(
            @RequestParam String projet,
            @RequestParam(required = false) String ligne,
            @RequestParam String dateDebut,
            @RequestParam String dateFin) {

        if (projet == null || projet.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Projet requis"));

        return ResponseEntity.ok(ApiResponse.ok(svc.getRapport(projet, ligne, dateDebut, dateFin)));
    }

    @GetMapping("/rapport/export.xlsx")
    public ResponseEntity<byte[]> rapportExportExcel(
            @RequestParam String projet,
            @RequestParam(required = false) String ligne,
            @RequestParam String dateDebut,
            @RequestParam String dateFin) throws Exception {

        byte[] data = svc.exportRapportExcel(projet, ligne, dateDebut, dateFin);
        String name = "rapport_defauts_couturiere_" + projet + "_" + dateDebut + "_" + dateFin + ".xlsx";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(data);
    }

    @GetMapping("/rapport/export.pdf")
    public ResponseEntity<byte[]> rapportExportPdf(
            @RequestParam String projet,
            @RequestParam(required = false) String ligne,
            @RequestParam String dateDebut,
            @RequestParam String dateFin) throws Exception {

        byte[] data = svc.exportRapportPdf(projet, ligne, dateDebut, dateFin);
        String name = "rapport_defauts_couturiere_" + projet + "_" + dateDebut + "_" + dateFin + ".pdf";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(data);
    }
}
