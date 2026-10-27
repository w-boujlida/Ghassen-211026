package com.adient.firewall.controller;

import com.adient.firewall.audit.*;
import com.adient.firewall.config.SecurityConfig;
import com.adient.firewall.config.WebMvcConfig;
import com.adient.firewall.exception.GlobalExceptionHandler;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.security.JwtAuthFilter;
import com.adient.firewall.security.JwtUtil;
import com.adient.firewall.security.PermissionInterceptor;
import com.adient.firewall.service.impl.PermissionService;
import com.adient.firewall.service.interfaces.IUserService;
import jakarta.servlet.Filter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.bind.annotation.*;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BusinessActivityControllerTest {
    @Configuration
    @EnableWebMvc
    @EnableWebSecurity
    @Import({SecurityConfig.class, WebMvcConfig.class, PermissionInterceptor.class, BusinessActivityController.class,
            AdminController.class, GlobalExceptionHandler.class, ScanFixture.class})
    static class Config {
        @Bean JwtUtil jwtUtil() { return new JwtUtil("test-only-key-not-used-outside-this-test", 60_000); }
        @Bean JwtAuthFilter jwtAuthFilter(JwtUtil jwt) { return new JwtAuthFilter(jwt); }
        @Bean BusinessActivityRepository repository() { return mock(BusinessActivityRepository.class); }
        @Bean BusinessActivityRecorder recorder(BusinessActivityRepository repository) { return new BusinessActivityRecorder(repository); }
        @Bean QualityRepository qualityRepository() { return mock(QualityRepository.class); }
        @Bean IUserService users() { return mock(IUserService.class); }
        @Bean PermissionService permissions() {
            PermissionService service = mock(PermissionService.class);
            when(service.hasAccess(anyString(), anyString(), anyString())).thenReturn(true);
            return service;
        }
    }

    @RestController
    static class ScanFixture {
        @PostMapping("/api/delibera/scan-validate")
        public void scan(@RequestBody java.util.Map<String, String> body) {
            if ("invalid".equals(body.get("barcode"))) throw new IllegalArgumentException("Scan invalide");
        }
    }

    private AnnotationConfigWebApplicationContext context;
    private MockMvc mvc;
    private BusinessActivityRepository repository;
    private String token(String role) {
        return "Bearer " + context.getBean(JwtUtil.class).generate("test-actor", "Test", role, 42);
    }

    @BeforeEach
    void setup() {
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.register(Config.class);
        context.refresh();
        repository = context.getBean(BusinessActivityRepository.class);
        when(repository.find(any(), any(), any(), any(), any(), any(), anyInt(), anyInt()))
                .thenReturn(new BusinessActivityRepository.Page(List.of(), 0, 1, 50));
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(context.getBean("springSecurityFilterChain", Filter.class)).build();
        clearInvocations(repository);
    }

    @AfterEach
    void close() { context.close(); }

    @Test
    void adminCanReadGlobalAndPerUserButAllOtherRolesAreDenied() throws Exception {
        for (String path : List.of("/api/admin/activity-history", "/api/admin/users/42/activity-history")) {
            mvc.perform(get(path).header("Authorization", token("admin")))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.rows").isArray());
            for (String role : List.of("superviseur", "supervisor", "operator", "custom"))
                mvc.perform(get(path).header("Authorization", token(role))).andExpect(status().isForbidden());
            mvc.perform(get(path)).andExpect(status().isForbidden());
        }
        verify(repository, times(2)).find(any(), any(), any(), any(), any(), any(), anyInt(), anyInt());
        verify(repository, never()).insert(any());
    }

    @Test
    void invalidPaginationModulesOutcomesAndDatesReturn400NotSilentClamping() throws Exception {
        for (String[] parameter : List.of(new String[]{"page", "0"}, new String[]{"limit", "201"},
                new String[]{"page", "1000001"}, new String[]{"module", "unknown"},
                new String[]{"outcome", "unknown"}, new String[]{"from", "2026-02-30"},
                new String[]{"to", "9999-12-31"})) {
            mvc.perform(get("/api/admin/activity-history").header("Authorization", token("admin"))
                    .param(parameter[0], parameter[1])).andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/admin/activity-history").header("Authorization", token("admin"))
                .param("from", "2026-10-27").param("to", "2026-10-26")).andExpect(status().isBadRequest());
        verifyNoInteractions(repository);
    }

    @Test
    void filtersReachRepositoryAndPerUserScopeCannotBeOverridden() throws Exception {
        mvc.perform(get("/api/admin/users/42/activity-history").header("Authorization", token("admin"))
                .param("module", "delibera").param("outcome", "failed").param("from", "2026-10-01")
                .param("to", "2026-10-26").param("page", "2").param("limit", "20").param("userId", "99"))
                .andExpect(status().isOk());
        verify(repository).find(eq(42L), isNull(), eq("delibera"), eq("failed"),
                eq(java.time.LocalDate.of(2026, 10, 1)), eq(java.time.LocalDate.of(2026, 10, 26)), eq(2), eq(20));
    }

    @Test
    void clientExportUsesAuthenticatedOwnerAndIsNeverTrustedAsSuccess() throws Exception {
        mvc.perform(post("/api/activity/client-export").header("Authorization", token("operator"))
                .contentType("application/json")
                .content("{\"module\":\"projects\",\"format\":\"xlsx\",\"userId\":99,\"actor\":\"admin\",\"outcome\":\"success\"}"))
                .andExpect(status().isAccepted());
        var event = ArgumentCaptor.forClass(BusinessActivity.class);
        verify(repository).insert(event.capture());
        assertEquals(42L, event.getValue().userId());
        assertEquals("test-actor", event.getValue().actor());
        assertEquals("reported", event.getValue().outcome());
        assertEquals("EXPORT_CLIENT", event.getValue().action());
        assertEquals("", event.getValue().target());
        mvc.perform(post("/api/activity/client-export").header("Authorization", token("operator"))
                .contentType("application/json").content("{\"module\":\"invented\",\"format\":\"xlsx\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/activity/client-export").contentType("application/json")
                .content("{\"module\":\"projects\",\"format\":\"xlsx\"}")).andExpect(status().isForbidden());
        verify(repository, times(1)).insert(any());
    }

    @Test
    void databaseFailuresAreVisibleWithoutLeakingSql() throws Exception {
        when(repository.find(any(), any(), any(), any(), any(), any(), anyInt(), anyInt()))
                .thenThrow(new DataAccessResourceFailureException("SECRET_SQL"));
        mvc.perform(get("/api/admin/activity-history").header("Authorization", token("admin")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("SECRET_SQL"))));
        doThrow(new DataAccessResourceFailureException("SECRET_SQL")).when(repository).insert(any());
        mvc.perform(post("/api/activity/client-export").header("Authorization", token("operator"))
                .contentType("application/json").content("{\"module\":\"projects\",\"format\":\"xlsx\"}"))
                .andExpect(status().isServiceUnavailable());
    }

    @Test
    void existingSupervisorPerUserLoginHistoryPermissionIsUnchanged() throws Exception {
        mvc.perform(get("/api/admin/users/42/login-history").header("Authorization", token("superviseur")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/admin/login-history").header("Authorization", token("superviseur")))
                .andExpect(status().isForbidden());
    }

    @Test
    void securityChainRecordsActualScanValidationAndDynamicPermissionDenial() throws Exception {
        for (String code : List.of("valid", "invalid")) {
            mvc.perform(post("/api/delibera/scan-validate").header("Authorization", token("operator"))
                    .contentType("application/json").content("{\"barcode\":\"" + code + "\"}"))
                    .andExpect(status().is(code.equals("valid") ? 200 : 400));
        }
        when(context.getBean(PermissionService.class).hasAccess("operator", "delibera", "write")).thenReturn(false);
        mvc.perform(post("/api/delibera/scan-validate").header("Authorization", token("operator"))
                .contentType("application/json").content("{\"barcode\":\"valid\"}")).andExpect(status().isForbidden());
        var events = ArgumentCaptor.forClass(BusinessActivity.class);
        verify(repository, times(3)).insert(events.capture());
        assertEquals(List.of(200, 400, 403), events.getAllValues().stream().map(BusinessActivity::httpStatus).toList());
        assertTrue(events.getAllValues().stream().allMatch(event -> event.userId() == 42 && event.action().equals("SCAN_VALIDATION")));
    }
}
