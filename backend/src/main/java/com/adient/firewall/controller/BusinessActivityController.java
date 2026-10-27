package com.adient.firewall.controller;

import com.adient.firewall.audit.BusinessActivityFilter;
import com.adient.firewall.audit.BusinessActivityRecorder;
import com.adient.firewall.audit.BusinessActivityRepository;
import com.adient.firewall.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Set;

@RestController
@RequiredArgsConstructor
@Slf4j
public class BusinessActivityController {
    private final BusinessActivityRepository repository;
    private final BusinessActivityRecorder recorder;
    private static final Set<String> EXPORT_MODULES = Set.of("users", "firewall", "csl", "delibera",
            "audit-produit", "employees", "operators", "projects", "postes", "common");

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiResponse<Void>> invalidRequest(ResponseStatusException failure) {
        return ResponseEntity.status(failure.getStatusCode()).body(ApiResponse.error(failure.getReason()));
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ApiResponse<Void>> unavailable(DataAccessException failure) {
        log.error("BUSINESS_AUDIT_STORAGE_FAILED errorType={}", failure.getClass().getSimpleName());
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiResponse.error("Historique d'activité indisponible. Prévenez l'administrateur."));
    }

    @GetMapping({"/api/admin/activity-history", "/api/admin/users/{id}/activity-history"})
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<BusinessActivityRepository.Page> history(
            @PathVariable(required = false) Long id,
            @RequestParam(required = false) String actor,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String outcome,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int limit) {
        if (page < 1 || page > 1_000_000 || limit < 1 || limit > 200 || id != null && id < 1
                || actor != null && (actor.isBlank() || actor.length() > 200)
                || module != null && !BusinessActivityFilter.MODULES.contains(module)
                || outcome != null && !Set.of("success", "failed", "reported").contains(outcome)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Filtres d'activité invalides");
        }
        LocalDate start = date(from);
        LocalDate end = date(to);
        if (start != null && end != null && start.isAfter(end))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Période invalide");
        return ApiResponse.ok(repository.find(id, actor, module, outcome, start, end, page, limit));
    }

    private static LocalDate date(String value) {
        try {
            LocalDate date = value == null ? null : LocalDate.parse(value);
            if (date != null && (date.getYear() < 1900 || date.getYear() > 9998)) throw new DateTimeParseException("range", value, 0);
            return date;
        } catch (DateTimeParseException failure) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Date invalide (AAAA-MM-JJ)");
        }
    }

    public record ClientExport(String module, String format) {}

    @PostMapping("/api/activity/client-export")
    @PreAuthorize("isAuthenticated()")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ApiResponse<Void> clientExport(@RequestBody ClientExport export, Authentication actor) {
        if (export.module() == null || !EXPORT_MODULES.contains(export.module()) || !"xlsx".equals(export.format()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Type d'export invalide");
        // A browser report is not proof that a file was saved. Never accept actor, result or filename from it.
        recorder.record(actor, export.module(), "EXPORT_CLIENT", "", "/api/activity/client-export", "reported", 202, 0);
        return ApiResponse.ok(null);
    }
}
