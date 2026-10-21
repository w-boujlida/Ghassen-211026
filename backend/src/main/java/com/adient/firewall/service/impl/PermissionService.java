package com.adient.firewall.service.impl;

import com.adient.firewall.repository.QualityRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Reads the role-permission matrix from DB, caches it for TTL_MS,
 * and exposes a simple hasAccess(role, module, minLevel) check.
 *
 * Spring bean name "permSvc" — usable in @PreAuthorize SpEL:
 *   @PreAuthorize("@permSvc.hasAccess(authentication.details['role'], 'users', 'read')")
 */
@Service("permSvc")
@RequiredArgsConstructor
@Slf4j
public class PermissionService {

    private final QualityRepository repo;

    private final Map<String, Map<String, String>> cache = new ConcurrentHashMap<>();
    private volatile long cacheTime = 0L;
    private static final long TTL_MS = 60_000L; // 1 minute

    private static final Map<String, Integer> LEVELS = Map.of(
            "admin", 3,
            "write", 2,
            "read",  1,
            "none",  0);

    /**
     * Returns true if the given role has at least {@code minLevel} on {@code module}.
     * Admin always returns true.
     */
    public boolean hasAccess(String role, String module, String minLevel) {
        if (role == null) return false;
        if ("admin".equalsIgnoreCase(role)) return true;
        String actual = getPermissionsForRole(role).getOrDefault(module, "none");
        return level(actual) >= level(minLevel);
    }

    /** Returns the full module → permission map for the given role (empty map if unknown). */
    public Map<String, String> getPermissionsForRole(String role) {
        if (role == null) return Map.of();
        return loadCache().getOrDefault(role.toLowerCase(), Map.of());
    }

    /** Call this whenever the matrix changes so the next request fetches fresh data. */
    public void invalidate() {
        cache.clear();
        cacheTime = 0L;
        log.debug("Permission cache invalidated");
    }

    // ─── internals ────────────────────────────────────────────────────────────

    private synchronized Map<String, Map<String, String>> loadCache() {
        if (cache.isEmpty() || System.currentTimeMillis() - cacheTime > TTL_MS) {
            try {
                cache.clear();
                repo.getPermissions().forEach((role, perms) ->
                        cache.put(role.toLowerCase(), perms));
                cacheTime = System.currentTimeMillis();
                log.debug("Permission cache refreshed ({} roles)", cache.size());
            } catch (Exception e) {
                log.warn("Could not load permissions from DB: {}", e.getMessage());
            }
        }
        return cache;
    }

    private int level(String perm) {
        return LEVELS.getOrDefault(perm == null ? "none" : perm.toLowerCase(), 0);
    }
}
