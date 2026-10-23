package com.adient.firewall.controller;

import com.adient.firewall.repository.DeliberaRepository;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.dto.DeliberaReturnRequest;
import com.adient.firewall.exception.GlobalExceptionHandler;
import com.adient.firewall.security.PermissionInterceptor;
import com.adient.firewall.service.impl.PermissionService;
import com.adient.firewall.service.interfaces.IDefautCouturiereService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
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

    @BeforeEach
    void defaultRules() {
        when(quality.getDeliberaScanRules(anyString())).thenReturn(java.util.List.of(
                new com.adient.firewall.dto.ScanRule(null, "", "")));
        when(quality.getDeliberaScanRules(anyString(), anyString())).thenReturn(java.util.List.of(
                new com.adient.firewall.dto.ScanRule(null, "", "")));
        when(quality.getDeliberaScanRules(anyString(), anyString(), anyString())).thenReturn(java.util.List.of(
                new com.adient.firewall.dto.ScanRule(null, "", "")));
    }

    @Test
    void openNokRecordPreservesRecordedLineAndLoadsExactReference() throws Exception {
        when(quality.getProjectNames()).thenReturn(java.util.List.of("P6"));
        when(quality.lookupScanBarcode(java.util.List.of("P6"), "PIECE", false, "V1")).thenReturn(Optional.of(
                Map.of("PDEF", "P1", "DESIGNATION", "Test", "LIGNE", "OTHER")));
        when(repo.findActiveRecordByBarcode("PIECE")).thenReturn(Optional.of(
                Map.of("ID", 1, "PROJET", "P6", "REFERENCE", "REF1", "VERSION", "V1", "LIGNE", "L2")));
        MockMvcBuilders.standaloneSetup(controller).build()
                .perform(get("/api/delibera/barcode/PIECE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.hasOpenRecord").value(true))
                .andExpect(jsonPath("$.data.ligne").value("L2"))
                .andExpect(jsonPath("$.data.pdef").value("P1"))
                .andExpect(jsonPath("$.data.recordId").value(1));
        verify(quality).lookupScanBarcode(java.util.List.of("P6"), "PIECE", false, "V1");
    }

    @Test
    void openRecordWithoutLineExplicitlyReturnsNullLine() throws Exception {
        when(quality.lookupScanBarcode(java.util.List.of("P6"), "PIECE", false, "V1"))
                .thenReturn(Optional.of(Map.of("PDEF", "PIECE")));
        Map<String, Object> record = new HashMap<>(Map.of(
                "ID", 1, "PROJET", "P6", "REFERENCE", "REF1", "VERSION", "V1"));
        record.put("LIGNE", null);
        when(repo.findActiveRecordByBarcode("PIECE")).thenReturn(Optional.of(record));
        MockMvcBuilders.standaloneSetup(controller).build()
                .perform(get("/api/delibera/barcode/PIECE"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"ligne\":null")));
        verify(quality).lookupScanBarcode(java.util.List.of("P6"), "PIECE", false, "V1");
    }

    @Test
    void unknownBarcodeReturnsExplicitErrorWithoutCreatingRecord() throws Exception {
        when(quality.getProjectNames()).thenReturn(java.util.List.of("P6"));
        MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build()
                .perform(get("/api/delibera/barcode/TRUNCATED"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.startsWith("Code-barres erroné")));
        verify(quality).lookupScanBarcode(java.util.List.of("P6"), "TRUNCATED", false);
        verify(repo, never()).insertRecord(anyString(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void exactFasBarcodeLoadsItsReference() throws Exception {
        when(quality.getProjectNames()).thenReturn(java.util.List.of("P6"));
        when(quality.lookupScanBarcode(java.util.List.of("P6"), "FAS1234567", false)).thenReturn(Optional.of(
                Map.of("PDEF", "PDEF12345678", "TABLE_NAME", "P6", "LIGNE", "L1")));
        MockMvcBuilders.standaloneSetup(controller).build()
                .perform(get("/api/delibera/barcode/FAS1234567"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.found").value(true))
                .andExpect(jsonPath("$.data.pdef").value("PDEF12345678"));
    }

    @Test
    void queryRouteAcceptsReferenceWithSlash() throws Exception {
        when(quality.getProjectNames()).thenReturn(java.util.List.of("AUDI"));
        when(quality.lookupScanBarcode(java.util.List.of("AUDI"), "P/1234567890", false)).thenReturn(Optional.of(
                Map.of("PDEF", "P/1234567890", "TABLE_NAME", "AUDI")));
        MockMvcBuilders.standaloneSetup(controller).build()
                .perform(get("/api/delibera/barcode").param("code", "P/1234567890"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pdef").value("P/1234567890"));
    }

    @Test
    void createRecordCannotBypassExactBarcodeValidation() throws Exception {
        MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build()
                .perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/delibera/records")
                        .contentType("application/json").content("{\"barcode\":\"TRUNCATED\",\"projet\":\"P6\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.startsWith("Code-barres erroné")));
        verify(repo, never()).insertRecord(anyString(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void returnedPieceStillBlocksRescan() throws Exception {
        when(repo.findActiveRecordByBarcode("PIECE")).thenReturn(Optional.empty());
        when(repo.hasReturnedRecord("PIECE")).thenReturn(true);
        MockMvcBuilders.standaloneSetup(controller).build()
                .perform(get("/api/delibera/barcode/PIECE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.wasReturnedBefore").value(true));
        verify(quality, never()).lookupScanBarcode(anyList(), anyString(), anyBoolean());
    }

    @Test
    void incompleteCodeCannotPassThroughAnExistingHistoricalRecord() throws Exception {
        when(repo.findActiveRecordByBarcode("123")).thenReturn(Optional.of(
                Map.of("ID", 1, "PROJET", "P6")));
        when(quality.getDeliberaScanRules("P6", "")).thenReturn(java.util.List.of(
                new com.adient.firewall.dto.ScanRule(26, "", "")));
        MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build()
                .perform(get("/api/delibera/barcode").param("code", "123"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.startsWith("Code-barres erroné")));
        verify(repo, never()).hasReturnedRecord(anyString());
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
