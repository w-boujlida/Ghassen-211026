package com.adient.firewall.security;

import com.adient.firewall.service.impl.PermissionService;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OperatorBulkPermissionTest {

    @AfterEach
    void cleanup() { SecurityContextHolder.clearContext(); }

    @Test
    void bulkRoutesRequireOperatorsWritePermission() throws Exception {
        PermissionService permissions = mock(PermissionService.class);
        PermissionInterceptor interceptor = new PermissionInterceptor(permissions);
        var auth = new UsernamePasswordAuthenticationToken("user", "", List.of());
        auth.setDetails(Jwts.claims().add("role", "superviseur").build());
        SecurityContextHolder.getContext().setAuthentication(auth);
        for (String kind : List.of("employees", "supervisors", "tampons", "couturieres")) {
            var response = new MockHttpServletResponse();
            assertFalse(interceptor.preHandle(new MockHttpServletRequest("POST", "/api/operators/" + kind + "/bulk"), response, new Object()));
            assertEquals(403, response.getStatus());
        }
        verify(permissions, times(4)).hasAccess("superviseur", "operators", "write");
        when(permissions.hasAccess("superviseur", "operators", "write")).thenReturn(true);
        assertTrue(interceptor.preHandle(new MockHttpServletRequest("POST", "/api/operators/employees/bulk"),
                new MockHttpServletResponse(), new Object()));
    }

    @Test
    void configurationRouteRequiresUsersWritePermission() throws Exception {
        PermissionService permissions = mock(PermissionService.class);
        var interceptor = new PermissionInterceptor(permissions);
        var auth = new UsernamePasswordAuthenticationToken("user", "", List.of());
        auth.setDetails(Jwts.claims().add("role", "supervisor").build());
        SecurityContextHolder.getContext().setAuthentication(auth);
        String route = "/api/admin/permissions/configuration";
        var response = new MockHttpServletResponse();
        assertFalse(interceptor.preHandle(new MockHttpServletRequest("PUT", route), response, new Object()));
        assertEquals(403, response.getStatus());
        when(permissions.hasAccess("supervisor", "users", "write")).thenReturn(true);
        assertTrue(interceptor.preHandle(new MockHttpServletRequest("PUT", route), new MockHttpServletResponse(), new Object()));
    }
}
