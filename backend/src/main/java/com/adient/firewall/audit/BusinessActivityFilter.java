package com.adient.firewall.audit;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;

public class BusinessActivityFilter extends OncePerRequestFilter {
    public static final Set<String> MODULES = Set.of("users", "firewall", "csl", "delibera",
            "delibera-forms", "audit-forms", "audit-produit", "common", "employees",
            "operators", "postes", "production", "profile", "projects", "tampons",
            "targets", "tri", "echeances", "notifications", "defauts-couturiere", "suivi-qualite", "auth");
    private static final Set<String> WRITES = Set.of("POST", "PUT", "PATCH", "DELETE");
    private static final Set<String> TARGET_KEYS = Set.of("id", "name", "projetCode", "barcode", "code", "mat", "type", "kind");
    private final BusinessActivityRecorder recorder;

    public BusinessActivityFilter(BusinessActivityRecorder recorder) { this.recorder = recorder; }

    public static String action(String method, String route) {
        if (route == null || !route.startsWith("/api/") || route.startsWith("/api/activity/")
                || route.contains("login-history") || route.endsWith("/login") || route.endsWith("/refresh")) return null;
        if ("GET".equals(method)) {
            if (route.endsWith("/export") || route.endsWith("/export.xlsx") || route.endsWith("/export.pdf")) return "EXPORT";
            if (route.equals("/api/{module}/scan")) return "SCAN";
            return null;
        }
        if (!WRITES.contains(method)) return null;
        if (route.contains("password")) return "PASSWORD_CHANGE";
        if (route.endsWith("/return-to-ok")) return "NOK_TO_OK";
        if (route.endsWith("/scan-validate")) return "SCAN_VALIDATION";
        if (route.endsWith("/verify")) return "VALIDATION";
        if (route.endsWith("/checkpoints")) return "CHECKPOINTS";
        if (route.endsWith("/import") || route.endsWith("/bulk") && "POST".equals(method)) return "IMPORT";
        if (route.endsWith("/lock")) return "LOCK";
        if (route.endsWith("/unlock")) return "UNLOCK";
        if (route.endsWith("/records") && route.startsWith("/api/delibera")) return "SCAN_SAVE";
        return switch (method) {
            case "POST" -> "CREATE";
            case "DELETE" -> "DELETE";
            default -> "UPDATE";
        };
    }

    private static String safeIdentifier(String value) {
        return value != null && value.matches("[\\p{L}\\p{N} ._:\\-]{1,100}") ? value : "[masqué]";
    }

    @Override
    @SuppressWarnings("unchecked")
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication actor = SecurityContextHolder.getContext().getAuthentication();
        long started = System.nanoTime();
        boolean completed = false;
        try {
            chain.doFilter(request, response);
            completed = true;
        } finally {
            Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
            String route = pattern instanceof String value ? value : null;
            String action = action(request.getMethod(), route);
            if (actor != null && actor.isAuthenticated() && !"anonymousUser".equals(actor.getPrincipal()) && action != null) {
                Map<String, String> variables = (Map<String, String>) request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
                if (variables == null) variables = Map.of();
                String module = route.split("/")[2];
                if ("{module}".equals(module)) module = variables.get("module");
                if ("admin".equals(module)) module = "users";
                if (module != null && MODULES.contains(module)) {
                    StringJoiner target = new StringJoiner(" · ");
                    variables.entrySet().stream().filter(e -> TARGET_KEYS.contains(e.getKey()))
                            .sorted(Map.Entry.comparingByKey())
                            .forEach(e -> target.add(e.getKey() + "=" + safeIdentifier(e.getValue())));
                    // Only these business identifiers are permitted; never inspect request bodies or arbitrary queries.
                    for (String key : Set.of("projet", "barcode", "barCode")) {
                        String value = request.getParameter(key);
                        if (value != null) target.add(key + "=" + safeIdentifier(value));
                    }
                    String context = target.toString();
                    recorder.recordCompleted(actor, module, action, context.substring(0, Math.min(context.length(), 500)),
                            route, completed ? response.getStatus() : 500, (System.nanoTime() - started) / 1_000_000);
                }
            }
        }
    }
}
