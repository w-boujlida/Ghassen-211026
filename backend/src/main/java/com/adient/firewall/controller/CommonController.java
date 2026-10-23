package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.service.interfaces.ILookupService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Common lookup endpoints – mirrors PHP api1.php lookupBarcode, lookupPoly,
 * lookupDef, polyTampons, defCodes, supervisors.
 */
@RestController
@RequestMapping("/api/common")
@RequiredArgsConstructor
public class CommonController {

    private final ILookupService svc;

    // ─── Barcode lookup ───────────────────────────────────────────────────────

    @GetMapping("/lookup-barcode")
    public ResponseEntity<ApiResponse<Map<String, Object>>> lookupBarcode(
            @RequestParam String barcode, @RequestParam(required = false) String project) {

        return ResponseEntity.ok(ApiResponse.ok(svc.lookupBarcode(barcode, project)));
    }

    // ─── Poly lookup (by CQ delibera / tampon) ────────────────────────────────

    @GetMapping("/lookup-poly")
    public ResponseEntity<ApiResponse<Map<String, Object>>> lookupPoly(
            @RequestParam String cqDelibera) {


        return ResponseEntity.ok(ApiResponse.ok(svc.lookupPoly(cqDelibera)));
    }

    // ─── Defect code lookup ───────────────────────────────────────────────────

    @GetMapping("/lookup-def")
    public ResponseEntity<ApiResponse<Map<String, Object>>> lookupDef(
            @RequestParam String codeDef) {

        return ResponseEntity.ok(ApiResponse.ok(svc.lookupDef(codeDef)));
    }

    // ─── Poly tampons list ────────────────────────────────────────────────────

    @GetMapping("/poly-tampons")
    public ResponseEntity<ApiResponse<Map<String, Object>>> polyTampons() {
        return ResponseEntity.ok(ApiResponse.ok(svc.getPolyTampons()));
    }

    @GetMapping("/tampon-codes")
    public ResponseEntity<ApiResponse<Map<String, Object>>> tamponCodes() {
        return ResponseEntity.ok(ApiResponse.ok(svc.getTamponCodes()));
    }

    // ─── Defect codes ─────────────────────────────────────────────────────────

    @GetMapping("/def-codes")
    public ResponseEntity<ApiResponse<Map<String, Object>>> defCodes() {
        return ResponseEntity.ok(ApiResponse.ok(svc.getDefCodes()));
    }

    @GetMapping("/def-codes-list")
    public ResponseEntity<ApiResponse<Map<String, Object>>> defCodesList() {
        return ResponseEntity.ok(ApiResponse.ok(svc.getDefCodesList()));
    }

    @PostMapping("/def-codes")
    public ResponseEntity<ApiResponse<Void>> addDefCode(@RequestBody Map<String, Object> body) {
        String cod   = (String) body.get("cod");
        String desc  = (String) body.getOrDefault("description", "");
        int    dem   = body.get("demerite") instanceof Number n ? n.intValue() : 0;
        Integer delai = body.get("delaiEcheanceHeures") instanceof Number n ? n.intValue() : null;
        svc.addDefCode(cod, desc, dem, delai);
        return ResponseEntity.ok(ApiResponse.ok(null, "Defect code added"));
    }

    @PutMapping("/def-codes")
    public ResponseEntity<ApiResponse<Void>> updateDefCode(@RequestBody Map<String, Object> body) {
        String cod   = (String) body.get("cod");
        String desc  = (String) body.getOrDefault("description", "");
        int    dem   = body.get("demerite") instanceof Number n ? n.intValue() : 0;
        Integer delai = body.get("delaiEcheanceHeures") instanceof Number n ? n.intValue() : null;
        svc.updateDefCode(cod, desc, dem, delai);
        return ResponseEntity.ok(ApiResponse.ok(null, "Defect code updated"));
    }

    @PostMapping("/def-codes/import")
    public ResponseEntity<ApiResponse<Map<String, Object>>> importDefCodes(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> codes = (List<Map<String, Object>>) body.get("codes");
        return ResponseEntity.ok(ApiResponse.ok(svc.importDefCodes(codes)));
    }

    @DeleteMapping("/def-codes")
    public ResponseEntity<ApiResponse<Void>> deleteDefCode(@RequestParam String cod) {
        svc.deleteDefCode(cod);
        return ResponseEntity.ok(ApiResponse.ok(null, "Defect code deleted"));
    }

    // ─── Supervisors ──────────────────────────────────────────────────────────

    @GetMapping("/supervisors")
    public ResponseEntity<ApiResponse<Map<String, Object>>> supervisors() {
        return ResponseEntity.ok(ApiResponse.ok(svc.getSupervisors()));
    }

    @GetMapping("/supervisors-list")
    public ResponseEntity<ApiResponse<Map<String, Object>>> supervisorsList() {
        return ResponseEntity.ok(ApiResponse.ok(svc.getSupervisorsList()));
    }

    @PostMapping("/supervisors")
    public ResponseEntity<ApiResponse<Void>> addSupervisor(@RequestBody Map<String, Object> body) {
        svc.addSupervisor((String) body.get("name"));
        return ResponseEntity.ok(ApiResponse.ok(null, "Supervisor added"));
    }

    @PostMapping("/supervisors/import")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> importSupervisors(
            @RequestBody List<String> names) {
        return ResponseEntity.ok(ApiResponse.ok(svc.importSupervisors(names)));
    }

    @DeleteMapping("/supervisors")
    public ResponseEntity<ApiResponse<Void>> deleteSupervisor(@RequestParam String name) {
        svc.deleteSupervisor(name);
        return ResponseEntity.ok(ApiResponse.ok(null, "Supervisor deleted"));
    }
}
