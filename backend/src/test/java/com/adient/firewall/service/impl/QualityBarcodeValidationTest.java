package com.adient.firewall.service.impl;

import com.adient.firewall.dto.QualityRecordInput;
import com.adient.firewall.repository.QualityRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class QualityBarcodeValidationTest {
    @Test
    void rejectsInvalidScanBeforeAnyWriteForFirewallAndCsl() throws Exception {
        QualityRepository repo = mock(QualityRepository.class);
        when(repo.getProjectNames()).thenReturn(List.of("P6"));
        var service = new QualityServiceImpl(repo);
        var input = new ObjectMapper().readValue("{\"barCode\":\"TRUNCATED\"}", QualityRecordInput.class);
        assertThrows(IllegalArgumentException.class, () -> service.createRecord("FIREWALL", "CQFW", input));
        assertThrows(IllegalArgumentException.class, () -> service.createRecord("CSL", "CQCSL", input));
        verify(repo, never()).insertQualityRecord(anyString(), anyString(), anyMap());
        verify(repo, never()).ensureTableColumns(anyString(), anyString());
    }

    @Test
    void routesCompleteFasToTheRecognizedProjectForBothModules() throws Exception {
        QualityRepository repo = mock(QualityRepository.class);
        JdbcTemplate db = mock(JdbcTemplate.class);
        when(repo.getJdbcTemplate()).thenReturn(db);
        when(repo.getProjectNames()).thenReturn(List.of("P6"));
        when(repo.lookupScanBarcode(List.of("P6"), "1234567890")).thenReturn(Optional.of(Map.of("TABLE_NAME", "P6")));
        var input = new ObjectMapper().readValue("{\"barCode\":\"1234567890\",\"codeDef\":\"D1\"}", QualityRecordInput.class);
        var service = new QualityServiceImpl(repo);
        service.createRecord("FIREWALL", "CQFW", input);
        service.createRecord("CSL", "CQCSL", input);
        verify(repo).insertQualityRecord(eq("FIREWALL_P6"), eq("CQFW"), anyMap());
        verify(repo).insertQualityRecord(eq("CSL_P6"), eq("CQCSL"), anyMap());
        verify(repo, never()).lookupBarcode(anyList(), anyString());
    }
}
