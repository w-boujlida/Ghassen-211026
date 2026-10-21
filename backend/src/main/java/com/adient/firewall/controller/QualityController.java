package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.dto.BulkRepriseRequest;
import com.adient.firewall.dto.PageResponse;
import com.adient.firewall.dto.QualityRecordDto;
import com.adient.firewall.dto.QualityRecordInput;
import com.adient.firewall.service.interfaces.IQualityService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Unified controller for Firewall and CSL quality records.
 *
 * {module} = "firewall" → prefix=FIREWALL, operatorCol=CQFW
 * {module} = "csl"      → prefix=CSL,      operatorCol=CQCSL
 *
 * READ endpoints: all authenticated roles.
 * WRITE endpoints (create/update/delete): ADMIN, SUPERVISEUR, OPERATEUR only.
 *                                         RES_OPERATEUR is read + export only.
 */
@RestController
@RequestMapping("/api/{module}")
@RequiredArgsConstructor
public class QualityController {

    private final IQualityService svc;

    private static String prefix(String module) {
        return switch (module.toLowerCase()) {
            case "firewall" -> "FIREWALL";
            case "csl"      -> "CSL";
            default -> throw new IllegalArgumentException("Module invalide: " + module + ". Utilisez 'firewall' ou 'csl'.");
        };
    }

    private static String opCol(String module) {
        return "firewall".equalsIgnoreCase(module) ? "CQFW" : "CQCSL";
    }

    // ── READ endpoints (all authenticated) ────────────────────────────────────

    @GetMapping("/sources")
    public ResponseEntity<ApiResponse<List<String>>> getSources(@PathVariable String module) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getSources(prefix(module))));
    }

    @GetMapping("/records")
    public ResponseEntity<ApiResponse<PageResponse<QualityRecordDto>>> getRecords(
            @PathVariable String module,
            @RequestParam String projet,
            @RequestParam(defaultValue = "1")  int page,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam Map<String, String> allParams) {

        return ResponseEntity.ok(ApiResponse.ok(
                svc.getRecords(prefix(module), opCol(module), projet.toUpperCase(), page, limit, allParams)));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStats(
            @PathVariable String module,
            @RequestParam String projet,
            @RequestParam(defaultValue = "today") String period,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {

        return ResponseEntity.ok(ApiResponse.ok(
                svc.getStats(prefix(module), projet.toUpperCase(), period, dateFrom, dateTo)));
    }

    @GetMapping("/report")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getReport(
            @PathVariable String module,
            @RequestParam String projet,
            @RequestParam Map<String, String> allParams) {

        return ResponseEntity.ok(ApiResponse.ok(svc.getReport(prefix(module), projet.toUpperCase(), allParams)));
    }

    @GetMapping("/scan")
    public ResponseEntity<ApiResponse<PageResponse<QualityRecordDto>>> scan(
            @PathVariable String module,
            @RequestParam String barcode,
            @RequestParam String projet,
            @RequestParam(defaultValue = "1")  int page,
            @RequestParam(defaultValue = "50") int limit) {

        Map<String, String> filters = Map.of("barcodeFilter", barcode);
        return ResponseEntity.ok(ApiResponse.ok(
                svc.getRecords(prefix(module), opCol(module), projet.toUpperCase(), page, limit, filters)));
    }

    /** Export: all authenticated (RES_OPERATEUR can export). */
    @GetMapping("/export")
    public ResponseEntity<ApiResponse<PageResponse<QualityRecordDto>>> export(
            @PathVariable String module,
            @RequestParam String projet,
            @RequestParam Map<String, String> allParams) {

        return ResponseEntity.ok(ApiResponse.ok(
                svc.getRecords(prefix(module), opCol(module), projet.toUpperCase(), 1, 0, allParams)));
    }

    // ── WRITE endpoints (not RES_OPERATEUR / OPERATOR_MANAGER) ───────────────

    @PostMapping("/records")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Void>> create(
            @PathVariable String module,
            @RequestBody List<QualityRecordInput> records) {

        String pref = prefix(module);
        String col  = opCol(module);
        for (QualityRecordInput r : records) svc.createRecord(pref, col, r);
        return ResponseEntity.ok(ApiResponse.ok(null, "Records added successfully"));
    }

    @PostMapping("/import")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> importRecords(
            @PathVariable String module,
            @RequestParam String projet,
            @RequestBody List<QualityRecordInput> records) {

        Map<String, Object> result = svc.importRecords(prefix(module), opCol(module), projet.toUpperCase(), records);
        int inserted = (int) result.get("inserted");
        int skipped  = (int) result.get("skipped");
        int errors   = (int) result.get("errors");
        return ResponseEntity.ok(ApiResponse.ok(result,
                "Import complete: " + inserted + " inserted, " + skipped + " skipped, " + errors + " errors."));
    }

    @PutMapping("/records/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Void>> update(
            @PathVariable String module,
            @PathVariable Long id,
            @RequestParam String projet,
            @RequestBody QualityRecordInput record) {

        svc.updateRecord(prefix(module), opCol(module), projet.toUpperCase(), id, record);
        return ResponseEntity.ok(ApiResponse.ok(null, "Record updated successfully"));
    }

    @DeleteMapping("/records/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable String module,
            @PathVariable Long id,
            @RequestParam String projet,
            @RequestParam(required = false) String codDef) {

        svc.deleteRecord(prefix(module), projet.toUpperCase(), id, codDef);
        return ResponseEntity.ok(ApiResponse.ok(null, "Record deleted successfully"));
    }

    @DeleteMapping("/records")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Void>> deleteByKey(
            @PathVariable String module,
            @RequestParam String projet,
            @RequestParam String barCode,
            @RequestParam String codDef) {

        svc.deleteByKey(prefix(module), projet.toUpperCase(), barCode, codDef);
        return ResponseEntity.ok(ApiResponse.ok(null, "Record deleted successfully"));
    }

    @PatchMapping("/records/bulk-reprise")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Void>> bulkReprise(
            @PathVariable String module,
            @RequestParam String projet,
            @RequestBody BulkRepriseRequest request) {

        svc.bulkUpdateReprise(prefix(module), projet.toUpperCase(), request.barcodes(), request.reprise());
        return ResponseEntity.ok(ApiResponse.ok(null, request.barcodes().size() + " enregistrement(s) mis à jour"));
    }
}
