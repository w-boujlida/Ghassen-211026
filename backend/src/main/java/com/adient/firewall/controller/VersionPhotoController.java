package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.service.impl.VersionPhotoService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/projects/{name}/version-photo")
@RequiredArgsConstructor
public class VersionPhotoController {
    private final VersionPhotoService service;
    public record PhotoInput(String dataUrl) {}

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> get(
            @PathVariable String name, @RequestParam String line, @RequestParam String version) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
                .body(ApiResponse.ok(service.get(name, line, version)));
    }

    @PutMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR')")
    public ResponseEntity<ApiResponse<Void>> save(@PathVariable String name, @RequestParam String line,
            @RequestParam String version, @RequestBody PhotoInput body) {
        service.save(name, line, version, body.dataUrl());
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @DeleteMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR')")
    public ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable String name, @RequestParam String line, @RequestParam String version) {
        service.delete(name, line, version);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }
}
