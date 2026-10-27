package com.adient.firewall.audit;

import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.servlet.HandlerMapping;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BusinessActivityFilterTest {
    private final BusinessActivityRepository repository = mock(BusinessActivityRepository.class);
    private final BusinessActivityFilter filter = new BusinessActivityFilter(new BusinessActivityRecorder(repository));

    private void authenticate() {
        var auth = new UsernamePasswordAuthenticationToken("operator42", null, List.of(new SimpleGrantedAuthority("ROLE_OPERATOR")));
        auth.setDetails(Jwts.claims().add("user_id", 42L).build());
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    private BusinessActivity perform(String method, String route, int status) throws Exception {
        authenticate();
        var request = new MockHttpServletRequest(method, "/irrelevant-raw-path");
        request.setContent("{\"password\":\"SECRET_BODY\",\"barcode\":\"PRIVATE_BODY\"}".getBytes());
        request.addParameter("token", "SECRET_QUERY");
        request.addParameter("password", "SECRET_PASSWORD");
        request.addParameter("projet", "P6");
        request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, route);
        request.setAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE, Map.of("id", "73", "module", "firewall"));
        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> ((MockHttpServletResponse) res).setStatus(status));
        var capture = ArgumentCaptor.forClass(BusinessActivity.class);
        verify(repository).insert(capture.capture());
        return capture.getValue();
    }

    @Test
    void scanSuccessUsesAuthenticatedActorAndOnlySafeContext() throws Exception {
        BusinessActivity event = perform("POST", "/api/delibera/scan-validate", 200);
        assertEquals(42L, event.userId());
        assertEquals("operator42", event.actor());
        assertEquals("SCAN_VALIDATION", event.action());
        assertEquals("success", event.outcome());
        assertEquals("id=73 · projet=P6", event.target());
        assertFalse(event.toString().contains("SECRET"));
        assertFalse(event.toString().contains("PRIVATE_BODY"));
        assertFalse(event.toString().contains("irrelevant-raw-path"));
    }

    @Test
    void validationFailureKeepsHttpOutcome() throws Exception {
        BusinessActivity event = perform("POST", "/api/delibera/scan-validate", 400);
        assertEquals("failed", event.outcome());
        assertEquals(400, event.httpStatus());
    }

    @Test
    void permissionDenialIsRecorded() throws Exception {
        BusinessActivity event = perform("PUT", "/api/{module}/records/{id}", 403);
        assertEquals("firewall", event.module());
        assertEquals("failed", event.outcome());
        assertEquals(403, event.httpStatus());
    }

    @Test
    void passwordActionHasNoBodyOrQuerySecrets() throws Exception {
        assertEquals("PASSWORD_CHANGE", perform("POST", "/api/admin/users/{id}/reset-password", 200).action());
    }

    @Test
    void ordinaryReadsAndAuditQueriesAndLoginNeverRecord() throws Exception {
        authenticate();
        for (String route : List.of("/api/delibera/records", "/api/{module}/records",
                "/api/projects", "/api/admin/activity-history", "/api/admin/users/{id}/activity-history",
                "/api/admin/users/{id}/login-history", "/api/delibera/barcode")) {
            var request = new MockHttpServletRequest("GET", route);
            request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, route);
            filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {});
        }
        assertNull(BusinessActivityFilter.action("POST", "/api/auth/login"));
        assertNull(BusinessActivityFilter.action("POST", "/api/auth/refresh"));
        assertNull(BusinessActivityFilter.action("POST", "/api/activity/client-export"));
        verifyNoInteractions(repository);
    }

    @Test
    void explicitGetExportsAndScanAreBusinessActions() {
        for (String route : List.of("/api/{module}/export", "/api/tri/export",
                "/api/suivi-qualite/rapport/export.xlsx", "/api/defauts-couturiere/rapport/export.pdf"))
            assertEquals("EXPORT", BusinessActivityFilter.action("GET", route));
        assertEquals("SCAN", BusinessActivityFilter.action("GET", "/api/{module}/scan"));
        assertEquals("NOK_TO_OK", BusinessActivityFilter.action("PUT", "/api/delibera/records/{id}/return-to-ok"));
        assertEquals("VALIDATION", BusinessActivityFilter.action("POST", "/api/audit-produit/{id}/verify"));
        assertEquals("IMPORT", BusinessActivityFilter.action("POST", "/api/operators/{kind}/bulk"));
        assertEquals("DELETE", BusinessActivityFilter.action("DELETE", "/api/projects/{name}/refs/bulk"));
    }

    @Test
    void storageFailureCannotTurnCommittedWriteIntoHttpFailure() throws Exception {
        doThrow(new DataAccessResourceFailureException("SECRET_SQL")).when(repository).insert(any());
        assertDoesNotThrow(() -> perform("POST", "/api/delibera/records", 201));
    }
}
