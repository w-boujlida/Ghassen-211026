package com.adient.firewall.security;

import com.adient.firewall.service.impl.PermissionService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.List;
import java.util.Set;

/**
 * Checks the dynamic role-permission matrix for every API request.
 * Runs AFTER JwtAuthFilter (filters → interceptors ordering in Spring MVC).
 *
 * Logic:
 *   1. Extract role from JWT Claims set by JwtAuthFilter.
 *   2. Admin → always allowed.
 *   3. Map the request path to a module key.
 *   4. GET → requires "read"; POST/PUT/DELETE/PATCH → requires "write".
 *   5. If the role lacks the required level → 403 JSON response.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PermissionInterceptor implements HandlerInterceptor {

    private final PermissionService permSvc;

    private static final Set<String> WRITE_METHODS = Set.of("POST", "PUT", "DELETE", "PATCH");

    /** (urlPrefix, module) — first match wins. */
    private record Rule(String prefix, String module) {}

    private static final List<Rule> RULES = List.of(
            new Rule("/api/admin/users",          "users"),
            new Rule("/api/admin/login-history",  "users"),
            new Rule("/api/admin/permissions",    "users"),
            new Rule("/api/admin/roles",          "users"),
            new Rule("/api/admin/migrate",        "users"),
            new Rule("/api/common/supervisors",   "operators"),
            new Rule("/api/tampons",              "operators"),
            new Rule("/api/operators",            "operators"),
            new Rule("/api/firewall",             "firewall"),
            new Rule("/api/csl",                  "csl"),
            new Rule("/api/delibera-forms",       "delibera_forms"),
            new Rule("/api/delibera",             "delibera"),
            new Rule("/api/audit-forms",          "audit_forms"),
            new Rule("/api/audit-produit",        "audit_produit"),
            new Rule("/api/notifications",        "audit_produit"),
            new Rule("/api/tri",                  "tri"),
            new Rule("/api/echeances",            "echeances"),
            new Rule("/api/projects",             "projects"),
            new Rule("/api/employees",            "operators"),
            new Rule("/api/dashboard",            "overview"),
            new Rule("/api/reports",              "rapports")
    );

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) throws Exception {

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        // Not authenticated → let Spring Security return 401
        if (auth == null || !auth.isAuthenticated()) return true;
        // Non-JWT auth (e.g. OPTIONS pre-flight handled by CORS filter) → skip
        if (!(auth.getDetails() instanceof Claims claims)) return true;

        String role = String.valueOf(claims.get("role")).toLowerCase();
        // Admin bypasses dynamic checks (hardcoded full access)
        if ("admin".equals(role)) return true;

        String path   = request.getRequestURI();
        String method = request.getMethod();

        // GET /api/projects and /api/projects/{name}/refs are read-only display operations
        // used by all pages for filter dropdowns — allow all authenticated users.
        if ("GET".equals(method) && path.startsWith("/api/projects")) return true;

        for (Rule rule : RULES) {
            if (path.startsWith(rule.prefix())) {
                String minLevel = WRITE_METHODS.contains(method) ? "write" : "read";
                if (!permSvc.hasAccess(role, rule.module(), minLevel)) {
                    log.debug("FORBIDDEN: role={} module={} method={} path={}",
                            role, rule.module(), method, path);
                    deny(response,
                            "Accès refusé — permission \"" + rule.module()
                            + "\" insuffisante pour le rôle \"" + role + "\"");
                    return false;
                }
                break; // matched — access granted, stop checking
            }
        }
        return true;
    }

    private void deny(HttpServletResponse response, String message) throws Exception {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json;charset=UTF-8");
        // Escape double-quotes inside message to keep JSON valid
        String safe = message.replace("\"", "'");
        response.getWriter().write("{\"success\":false,\"error\":\"" + safe + "\"}");
    }
}
