package com.adient.firewall.repository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EmployeeTamponRepositoryTest {
    @Mock JdbcTemplate db;
    QualityRepository repo;

    @BeforeEach
    void setUp() {
        repo = new QualityRepository(db);
        when(db.queryForObject("SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME = ?",
                Integer.class, "TAMPONS")).thenReturn(1);
    }

    @Test
    void createsUnknownStampAndReleasesPreviousAssignment() {
        when(db.queryForObject("SELECT COUNT(*) FROM SYSTEM.POLY WHERE UPPER(TAMPON)=UPPER(?) AND MAT<>?",
                Integer.class, "CQ1", "123")).thenReturn(0);
        when(db.queryForObject("SELECT ID FROM SYSTEM.TAMPONS WHERE CODE=UPPER(?)", Long.class, "CQ1")).thenReturn(1L);
        when(db.update(anyString(), any(Object[].class))).thenReturn(1);

        repo.synchronizeEmployeeTampon("CQ1", "123");

        verify(db).update("INSERT INTO SYSTEM.TAMPONS (CODE,DESCRIPTION) VALUES (UPPER(?),?)", "CQ1", "");
        verify(db).update("UPDATE SYSTEM.TAMPONS SET MAT=NULL WHERE MAT=? AND UPPER(CODE)<>UPPER(?)", "123", "CQ1");
    }

    @Test
    void reusesExistingFreeOrOwnStampWithoutRecreatingIt() {
        when(db.queryForList(anyString(), eq("CQ1"))).thenReturn(List.of(Map.of("ID", 1, "CODE", "CQ1")));
        when(db.update(anyString(), eq("123"), eq("CQ1"), eq("123"))).thenReturn(1);

        repo.synchronizeEmployeeTampon("CQ1", "123");

        verify(db, never()).update(startsWith("INSERT"), any(Object[].class));
        verify(db).update("UPDATE SYSTEM.TAMPONS SET MAT=? WHERE UPPER(CODE)=UPPER(?) AND (MAT IS NULL OR MAT=?)",
                "123", "CQ1", "123");
    }

    @Test
    void rejectsStampAssignedInLegacyEmployeeField() {
        when(db.queryForObject("SELECT COUNT(*) FROM SYSTEM.POLY WHERE UPPER(TAMPON)=UPPER(?) AND MAT<>?",
                Integer.class, "CQ1", "123")).thenReturn(1);

        assertThrows(IllegalArgumentException.class, () -> repo.synchronizeEmployeeTampon("CQ1", "123"));

        verify(db, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void rejectsStampClaimedByAnotherEmployeeWithoutReleasingCurrentStamp() {
        when(db.queryForList(anyString(), eq("CQ1"))).thenReturn(List.of(Map.of("ID", 1, "MAT", "456")));

        assertThrows(IllegalArgumentException.class, () -> repo.synchronizeEmployeeTampon("CQ1", "123"));

        verify(db, never()).update("UPDATE SYSTEM.TAMPONS SET MAT=NULL WHERE MAT=? AND UPPER(CODE)<>UPPER(?)", "123", "CQ1");
    }
}
