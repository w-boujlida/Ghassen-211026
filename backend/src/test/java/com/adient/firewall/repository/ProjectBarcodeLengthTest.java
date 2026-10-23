package com.adient.firewall.repository;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProjectBarcodeLengthTest {
    private final QualityRepository repo = spy(new QualityRepository(mock(JdbcTemplate.class)));

    @Test
    void allowsSerialSuffixAndAllCharacterTypesAtConfiguredLength() {
        doReturn(26).when(repo).getBarcodeLength("P6");
        repo.validateBarcodeLength("P6", "123456789012ABC/+-98765432");
    }

    @Test
    void distinguishesMissingAndExtraCharacters() {
        doReturn(26).when(repo).getBarcodeLength("P6");
        assertTrue(assertThrows(IllegalArgumentException.class,
                () -> repo.validateBarcodeLength("P6", "123")).getMessage().contains("23 caractère(s) manquant(s)"));
        assertTrue(assertThrows(IllegalArgumentException.class,
                () -> repo.validateBarcodeLength("P6", "x".repeat(27))).getMessage().contains("1 caractère(s) en trop"));
    }

    @Test
    void unconfiguredProjectDoesNotImposeLengthOrCharacterType() {
        doReturn(null).when(repo).getBarcodeLength("P6");
        repo.validateBarcodeLength("P6", "12*ABC/12345678901234567890123456");
        assertThrows(IllegalArgumentException.class, () -> repo.validateBarcodeLength("P6", ""));
    }

    @Test
    void invalidLengthIsRejectedBeforeSaving() {
        assertThrows(IllegalArgumentException.class, () -> repo.setBarcodeLength("P6", 0));
        assertThrows(IllegalArgumentException.class, () -> repo.setBarcodeLength("P6", 101));
        QualityRepository.checkBarcodeLengthSetting(null);
        QualityRepository.checkBarcodeLengthSetting(26);
    }

    @Test
    void fullBarcodeWithReferencePrefixAndSuffixIsAccepted() {
        var db = mock(JdbcTemplate.class);
        var repository = spy(new QualityRepository(db));
        doReturn(26).when(repository).getBarcodeLength("P6");
        when(db.queryForList(anyString(), eq("123456789012ABC/+-98765432"),
                eq("123456789012ABC/+-98765432")))
                .thenReturn(List.of(Map.of("TABLE_NAME", "P6", "PDEF", "123456789012")));
        assertTrue(repository.lookupScanBarcode(List.of("P6"), "123456789012ABC/+-98765432").isPresent());
        when(db.queryForList(anyString(), eq("123456789012"), eq("123456789012")))
                .thenReturn(List.of(Map.of("TABLE_NAME", "P6", "PDEF", "123456789012")));
        assertThrows(IllegalArgumentException.class,
                () -> repository.lookupScanBarcode(List.of("P6"), "123456789012"));
    }

    @Test
    void lookupChecksRecognizedVersionInsteadOfProjectLength() {
        var db = mock(JdbcTemplate.class);
        var repository = spy(new QualityRepository(db));
        doReturn(Map.of("barcodeLength", 6)).when(repository).getVersionScanSettings("P6", "A");
        doReturn(Map.of("barcodeLength", 8)).when(repository).getVersionScanSettings("P6", "B");
        when(db.queryForList(anyString(), eq("ABC123"), eq("ABC123")))
                .thenReturn(List.of(Map.of("TABLE_NAME", "P6", "VERSION", "A")));
        when(db.queryForList(anyString(), eq("XYZ123"), eq("XYZ123")))
                .thenReturn(List.of(Map.of("TABLE_NAME", "P6", "VERSION", "B")));
        assertTrue(repository.lookupScanBarcode(List.of("P6"), "ABC123").isPresent());
        assertThrows(IllegalArgumentException.class, () -> repository.lookupScanBarcode(List.of("P6"), "XYZ123"));
        verify(repository, never()).validateBarcodeLength(anyString(), anyString());
    }

    @Test
    void sameVersionUsesDifferentLengthForEachRecognizedPdef() {
        var db = mock(JdbcTemplate.class);
        var repository = spy(new QualityRepository(db));
        doReturn(Map.of("barcodeLength", 6)).when(repository).getReferenceScanSettings("P6", "001", "A");
        doReturn(Map.of("barcodeLength", 8)).when(repository).getReferenceScanSettings("P6", "002", "A");
        when(db.queryForList(anyString(), eq("001XYZ"), eq("001XYZ")))
                .thenReturn(List.of(Map.of("TABLE_NAME", "P6", "PDEF", "001", "VERSION", "A")));
        when(db.queryForList(anyString(), eq("002XYZ"), eq("002XYZ")))
                .thenReturn(List.of(Map.of("TABLE_NAME", "P6", "PDEF", "002", "VERSION", "A")));
        assertTrue(repository.lookupScanBarcode(List.of("P6"), "001XYZ").isPresent());
        assertThrows(IllegalArgumentException.class, () -> repository.lookupScanBarcode(List.of("P6"), "002XYZ"));
    }
}
