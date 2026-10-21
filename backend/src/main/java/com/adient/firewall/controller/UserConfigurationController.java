package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.service.impl.UserConfigurationService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class UserConfigurationController {
    private final UserConfigurationService service;

    @PutMapping("/api/admin/permissions/configuration")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Void> configuration(@RequestBody UserConfigurationService.Configuration body) {
        service.saveConfiguration(body);
        return ApiResponse.ok(null);
    }
}
