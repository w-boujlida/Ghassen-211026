package com.adient.firewall.service.impl;

import com.adient.firewall.repository.QualityRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProjectServiceImplTest {

    @Mock
    private QualityRepository repo;

    @InjectMocks
    private ProjectServiceImpl service;

    @Test
    void createsProjectBeforeSavingLengthExactlyOnce() {
        var db = mock(org.springframework.jdbc.core.JdbcTemplate.class);
        when(repo.getJdbcTemplate()).thenReturn(db);
        service.createProject("NEWPROJECT", 26);
        verify(db, times(7)).execute(anyString());
        verify(repo, times(1)).setBarcodeLength("NEWPROJECT", 26);
    }

    @Test
    void invalidScanLengthCannotCreateProjectTables() {
        assertThrows(IllegalArgumentException.class, () -> service.createProject("NEWPROJECT", 0));
        verifyNoInteractions(repo);
    }

    @Test
    void photoOwnershipFollowsProjectRenameAndDeletion() {
        var db = mock(org.springframework.jdbc.core.JdbcTemplate.class);
        when(repo.getJdbcTemplate()).thenReturn(db);
        when(repo.tableExists("CUSTOM")).thenReturn(true);
        when(repo.tableExists("RENAMED")).thenReturn(false, true);
        service.renameProject("CUSTOM", "RENAMED");
        verify(db).update("UPDATE SYSTEM.PROJECT_VERSION_PHOTOS SET PROJECT_NAME=? WHERE PROJECT_NAME=?",
                "RENAMED", "CUSTOM");
        verify(db).update("UPDATE SYSTEM.DELIBERA_SCAN_RULES SET PROJECT_NAME=? WHERE PROJECT_NAME=?",
                "RENAMED", "CUSTOM");
        verify(db).update("UPDATE SYSTEM.REF_SCAN_SETTINGS SET PROJECT_NAME=? WHERE PROJECT_NAME=?",
                "RENAMED", "CUSTOM");
        service.deleteProject("RENAMED");
        verify(db).update("DELETE FROM SYSTEM.PROJECT_VERSION_PHOTOS WHERE PROJECT_NAME=?", "RENAMED");
        verify(db).update("DELETE FROM SYSTEM.DELIBERA_SCAN_RULES WHERE PROJECT_NAME=?", "RENAMED");
        verify(db).update("DELETE FROM SYSTEM.REF_SCAN_SETTINGS WHERE PROJECT_NAME=?", "RENAMED");
    }

    @Test
    void newProjectSavesValidatedRulesAndSettingsDoNotWriteOnInvalidRule() {
        var db = mock(org.springframework.jdbc.core.JdbcTemplate.class);
        when(repo.getJdbcTemplate()).thenReturn(db);
        var rules = List.of(new com.adient.firewall.dto.ScanRule(6, "00", "AZ"),
                new com.adient.firewall.dto.ScanRule(4, "B", "9"));
        service.createProject("CUSTOM", 26, rules);
        verify(repo).setDeliberaScanRules("CUSTOM", rules);
        clearInvocations(repo);
        assertThrows(IllegalArgumentException.class, () -> service.setScanSettings("CUSTOM", 26,
                List.of(new com.adient.firewall.dto.ScanRule(2, "AB", "CD"))));
        verifyNoInteractions(repo);
    }

    @Test
    void reservedSystemTableNameGetsClearMessage() {
        IllegalStateException exception = assertThrows(IllegalStateException.class,
                () -> service.createProject("ref_checkpoints"));

        assertEquals("Le nom « REF_CHECKPOINTS » est réservé par le système.", exception.getMessage());
        verifyNoInteractions(repo);
    }

    @Test
    void existingProjectStillGetsDuplicateMessage() {
        when(repo.tableExists("MYPROJECT")).thenReturn(true);

        IllegalStateException exception = assertThrows(IllegalStateException.class,
                () -> service.createProject("MYPROJECT"));

        assertEquals("Project 'MYPROJECT' already exists.", exception.getMessage());
        verify(repo).tableExists("MYPROJECT");
    }

    @Test
    void listsReferenceMetadataForDedicatedViews() {
        List<Map<String, Object>> messages = List.of(Map.of("PROJECT_NAME", "AUDI", "PDEF", "P1", "MESSAGE", "Check"));
        List<Map<String, Object>> checkpoints = List.of(Map.of("PROJECT_NAME", "AUDI", "PDEF", "P1", "CHECKPOINT", "Line 1"));
        when(repo.getAllRefVerifMessages()).thenReturn(messages);
        when(repo.getAllRefCheckpoints()).thenReturn(checkpoints);

        assertEquals(messages, service.getAllRefVerifMessages());
        assertEquals(checkpoints, service.getAllRefCheckpoints());
    }

    @Test
    void normalizesMetadataAndRemovesDuplicateCheckpointsInOrder() {
        service.setRefVerifMessages("audi", " P/1 ", List.of(" Message ", "", "Message", "Second"));
        service.setRefCheckpoints("audi", " P/1 ", List.of(" Couture ", "Couture", "Etiquette"));

        verify(repo).setRefVerifMessages("AUDI", "P/1", List.of("Message", "Second"));
        verify(repo).setRefCheckpoints("AUDI", "P/1", List.of("Couture", "Etiquette"));
    }

    @Test
    void rejectsInvalidMetadataBeforeDeletingExistingRows() {
        assertThrows(IllegalArgumentException.class,
                () -> service.setRefVerifMessages("AUDI", "P1", List.of("X".repeat(501))));
        assertThrows(IllegalArgumentException.class,
                () -> service.setRefCheckpoints("AUDI", "P1", List.of("X".repeat(501))));
        assertThrows(IllegalArgumentException.class,
                () -> service.setRefCheckpoints("AUDI", " ", List.of("Check")));
        assertThrows(IllegalArgumentException.class,
                () -> service.setRefVerifMessages("AUDI", "P1", null));
        verifyNoInteractions(repo);
    }

    @Test
    void permitsExplicitlyClearingMetadata() {
        service.setRefVerifMessages("AUDI", "P1", List.of());
        service.setRefCheckpoints("AUDI", "P1", List.of());
        verify(repo).setRefVerifMessages("AUDI", "P1", List.of());
        verify(repo).setRefCheckpoints("AUDI", "P1", List.of());
    }
}
