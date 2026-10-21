package com.adient.firewall.repository;

import com.adient.firewall.dto.DeliberaReturnRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@SpringJUnitConfig(DeliberaReturnTest.Config.class)
class DeliberaReturnTest {
    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    static class Config {
        @Bean DataSource dataSource() { return mock(DataSource.class); }
        @Bean JdbcTemplate db() {
            JdbcTemplate db = mock(JdbcTemplate.class);
            when(db.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(1);
            return db;
        }
        @Bean JdbcTransactionManager oracleTransactionManager(DataSource ds) { return new JdbcTransactionManager(ds); }
        @Bean DeliberaRepository repo(JdbcTemplate db) { return new DeliberaRepository(db); }
    }

    @Autowired DeliberaRepository repo;
    @Autowired JdbcTemplate db;
    @Autowired DataSource ds;
    Connection connection;

    @BeforeEach void setup() throws Exception {
        reset(db, ds);
        connection = mock(Connection.class);
        when(ds.getConnection()).thenReturn(connection);
        when(connection.getAutoCommit()).thenReturn(true);
        when(db.queryForMap(anyString(), any(Object[].class))).thenReturn(Map.of("STATUT_REPRISE", "NOT_RETURNED"));
        when(db.queryForList(anyString(), any(Object[].class))).thenReturn(
                List.of(Map.of("ID", 11L, "VERIFIE", 0), Map.of("ID", 12L, "VERIFIE", 0)));
        when(db.update(anyString(), any(Object[].class))).thenReturn(1);
    }

    @Test void justificationReturnsExistingRecordWithoutClaimingUnresolvedDefectsAreResolved() throws Exception {
        repo.returnToOk(1, new DeliberaReturnRequest("  Réparation contrôlée  ", List.of()), "TEST");
        verify(db).update(startsWith("UPDATE SYSTEM.DELIBERA_RECORDS SET STATUT_REPRISE='RETURNED'"),
                eq("Réparation contrôlée"), eq("TEST"), eq(1L));
        verify(db, never()).update(startsWith("UPDATE SYSTEM.DELIBERA_RECORD_DEFAUTS"), any(Object[].class));
        verify(connection).commit();
    }

    @Test void allSelectedDefectsAllowReturnWithoutJustification() {
        repo.returnToOk(1, new DeliberaReturnRequest(null, List.of(11L, 12L)), "TEST");
        verify(db).update("UPDATE SYSTEM.DELIBERA_RECORD_DEFAUTS SET VERIFIE=1 WHERE ID=? AND RECORD_ID=?", 11L, 1L);
        verify(db).update("UPDATE SYSTEM.DELIBERA_RECORD_DEFAUTS SET VERIFIE=1 WHERE ID=? AND RECORD_ID=?", 12L, 1L);
        verify(db).update(startsWith("UPDATE SYSTEM.DELIBERA_RECORDS SET STATUT_REPRISE='RETURNED'"),
                isNull(), eq("TEST"), eq(1L));
    }

    @Test void rejectsMissingEvidencePartialSelectionForeignIdsDuplicatesAndLongJustification() {
        for (DeliberaReturnRequest request : List.of(
                new DeliberaReturnRequest("  ", List.of()),
                new DeliberaReturnRequest(null, List.of(11L)),
                new DeliberaReturnRequest("Reason", List.of(999L)),
                new DeliberaReturnRequest("Reason", List.of(11L, 11L)),
                new DeliberaReturnRequest("Reason", Arrays.asList(11L, null)),
                new DeliberaReturnRequest("X".repeat(2001), List.of()))) {
            assertThrows(IllegalArgumentException.class, () -> repo.returnToOk(1, request, "TEST"));
        }
        assertThrows(IllegalArgumentException.class, () -> repo.returnToOk(1, null, "TEST"));
        verify(db, never()).update(anyString(), any(Object[].class));
    }

    @Test void noDefectsRequiresJustification() {
        when(db.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
        assertThrows(IllegalArgumentException.class, () -> repo.returnToOk(1,
                new DeliberaReturnRequest(null, List.of()), "TEST"));
        repo.returnToOk(1, new DeliberaReturnRequest("Contrôle manuel conforme", List.of()), "TEST");
    }

    @Test void alreadyVerifiedDefectsCountAsResolved() {
        when(db.queryForList(anyString(), any(Object[].class))).thenReturn(
                List.of(Map.of("ID", 11L, "VERIFIE", 1), Map.of("ID", 12L, "VERIFIE", 0)));
        repo.returnToOk(1, new DeliberaReturnRequest(null, List.of(12L)), "TEST");
    }

    @Test void alreadyOkCannotBeReturnedTwice() {
        when(db.queryForMap(anyString(), any(Object[].class))).thenReturn(Map.of("STATUT_REPRISE", "RETURNED"));
        assertThrows(IllegalStateException.class, () -> repo.returnToOk(1,
                new DeliberaReturnRequest("Reason", List.of()), "TEST"));
        verify(db, never()).update(anyString(), any(Object[].class));
    }

    @Test void failureAfterDefectUpdateRollsBackEverything() throws Exception {
        doThrow(new org.springframework.dao.DataIntegrityViolationException("Write failed"))
                .when(db).update(startsWith("UPDATE SYSTEM.DELIBERA_RECORDS"), any(Object[].class));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class, () -> repo.returnToOk(1,
                new DeliberaReturnRequest(null, List.of(11L, 12L)), "TEST"));
        verify(connection).rollback();
        verify(connection, never()).commit();
    }
}
