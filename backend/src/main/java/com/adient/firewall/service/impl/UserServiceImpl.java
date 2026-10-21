package com.adient.firewall.service.impl;

import com.adient.firewall.dto.CustomRoleDto;
import com.adient.firewall.dto.LoginHistoryDto;
import com.adient.firewall.dto.UserDto;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.IUserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserServiceImpl implements IUserService {

    private final QualityRepository repo;
    private final PasswordEncoder passwordEncoder;
    private final PermissionService permissionService;

    private static final Set<String> VALID_ROLES =
            Set.of("admin", "supervisor", "operator_manager", "operator");

    // ─── Users ────────────────────────────────────────────────────────────────

    @Override
    public List<UserDto> listUsers() {
        return repo.listUsers();
    }

    @Override
    @Transactional
    public void createUser(String matricule, String fullName, String email, String phone, String role) {
        if (matricule == null || matricule.isBlank()) throw new IllegalArgumentException("Matricule requis");
        if (fullName  == null || fullName.isBlank())  throw new IllegalArgumentException("Nom complet requis");
        if (email     == null || email.isBlank())     throw new IllegalArgumentException("Email requis");
        String r = role != null ? role.toLowerCase().trim() : "operator";
        if (!VALID_ROLES.contains(r)) {
            // allow custom roles: check DB
            List<CustomRoleDto> custom = repo.findAllCustomRoles();
            boolean isCustom = custom.stream().anyMatch(cr -> cr.key().equalsIgnoreCase(r));
            if (!isCustom) throw new IllegalArgumentException("Rôle invalide: " + r);
        }
        repo.insertUser(matricule, fullName, email, phone, r, passwordEncoder.encode(matricule));
    }

    @Override
    @Transactional
    public void updateUser(Long id, String fullName, String email, String phone, String role, boolean active) {
        String r = role != null ? role.toLowerCase().trim() : "";
        if (!r.isBlank() && !VALID_ROLES.contains(r)) {
            List<CustomRoleDto> custom = repo.findAllCustomRoles();
            boolean isCustom = custom.stream().anyMatch(cr -> cr.key().equalsIgnoreCase(r));
            if (!isCustom) throw new IllegalArgumentException("Rôle invalide: " + r);
        }
        repo.updateUser(id, fullName, email, phone, r.isBlank() ? role : r, active);
    }

    @Override
    @Transactional
    public void toggleActive(Long id, boolean active) {
        int rows = repo.getJdbcTemplate().update(
                "UPDATE SYSTEM.APP_USERS SET IS_ACTIVE=? WHERE ID=?", active ? 1 : 0, id);
        if (rows == 0) throw new NoSuchElementException("Utilisateur introuvable: " + id);
    }

    @Override
    @Transactional
    public void unlockUser(Long id) {
        int rows = repo.getJdbcTemplate().update(
                "UPDATE SYSTEM.APP_USERS SET IS_ACTIVE=1, FAILED_ATTEMPTS=0 WHERE ID=?", id);
        if (rows == 0) throw new NoSuchElementException("Utilisateur introuvable: " + id);
    }

    @Override
    @Transactional
    public void deleteUser(Long id) {
        int rows = repo.getJdbcTemplate().update(
                "DELETE FROM SYSTEM.APP_USERS WHERE ID=?", id);
        if (rows == 0) throw new NoSuchElementException("Utilisateur introuvable: " + id);
    }

    @Override
    @Transactional
    public void resetPassword(Long id) {
        List<Map<String, Object>> rows = repo.getJdbcTemplate().queryForList(
                "SELECT MATRICULE FROM SYSTEM.APP_USERS WHERE ID=?", id);
        if (rows.isEmpty()) throw new NoSuchElementException("User not found: " + id);
        String matricule = (String) rows.get(0).get("MATRICULE");
        repo.updatePassword(id, passwordEncoder.encode(matricule));
    }

    @Override
    @Transactional
    public void updateTimeAccess(Long id, String preset, String start, String end) {
        int rows = repo.updateUserTimeAccess(id, preset, start, end);
        if (rows == 0) throw new NoSuchElementException("Utilisateur introuvable: " + id);
    }

    // ─── Login history ────────────────────────────────────────────────────────

    @Override
    public List<LoginHistoryDto> listLoginHistory(Long userId, String dateFrom, String dateTo) {
        return mapHistory(repo.listLoginHistory(userId, dateFrom, dateTo));
    }

    @Override
    public List<LoginHistoryDto> listAllLoginHistory(String matricule, String dateFrom, String dateTo, String status) {
        return mapHistory(repo.listAllLoginHistory(matricule, dateFrom, dateTo, status));
    }

    private List<LoginHistoryDto> mapHistory(List<Map<String, Object>> rows) {
        List<LoginHistoryDto> result = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Object loginAt = r.get("LOGIN_AT");
            result.add(new LoginHistoryDto(
                    toLong(r.get("ID")),
                    toLong(r.get("USER_ID")),
                    (String) r.get("MATRICULE"),
                    (String) r.get("FULL_NAME"),
                    loginAt != null ? loginAt.toString() : null,
                    (String) r.get("IP_ADDRESS"),
                    (String) r.get("SERVER_MAC"),
                    (String) r.get("STATUS")));
        }

        return result;
    }

    @Override
    public List<LoginHistoryDto> selectLoginHistory(Long userId, String matricule, String from, String to, String status) {
        return mapHistory(repo.queryLoginHistory(userId, matricule, from, to, status, true));
    }

    // ─── Permissions ──────────────────────────────────────────────────────────

    @Override
    public Map<String, Map<String, String>> getPermissions() {
        return repo.getPermissions();
    }

    @Override
    @Transactional
    public void savePermissions(Map<String, Map<String, String>> permissions) {
        if (permissions == null) throw new IllegalArgumentException("Permissions requises");
        for (var entry : permissions.entrySet()) {
            if (entry.getValue() == null || entry.getValue().values().stream()
                    .anyMatch(level -> level == null || !Set.of("none", "read", "write", "admin").contains(level))) {
                throw new IllegalArgumentException("Niveau de permission invalide");
            }
            if ("admin".equals(entry.getKey()) && entry.getValue().values().stream().anyMatch(level -> !"admin".equals(level))) {
                throw new IllegalArgumentException("Les droits administrateur sont immuables");
            }
        }
        for (Map.Entry<String, Map<String, String>> roleEntry : permissions.entrySet()) {
            String role = roleEntry.getKey();
            for (Map.Entry<String, String> moduleEntry : roleEntry.getValue().entrySet()) {
                repo.savePermission(role, moduleEntry.getKey(), moduleEntry.getValue());
            }
        }
        invalidatePermissionsAfterCommit();
    }

    // ─── Custom roles ─────────────────────────────────────────────────────────

    @Override
    public List<CustomRoleDto> getCustomRoles() {
        return repo.findAllCustomRoles();
    }

    @Override
    @Transactional
    public void saveCustomRoles(List<CustomRoleDto> roles) {
        if (roles == null) throw new IllegalArgumentException("Rôles requis");
        Set<String> keys = new HashSet<>();
        for (CustomRoleDto role : roles) {
            if (role == null || role.key() == null || !role.key().matches("[a-z0-9_]{1,50}")
                    || VALID_ROLES.contains(role.key()) || Set.of("superviseur", "operateur", "res_operateur").contains(role.key())
                    || !keys.add(role.key()) || role.label() == null || role.label().isBlank()) {
                throw new IllegalArgumentException("Rôle personnalisé invalide ou réservé");
            }
        }
        List<CustomRoleDto> oldRoles = repo.findAllCustomRoles();
        for (CustomRoleDto old : oldRoles) {
            if (!keys.contains(old.key()) && repo.countUsersWithRole(old.key()) > 0) {
                throw new IllegalArgumentException("Le rôle " + old.label() + " est encore affecté à des utilisateurs");
            }
        }
        for (CustomRoleDto old : oldRoles) {
            if (!keys.contains(old.key())) repo.deleteRolePermissions(old.key());
        }
        repo.deleteAllCustomRoles();
        for (CustomRoleDto r : roles) {
            repo.insertCustomRole(r.key(), r.label(), r.color(), r.bg(), r.border());
        }
        invalidatePermissionsAfterCommit();
    }

    private void invalidatePermissionsAfterCommit() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { permissionService.invalidate(); }
            });
        } else {
            permissionService.invalidate();
        }
    }

    private Long toLong(Object o) { return o instanceof Number n ? n.longValue() : null; }
}
