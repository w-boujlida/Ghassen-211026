package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.dto.CustomRoleDto;
import com.adient.firewall.dto.LoginHistoryDto;
import com.adient.firewall.dto.UserDto;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.IUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Admin endpoints: user management + maintenance operations.
 * ADMIN: full access.
 * SUPERVISEUR: user management (except role changes).
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR')")
public class AdminController {

    private final IUserService svc;
    private final QualityRepository repo;

    // ─── Maintenance ──────────────────────────────────────────────────────────

    @PostMapping("/migrate-tampons")
    public ResponseEntity<ApiResponse<Map<String, Object>>> migrateTampons() {
        int inserted = repo.migrateTamponsFromPoly();
        return ResponseEntity.ok(ApiResponse.ok(
                Map.of("inserted", inserted),
                "Migration terminée : " + inserted + " tampon(s) insérés depuis POLY.TAMPON"));
    }

    // ─── Users ────────────────────────────────────────────────────────────────

    @GetMapping("/users")
    public ResponseEntity<ApiResponse<List<UserDto>>> listUsers() {
        return ResponseEntity.ok(ApiResponse.ok(svc.listUsers()));
    }

    @PostMapping("/users")
    public ResponseEntity<ApiResponse<Void>> createUser(
            @RequestBody Map<String, Object> body,
            Authentication auth) {
        String role = str(body.get("role"));
        if (!isAdmin(auth) && !role.isEmpty() && !"operator".equalsIgnoreCase(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiResponse.error("Only ADMIN can assign roles other than 'operator'"));
        }
        svc.createUser(
                str(body.get("matricule")),
                str(body.get("fullName")),
                str(body.get("email")),
                str(body.get("phone")),
                isAdmin(auth) ? role : "operator");
        return ResponseEntity.ok(ApiResponse.ok(null, "User created successfully"));
    }

    @PutMapping("/users/{id}")
    public ResponseEntity<ApiResponse<Void>> updateUser(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body,
            Authentication auth) {

        if (body.containsKey("is_active") && body.size() == 1) {
            boolean active = Boolean.TRUE.equals(body.get("is_active")) ||
                    Integer.valueOf(1).equals(body.get("is_active")) ||
                    "1".equals(body.get("is_active")) ||
                    "true".equals(String.valueOf(body.get("is_active")));
            svc.toggleActive(id, active);
            return ResponseEntity.ok(ApiResponse.ok(null, "User status updated"));
        }

        String newRole = str(body.get("role"));
        if (!isAdmin(auth) && !newRole.isEmpty() && !"operator".equalsIgnoreCase(newRole)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiResponse.error("Only ADMIN can modify user roles"));
        }

        boolean active = body.get("is_active") == null || Boolean.TRUE.equals(body.get("is_active")) ||
                Integer.valueOf(1).equals(body.get("is_active"));
        svc.updateUser(id, str(body.get("fullName")), str(body.get("email")),
                str(body.get("phone")), isAdmin(auth) ? newRole : "operator", active);
        return ResponseEntity.ok(ApiResponse.ok(null, "User updated successfully"));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteUser(@PathVariable Long id) {
        svc.deleteUser(id);
        return ResponseEntity.ok(ApiResponse.ok(null, "User deleted successfully"));
    }

    @PostMapping("/users/{id}/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(@PathVariable Long id) {
        svc.resetPassword(id);
        return ResponseEntity.ok(ApiResponse.ok(null, "Password reset to matricule"));
    }

    @PutMapping("/users/{id}/unlock")
    public ResponseEntity<ApiResponse<Void>> unlockUser(@PathVariable Long id) {
        svc.unlockUser(id);
        return ResponseEntity.ok(ApiResponse.ok(null, "Compte débloqué"));
    }

    @PutMapping("/users/{id}/lock")
    public ResponseEntity<ApiResponse<Void>> lockUser(@PathVariable Long id) {
        svc.toggleActive(id, false);
        return ResponseEntity.ok(ApiResponse.ok(null, "Compte suspendu"));
    }

    // ─── Time access ──────────────────────────────────────────────────────────

    @PutMapping("/users/{id}/time-access")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> updateTimeAccess(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        svc.updateTimeAccess(id,
                body.getOrDefault("preset", "always"),
                body.get("start"),
                body.get("end"));
        return ResponseEntity.ok(ApiResponse.ok(null, "Time access updated"));
    }

    // ─── Login history ────────────────────────────────────────────────────────

    @GetMapping("/users/{id}/login-history")
    public ResponseEntity<ApiResponse<List<LoginHistoryDto>>> userLoginHistory(
            @PathVariable Long id,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        return ResponseEntity.ok(ApiResponse.ok(svc.listLoginHistory(id, from, to)));
    }

    @GetMapping("/login-history")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<LoginHistoryDto>>> allLoginHistory(
            @RequestParam(required = false) String matricule,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(ApiResponse.ok(svc.listAllLoginHistory(matricule, from, to, status)));
    }

    // ─── Permissions ──────────────────────────────────────────────────────────

    @GetMapping("/login-history/selection")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<List<LoginHistoryDto>> selectAllHistory(
            @RequestParam(required = false) String matricule,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String status) {
        return ApiResponse.ok(svc.selectLoginHistory(null, matricule, from, to, status));
    }

    @GetMapping("/users/{id}/login-history/selection")
    public ApiResponse<List<LoginHistoryDto>> selectUserHistory(
            @PathVariable Long id,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String status) {
        return ApiResponse.ok(svc.selectLoginHistory(id, null, from, to, status));
    }

    @GetMapping("/permissions")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Map<String, String>>>> getPermissions() {
        return ResponseEntity.ok(ApiResponse.ok(svc.getPermissions()));
    }

    @PutMapping("/permissions")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> savePermissions(
            @RequestBody Map<String, Map<String, String>> body) {
        svc.savePermissions(body);
        return ResponseEntity.ok(ApiResponse.ok(null, "Permissions sauvegardées"));
    }

    // ─── Custom roles ─────────────────────────────────────────────────────────

    @GetMapping("/roles/custom")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<CustomRoleDto>>> getCustomRoles() {
        return ResponseEntity.ok(ApiResponse.ok(svc.getCustomRoles()));
    }

    @PostMapping("/roles/custom")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> saveCustomRoles(
            @RequestBody Map<String, List<CustomRoleDto>> body) {
        List<CustomRoleDto> roles = body.get("roles");
        if (roles == null) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("Champ 'roles' manquant dans le body"));
        }
        svc.saveCustomRoles(roles);
        return ResponseEntity.ok(ApiResponse.ok(null, "Rôles personnalisés sauvegardés"));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private String str(Object o) { return o != null ? o.toString() : ""; }

    private boolean isAdmin(Authentication auth) {
        return auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
    }
}