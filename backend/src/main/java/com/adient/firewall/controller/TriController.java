package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.dto.PageResponse;
import com.adient.firewall.dto.TriFicheDto;
import com.adient.firewall.dto.TriFicheInput;
import com.adient.firewall.service.interfaces.ITriService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tri")
@RequiredArgsConstructor
public class TriController {

    private final ITriService svc;

    @GetMapping("/fiches")
    public ResponseEntity<ApiResponse<PageResponse<TriFicheDto>>> getFiches(
            @RequestParam(required = false) String projet,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1")  int page,
            @RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getFiches(projet, status, page, limit)));
    }

    @GetMapping("/fiches/{id}")
    public ResponseEntity<ApiResponse<TriFicheDto>> getFicheById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getFicheById(id)));
    }

    @PostMapping("/fiches")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<TriFicheDto>> createFiche(@RequestBody TriFicheInput input) {
        return ResponseEntity.ok(ApiResponse.ok(svc.createFiche(input), "Fiche créée avec succès"));
    }

    @PutMapping("/fiches/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<TriFicheDto>> updateFiche(
            @PathVariable Long id,
            @RequestBody TriFicheInput input) {
        return ResponseEntity.ok(ApiResponse.ok(svc.updateFiche(id, input), "Fiche mise à jour"));
    }

    @DeleteMapping("/fiches/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Void>> deleteFiche(@PathVariable Long id) {
        svc.deleteFiche(id);
        return ResponseEntity.ok(ApiResponse.ok(null, "Fiche supprimée"));
    }

    @GetMapping("/projects")
    public ResponseEntity<ApiResponse<List<String>>> getProjects() {
        return ResponseEntity.ok(ApiResponse.ok(svc.getAvailableProjects()));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStats(
            @RequestParam(required = false) String projet) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getStats(projet)));
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> export(
            @RequestParam(required = false) String projet,
            @RequestParam(required = false) String status) throws Exception {
        byte[] data = svc.exportExcel(projet, status);
        String date = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String name = "tri_export_" + (projet != null && !projet.isBlank() ? projet : "all") + "_" + date + ".xlsx";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(data);
    }

    @PostMapping("/import")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> importFiches(
            @RequestParam("file") MultipartFile file) throws Exception {
        Map<String, Object> result = svc.importExcel(file.getBytes());
        int imp = result.get("imported") instanceof Number n ? n.intValue() : 0;
        int skp = result.get("skipped")  instanceof Number n ? n.intValue() : 0;
        return ResponseEntity.ok(ApiResponse.ok(result,
                "Import terminé : " + imp + " importées, " + skp + " ignorées"));
    }
}
