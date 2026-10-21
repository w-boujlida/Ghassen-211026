package com.adient.firewall.controller;

import com.adient.firewall.repository.DeliberaRepository;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.dto.DeliberaReturnRequest;
import com.adient.firewall.exception.GlobalExceptionHandler;
import com.adient.firewall.security.PermissionInterceptor;
import com.adient.firewall.service.impl.PermissionService;
import com.adient.firewall.service.interfaces.IDefautCouturiereService;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class DeliberaScanTypeTest {
    private final DeliberaRepository repo = mock(DeliberaRepository.class);
    private final QualityRepository quality = mock(QualityRepository.class);
    private final DeliberaController controller = new DeliberaController(
            repo, quality, mock(IDefautCouturiereService.class));

    @Test
    void openNokRecordIncludesItsRecordedLineWithoutReferenceLookup() throws Exception {
        when(repo.findActiveRecordByBarcode("PIECE")).thenReturn(Optional.of(
                Map.of("ID", 1, "PROJET", "P6", "REFERENCE", "REF1", "VERSION", "V1", "LIGNE", "L2")));
        MockMvcBuilders.standaloneSetup(controller).build()
                .perform(get("/api/delibera/barcode/PIECE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.hasOpenRecord").value(true))
                .andExpect(jsonPath("$.data.ligne").value("L2"))
                .andExpect(jsonPath("$.data.recordId").value(1));
        verifyNoInteractions(quality);
    }

    @Test
    void openRecordWithoutLineExplicitlyReturnsNullLine() throws Exception {
        Map<String, Object> record = new HashMap<>(Map.of(
                "ID", 1, "PROJET", "P6", "REFERENCE", "REF1", "VERSION", "V1"));
        record.put("LIGNE", null);
        when(repo.findActiveRecordByBarcode("PIECE")).thenReturn(Optional.of(record));
        MockMvcBuilders.standaloneSetup(controller).build()
                .perform(get("/api/delibera/barcode/PIECE"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"ligne\":null")));
        verifyNoInteractions(quality);
    }

    @Test
    void returnedPieceStillBlocksRescanWithoutReferenceLookup() throws Exception {
        when(repo.findActiveRecordByBarcode("PIECE")).thenReturn(Optional.empty());
        when(repo.hasReturnedRecord("PIECE")).thenReturn(true);
        MockMvcBuilders.standaloneSetup(controller).build()
                .perform(get("/api/delibera/barcode/PIECE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.wasReturnedBefore").value(true));
        verifyNoInteractions(quality);
    }

    @Test void returnEndpointPassesEvidenceAndSurfacesValidationErrors() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(put("/api/delibera/records/1/return-to-ok")
                .contentType("application/json").content("{\"justification\":\"Contrôle conforme\",\"resolvedDefectIds\":[11]}"))
                .andExpect(status().isOk());
        verify(repo).returnToOk(1, new DeliberaReturnRequest("Contrôle conforme", java.util.List.of(11L)), "unknown");
        doThrow(new IllegalArgumentException("Justificatif requis")).when(repo)
                .returnToOk(1, new DeliberaReturnRequest(null, java.util.List.of()), "unknown");
        mvc.perform(put("/api/delibera/records/1/return-to-ok")
                .contentType("application/json").content("{\"resolvedDefectIds\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Justificatif requis"));
    }

    @Test void directStatusChangeCannotBypassReturnEvidence() throws Exception {
        MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build()
                .perform(patch("/api/delibera/records/1/status").contentType("application/json")
                        .content("{\"statut\":\"RETURNED\"}"))
                .andExpect(status().isBadRequest());
        verify(repo, never()).updateRecordStatut(anyLong(), anyString());
    }

    @Test void verificationRejectsDefectFromAnotherPieceBeforeWriting() throws Exception {
        when(repo.lockRecordStatus(1)).thenReturn("NOT_RETURNED");
        when(repo.findDefautsByRecordId(1)).thenReturn(java.util.List.of(Map.of("ID", 11L, "VERIFIE", 0)));
        MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build()
                .perform(put("/api/delibera/records/1/verify").contentType("application/json")
                        .content("{\"defautsVerifies\":[{\"id\":99,\"verifie\":true}]}"))
                .andExpect(status().isBadRequest());
        verify(repo, never()).updateDefautVerifie(anyLong(), anyBoolean());
    }

    @Test void returnRouteRequiresDeliberaWritePermission() throws Exception {
        PermissionService permissions = mock(PermissionService.class);
        var auth = new org.springframework.security.authentication.UsernamePasswordAuthenticationToken("TEST", "", java.util.List.of());
        auth.setDetails(io.jsonwebtoken.Jwts.claims().add("role", "operator").build());
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);
        try {
            var interceptor = new PermissionInterceptor(permissions);
            var request = new org.springframework.mock.web.MockHttpServletRequest("PUT", "/api/delibera/records/1/return-to-ok");
            var response = new org.springframework.mock.web.MockHttpServletResponse();
            org.junit.jupiter.api.Assertions.assertFalse(interceptor.preHandle(request, response, new Object()));
            org.junit.jupiter.api.Assertions.assertEquals(403, response.getStatus());
            when(permissions.hasAccess("operator", "delibera", "write")).thenReturn(true);
            org.junit.jupiter.api.Assertions.assertTrue(interceptor.preHandle(request,
                    new org.springframework.mock.web.MockHttpServletResponse(), new Object()));
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }
}
