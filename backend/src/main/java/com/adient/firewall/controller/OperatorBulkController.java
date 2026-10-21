package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.dto.OperatorBulkRequest;
import com.adient.firewall.dto.OperatorBulkResult;
import com.adient.firewall.repository.OperatorBulkRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/operators")
@RequiredArgsConstructor
public class OperatorBulkController {

    private final OperatorBulkRepository repo;

    @PostMapping("/{kind}/bulk")
    public ResponseEntity<ApiResponse<OperatorBulkResult>> apply(
            @PathVariable String kind, @RequestBody OperatorBulkRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(repo.apply(kind, request)));
    }
}
