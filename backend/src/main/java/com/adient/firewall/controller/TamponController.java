package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.dto.TamponImportDto;
import com.adient.firewall.service.interfaces.ITamponService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tampons")
@RequiredArgsConstructor
public class TamponController {

    private final ITamponService svc;

    @GetMapping
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAll() {
        return ResponseEntity.ok(ApiResponse.ok(svc.getAllTampons()));
    }

    @PostMapping("/import")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> importTampons(
            @RequestBody List<TamponImportDto> tampons) {
        return ResponseEntity.ok(ApiResponse.ok(svc.importTampons(tampons)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> create(@RequestBody Map<String, String> body) {
        Map<String, Object> created = svc.createTampon(body.get("code"), body.getOrDefault("description", ""));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(created, "Tampon créé"));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> update(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        svc.updateTampon(id, body.get("code"), body.getOrDefault("description", ""));
        return ResponseEntity.ok(ApiResponse.ok(null, "Tampon mis à jour"));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        svc.deleteTampon(id);
        return ResponseEntity.ok(ApiResponse.ok(null, "Tampon supprimé"));
    }

    @GetMapping("/{code}/supervisor")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getSupervisor(@PathVariable String code) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getSupervisorByTampon(code)));
    }

    @GetMapping("/employee/{mat}")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getByEmployee(@PathVariable String mat) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getEmployeeTampons(mat)));
    }

    @PostMapping("/assign/{id}/employee/{mat}")
    public ResponseEntity<ApiResponse<Void>> assign(@PathVariable Long id, @PathVariable String mat) {
        svc.assignTampon(id, mat);
        return ResponseEntity.ok(ApiResponse.ok(null, "Tampon assigné"));
    }

    @DeleteMapping("/assign/{id}")
    public ResponseEntity<ApiResponse<Void>> unassign(@PathVariable Long id) {
        svc.unassignTampon(id);
        return ResponseEntity.ok(ApiResponse.ok(null, "Tampon désassigné"));
    }

    @GetMapping("/available")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAvailable() {
        return ResponseEntity.ok(ApiResponse.ok(svc.getAvailableTampons()));
    }

    @GetMapping("/available/{mat}")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAvailableForEmployee(@PathVariable String mat) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getAvailableTamponsForEmployee(mat)));
    }
}
