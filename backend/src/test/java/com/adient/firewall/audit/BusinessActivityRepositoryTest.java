package com.adient.firewall.audit;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BusinessActivityRepositoryTest {
    @Test
    void startupIsAdditiveAndExistingTableRequiresNoDdl() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        when(db.queryForObject(anyString(), eq(Integer.class))).thenReturn(1);
        new BusinessActivityRepository(db).initialize();
        verify(db, never()).execute(anyString());
    }

    @Test
    void firstStartupCreatesOnlyDedicatedTableAndIndexesWithoutHistoricalInsert() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        when(db.queryForObject(anyString(), eq(Integer.class))).thenReturn(0);
        new BusinessActivityRepository(db).initialize();
        var ddl = ArgumentCaptor.forClass(String.class);
        verify(db, times(3)).execute(ddl.capture());
        assertTrue(ddl.getAllValues().stream().allMatch(sql -> sql.startsWith("CREATE ")));
        assertTrue(ddl.getAllValues().stream().allMatch(sql -> sql.contains("USER_BUSINESS_ACTIVITY")));
        assertFalse(ddl.getAllValues().getFirst().contains("FOREIGN KEY"));
    }

    @Test
    void filtersAreBoundNotInterpolatedAndPaginationIsBoundedByCaller() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        BusinessActivityRepository repository = new BusinessActivityRepository(db);
        repository.find(42L, "actor' OR 1=1 --", "delibera", "failed",
                LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 26), 2, 20);
        verify(db).queryForObject(
                eq("SELECT COUNT(*) FROM USER_BUSINESS_ACTIVITY WHERE 1=1 AND USER_ID = ? AND ACTOR = ? AND MODULE = ? AND OUTCOME = ? AND OCCURRED_AT >= ? AND OCCURRED_AT < ?"),
                eq(Long.class), eq(42L), eq("actor' OR 1=1 --"), eq("delibera"), eq("failed"),
                eq(java.sql.Timestamp.valueOf("2026-10-01 00:00:00")),
                eq(java.sql.Timestamp.valueOf("2026-10-27 00:00:00")));
    }
}
