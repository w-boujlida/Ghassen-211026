package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.repository.sqlserver.ErpProductionRepository;
import com.adient.firewall.repository.sqlserver.ErpProductionSummary;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * GET /api/erp/test-connection     → verifies the read-only SQL Server (ERP/SAGE) link
 * GET /api/erp/production?date=... → per-projet/ligne production quantities for a given day
 * Disabled when spring.datasource.sqlserver.url is blank (local dev without ERP).
 */
@RestController
@RequestMapping("/api/erp")
@ConditionalOnExpression("!'${spring.datasource.sqlserver.url:}'.isBlank()")
@RequiredArgsConstructor
@Slf4j
public class ErpTestController {

    private final ErpProductionRepository erpProductionRepository;

    @GetMapping("/test-connection")
    public ResponseEntity<ApiResponse<String>> testConnection() {
        erpProductionRepository.findProductionByDate(LocalDate.now());
        return ResponseEntity.ok(ApiResponse.ok("SQL Server connected"));
    }

    @GetMapping("/production")
    public ResponseEntity<ApiResponse<List<ErpProductionSummary>>> production(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        List<ErpProductionSummary> result = erpProductionRepository.findProductionByDate(date);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }
}
