package com.adient.firewall.controller;

import com.adient.firewall.dto.*;
import com.adient.firewall.service.interfaces.IEmployeeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.List;

@RestController
@RequestMapping("/api/employees")
@RequiredArgsConstructor
public class EmployeeController {

    private final IEmployeeService svc;

    @GetMapping
    public ResponseEntity<ApiResponse<PageResponse<EmployeeDto>>> getAll(
            @RequestParam(defaultValue = "1")  int page,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam Map<String, String> allParams) {

        return ResponseEntity.ok(ApiResponse.ok(svc.getAll(page, limit, allParams)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Void>> create(@RequestBody EmployeeDto emp) {
        svc.create(emp);
        return ResponseEntity.ok(ApiResponse.ok(null, "Employee added successfully"));
    }

    @GetMapping("/selection")
    public ResponseEntity<ApiResponse<List<EmployeeDto>>> selection(@RequestParam Map<String, String> filters) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getAll(1, Integer.MAX_VALUE, filters).records()));
    }

    @PostMapping("/import")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> importEmployees(
            @RequestBody List<EmployeeImportDto> employees) {
        return ResponseEntity.ok(ApiResponse.ok(svc.importEmployees(employees)));
    }

    @PutMapping
    public ResponseEntity<ApiResponse<Void>> update(@RequestBody EmployeeDto emp) {
        svc.update(emp);
        return ResponseEntity.ok(ApiResponse.ok(null, "Employee updated successfully"));
    }

    @DeleteMapping
    public ResponseEntity<ApiResponse<Void>> delete(@RequestParam String mat) {
        svc.delete(mat);
        return ResponseEntity.ok(ApiResponse.ok(null, "Employee deleted successfully"));
    }
}
