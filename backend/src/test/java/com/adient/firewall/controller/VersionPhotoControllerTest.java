package com.adient.firewall.controller;

import com.adient.firewall.exception.GlobalExceptionHandler;
import com.adient.firewall.service.impl.VersionPhotoService;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.Map;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class VersionPhotoControllerTest {
    @Test
    void routesPhotoTupleAndSurfacesInvalidUploadWithoutSuccessFallback() throws Exception {
        var service = mock(VersionPhotoService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new VersionPhotoController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        when(service.get("J4U", "CA", "LEVEL1 TRMA")).thenReturn(Map.of("available", false));
        mvc.perform(get("/api/projects/J4U/version-photo").param("line", "CA").param("version", "LEVEL1 TRMA"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.available").value(false))
                .andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(put("/api/projects/J4U/version-photo").param("line", "").param("version", "")
                .contentType("application/json").content("{\"dataUrl\":\"test-photo\"}")).andExpect(status().isOk());
        verify(service).save("J4U", "", "", "test-photo");
        doThrow(new IllegalArgumentException("Utilisez une photo JPEG ou PNG."))
                .when(service).save("J4U", "", "", "invalid");
        mvc.perform(put("/api/projects/J4U/version-photo").param("line", "").param("version", "")
                .contentType("application/json").content("{\"dataUrl\":\"invalid\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("Utilisez une photo JPEG ou PNG."));
        mvc.perform(delete("/api/projects/J4U/version-photo").param("line", "CA").param("version", "LEVEL1 TRMA"))
                .andExpect(status().isOk());
        verify(service).delete("J4U", "CA", "LEVEL1 TRMA");
    }
}
