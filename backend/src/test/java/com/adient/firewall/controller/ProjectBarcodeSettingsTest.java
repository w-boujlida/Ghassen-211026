package com.adient.firewall.controller;

import com.adient.firewall.service.interfaces.IProjectService;
import com.adient.firewall.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProjectBarcodeSettingsTest {
    private final IProjectService service = mock(IProjectService.class);

    @Test
    void referenceSettingsForwardBothPdefAndVersion() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new ProjectController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(put("/api/projects/P6/reference-scan-settings").param("pdef", "00123").param("version", "A")
                .contentType("application/json").content("{\"barcodeLength\":27,\"rules\":[{\"length\":8,\"prefix\":\"00\",\"suffix\":\"9\"}]}"))
                .andExpect(status().isOk());
        verify(service).setReferenceScanSettings("P6", "00123", "A", 27,
                java.util.List.of(new com.adient.firewall.dto.ScanRule(8, "00", "9")));
        mvc.perform(get("/api/projects/P6/reference-scan-settings").param("version", "A"))
                .andExpect(status().isBadRequest());
        verify(service, never()).setVersionScanSettings(anyString(), anyString(), any(), any());
    }

    @Test
    void versionSettingsRequireVersionAndForwardItWithoutChangingProjectDefaults() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new ProjectController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        when(service.getVersionScanSettings("P6", "A")).thenReturn(java.util.Map.of(
                "configured", true, "barcodeLength", 26, "rules", java.util.List.of(new com.adient.firewall.dto.ScanRule(6, "", ""))));
        mvc.perform(get("/api/projects/P6/version-scan-settings").param("version", "A"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.barcodeLength").value(26));
        mvc.perform(put("/api/projects/P6/version-scan-settings").param("version", "B")
                .contentType("application/json").content("{\"barcodeLength\":30,\"rules\":[{\"length\":8,\"prefix\":\"00\",\"suffix\":\"9\"}]}"))
                .andExpect(status().isOk());
        verify(service).setVersionScanSettings("P6", "B", 30, java.util.List.of(new com.adient.firewall.dto.ScanRule(8, "00", "9")));
        verify(service, never()).setScanSettings(anyString(), any(), any());
        mvc.perform(get("/api/projects/P6/version-scan-settings")).andExpect(status().isBadRequest());
    }

    @Test
    void projectCreationIncludesOptionalLengthAndExistingProjectCanChangeOrClearIt() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new ProjectController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(post("/api/projects").contentType("application/json")
                .content("{\"name\":\"TEST\",\"barcodeLength\":26}")).andExpect(status().isOk());
        verify(service).createProject("TEST", 26, null);
        mvc.perform(post("/api/projects").contentType("application/json")
                .content("{\"name\":\"TEST2\",\"barcodeLength\":26,\"scanRules\":[{\"length\":6,\"prefix\":\"00\",\"suffix\":\"AZ\"},{\"length\":4,\"prefix\":\"B\",\"suffix\":\"9\"}]}"))
                .andExpect(status().isOk());
        verify(service).createProject("TEST2", 26, java.util.List.of(
                new com.adient.firewall.dto.ScanRule(6, "00", "AZ"),
                new com.adient.firewall.dto.ScanRule(4, "B", "9")));
        mvc.perform(put("/api/projects/P6/barcode-length").contentType("application/json")
                .content("{\"barcodeLength\":27}")).andExpect(status().isOk());
        verify(service).setBarcodeLength("P6", 27);
        mvc.perform(put("/api/projects/P6/barcode-length").contentType("application/json")
                .content("{\"barcodeLength\":null}")).andExpect(status().isOk());
        verify(service).setBarcodeLength("P6", null);
        mvc.perform(put("/api/projects/P6/scan-settings").contentType("application/json")
                .content("{\"barcodeLength\":26,\"rules\":[{\"length\":6,\"prefix\":\"00\",\"suffix\":\"AZ\"},{\"length\":4,\"prefix\":\"B\",\"suffix\":\"9\"}]}"))
                .andExpect(status().isOk());
        verify(service).setScanSettings("P6", 26, java.util.List.of(
                new com.adient.firewall.dto.ScanRule(6, "00", "AZ"),
                new com.adient.firewall.dto.ScanRule(4, "B", "9")));
        mvc.perform(put("/api/projects/P6/barcode-length").contentType("application/json")
                .content("{\"barcodeLength\":26.5}")).andExpect(status().isBadRequest());
    }
}
