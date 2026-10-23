package com.adient.firewall.service.impl;

import com.adient.firewall.repository.QualityRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BarcodeLookupServiceTest {
    @Mock QualityRepository repo;
    @InjectMocks LookupServiceImpl service;

    @Test
    void recognizedScanReturnsReference() {
        when(repo.getProjectNames()).thenReturn(List.of("P6"));
        when(repo.lookupScanBarcode(List.of("P6"), "1234567890")).thenReturn(Optional.of(
                Map.of("PDEF", "123456789012", "TABLE_NAME", "P6", "VERSION", "A")));
        assertEquals("123456789012", service.lookupBarcode("1234567890").get("pdef"));
        verify(repo, never()).lookupBarcode(anyList(), anyString());
    }

    @Test
    void unrecognizedCodeIsRejected() {
        when(repo.getProjectNames()).thenReturn(List.of("P6"));
        var error = assertThrows(IllegalArgumentException.class,
                () -> service.lookupBarcode("ABC123456789012999"));
        assertTrue(error.getMessage().startsWith("Code-barres erroné"));
        verify(repo).lookupScanBarcode(List.of("P6"), "ABC123456789012999");
        verify(repo, never()).lookupBarcode(anyList(), anyString());
    }
}
