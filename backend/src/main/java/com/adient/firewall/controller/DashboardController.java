package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.service.interfaces.IDashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final IDashboardService svc;

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> getDashboard() {
        return ResponseEntity.ok(ApiResponse.ok(svc.getDashboard()));
    }

    @GetMapping("/filtered")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getFiltered(
            @RequestParam(required = false) String date1,
            @RequestParam(required = false) String date2,
            @RequestParam(required = false) String projet,
            @RequestParam(required = false) String coddef,
            @RequestParam(required = false) String superviseur) {

        return ResponseEntity.ok(ApiResponse.ok(
                svc.getDashboardFiltered(date1, date2, projet, coddef, superviseur)));
    }
}
