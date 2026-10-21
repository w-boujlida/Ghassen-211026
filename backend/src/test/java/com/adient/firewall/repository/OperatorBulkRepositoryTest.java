package com.adient.firewall.repository;

import com.adient.firewall.dto.OperatorBulkRequest;
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
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringJUnitConfig(OperatorBulkRepositoryTest.Config.class)
class OperatorBulkRepositoryTest {

    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    static class Config {
        @Bean DataSource dataSource() { return mock(DataSource.class); }
        @Bean JdbcTemplate jdbcTemplate() { return mock(JdbcTemplate.class); }
        @Bean JdbcTransactionManager oracleTransactionManager(DataSource ds) { return new JdbcTransactionManager(ds); }
        @Bean OperatorBulkRepository repository(JdbcTemplate db) { return new OperatorBulkRepository(db); }
    }

    @Autowired OperatorBulkRepository repo;
    @Autowired JdbcTemplate db;
    @Autowired DataSource dataSource;
    Connection connection;

    @BeforeEach
    void setUp() throws Exception {
        reset(db, dataSource);
        connection = mock(Connection.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getAutoCommit()).thenReturn(true);
        when(db.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(Map.of("NAME", "OLD", "CODE", "OLD")));
        when(db.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(0);
        when(db.update(anyString(), any(Object[].class))).thenReturn(1);
    }

    OperatorBulkRequest request(String action, List<String> ids, Map<String, String> changes, Map<String, String> names) {
        return new OperatorBulkRequest(action, ids, changes, names);
    }

    @Test
    void patchesOnlyRequestedEmployeeFieldsAndCommitsOracleTransaction() throws Exception {
        assertEquals(2, repo.apply("employees", request("update", List.of("1", "2"),
                Map.of("equipe2", "B"), null)).affected());
        verify(db).update("UPDATE SYSTEM.POLY SET EQUIPE2=? WHERE MAT=?", "B", "1");
        verify(db).update("UPDATE SYSTEM.POLY SET EQUIPE2=? WHERE MAT=?", "B", "2");
        verify(connection).commit();
        verify(connection, never()).rollback();
    }

    @Test
    void permitsClearingDescription() {
        repo.apply("tampons", request("update", List.of("1"), Map.of("description", ""), null));
        verify(db).update("UPDATE SYSTEM.TAMPONS SET DESCRIPTION=? WHERE ID=?", "", "1");
    }

    @Test
    void updatesCouturiereStatusWithoutReplacingOtherFields() {
        repo.apply("couturieres", request("update", List.of("1"), Map.of("actif", "0"), null));
        verify(db).update("UPDATE SYSTEM.DELIBERA_COUTURIERES SET ACTIF=? WHERE ID=?", "0", "1");
    }

    @Test
    void renamesSupervisorAndCurrentEmployeeAssignments() {
        repo.apply("supervisors", request("rename", List.of("OLD"), null, Map.of("OLD", "New")));
        verify(db).update("UPDATE SYSTEM.SUPERVISORS SET NAME=? WHERE NAME=?", "NEW", "OLD");
        verify(db).update("UPDATE SYSTEM.POLY SET SUPERVISOR=? WHERE SUPERVISOR=?", "NEW", "OLD");
    }

    @Test
    void renamesTamponAndLegacyEmployeeCode() {
        repo.apply("tampons", request("rename", List.of("1"), null, Map.of("1", "new")));
        verify(db).update("UPDATE SYSTEM.TAMPONS SET CODE=? WHERE ID=?", "NEW", "1");
        verify(db).update("UPDATE SYSTEM.POLY SET TAMPON=? WHERE TAMPON=?", "NEW", "OLD");
    }

    @Test
    void renamesEmployeeWithoutChangingMatricule() {
        repo.apply("employees", request("rename", List.of("1"), null, Map.of("1", "New")));
        verify(db).update("UPDATE SYSTEM.POLY SET NAME=? WHERE MAT=?", "NEW", "1");
    }

    @Test
    void renamesCouturiereWithoutChangingMatricule() {
        repo.apply("couturieres", request("rename", List.of("1"), null, Map.of("1", "New")));
        verify(db).update("UPDATE SYSTEM.DELIBERA_COUTURIERES SET NOM=? WHERE ID=?", "New", "1");
    }

    @Test
    void deletingEmployeeReleasesButDoesNotDeleteTampons() {
        repo.apply("employees", request("delete", List.of("1"), null, null));
        verify(db).update("UPDATE SYSTEM.TAMPONS SET MAT=NULL WHERE MAT=?", "1");
        verify(db).update("DELETE FROM SYSTEM.POLY WHERE MAT=?", "1");
        verify(db, never()).update(eq("DELETE FROM SYSTEM.TAMPONS WHERE ID=?"), anyString());
    }

    @Test
    void deletingSupervisorClearsCurrentAssignmentsOnly() {
        repo.apply("supervisors", request("delete", List.of("OLD"), null, null));
        verify(db).update("UPDATE SYSTEM.POLY SET SUPERVISOR=NULL WHERE SUPERVISOR=?", "OLD");
        verify(db).update("DELETE FROM SYSTEM.SUPERVISORS WHERE NAME=?", "OLD");
    }

    @Test
    void assignedTamponIsPreservedWhileFreeTamponsAreDeleted() throws Exception {
        when(db.queryForList(anyString(), eq("2"))).thenReturn(List.of(Map.of("CODE", "T2", "MAT", "EMP")));
        var result = repo.apply("tampons", request("delete", List.of("1", "2"), null, null));
        assertEquals(1, result.affected());
        assertEquals(1, result.preserved().size());
        assertEquals("2", result.preserved().get(0).id());
        assertEquals("T2", result.preserved().get(0).code());
        assertEquals("EMP", result.preserved().get(0).matricule());
        verify(db).update("DELETE FROM SYSTEM.TAMPONS WHERE ID=?", "1");
        verify(db, never()).update(eq("DELETE FROM SYSTEM.TAMPONS WHERE ID=?"), eq("2"));
        verify(connection).commit();
    }

    @Test
    void legacyTamponAssignmentAlsoPreventsDeletion() {
        when(db.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(1);
        var result = repo.apply("tampons", request("delete", List.of("1"), null, null));
        assertEquals(0, result.affected());
        assertEquals(1, result.preserved().size());
        assertEquals("OLD", result.preserved().get(0).code());
        assertNull(result.preserved().get(0).matricule());
        verify(db, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void allAssignedTamponsAreReportedWithoutDeletingAnything() {
        when(db.queryForList(anyString(), eq("1"))).thenReturn(List.of(Map.of("CODE", "T1", "MAT", "EMP1")));
        when(db.queryForList(anyString(), eq("2"))).thenReturn(List.of(Map.of("CODE", "T2", "MAT", "EMP2")));
        var result = repo.apply("tampons", request("delete", List.of("1", "2"), null, null));
        assertEquals(0, result.affected());
        assertEquals(List.of("T1", "T2"), result.preserved().stream().map(t -> t.code()).toList());
        verify(db, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void freeTamponsAreAllDeletedAndReportNoPreservedRows() {
        var result = repo.apply("tampons", request("delete", List.of("1", "2"), null, null));
        assertEquals(2, result.affected());
        assertTrue(result.preserved().isEmpty());
        verify(db).update("DELETE FROM SYSTEM.TAMPONS WHERE ID=?", "1");
        verify(db).update("DELETE FROM SYSTEM.TAMPONS WHERE ID=?", "2");
    }

    @Test
    void deletionFailureRollsBackEvenWhenSomeTamponsArePreserved() throws Exception {
        when(db.queryForList(anyString(), eq("3"))).thenReturn(List.of(Map.of("CODE", "T3", "MAT", "EMP")));
        doThrow(new org.springframework.dao.DataIntegrityViolationException("Deletion failed"))
                .when(db).update("DELETE FROM SYSTEM.TAMPONS WHERE ID=?", "2");
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> repo.apply("tampons", request("delete", List.of("1", "2", "3"), null, null)));
        verify(db).update("DELETE FROM SYSTEM.TAMPONS WHERE ID=?", "1");
        verify(db, never()).update("DELETE FROM SYSTEM.TAMPONS WHERE ID=?", "3");
        verify(connection).rollback();
        verify(connection, never()).commit();
    }

    @Test
    void staleSelectionAbortsBeforeWrites() {
        when(db.queryForList(anyString(), eq("2"))).thenReturn(List.of());
        assertThrows(NoSuchElementException.class, () -> repo.apply("employees",
                request("delete", List.of("1", "2"), null, null)));
        verify(db, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void duplicateNewCodesAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> repo.apply("tampons",
                request("rename", List.of("1", "2"), null, Map.of("1", "same", "2", " SAME "))));
        verify(db, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void existingNameCollisionIsRejected() {
        when(db.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(1);
        assertThrows(IllegalArgumentException.class, () -> repo.apply("supervisors",
                request("rename", List.of("OLD"), null, Map.of("OLD", "EXISTING"))));
        verify(db, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void invalidRequestsCannotWrite() {
        assertThrows(IllegalArgumentException.class, () -> repo.apply("unknown", request("delete", List.of("1"), null, null)));
        assertThrows(IllegalArgumentException.class, () -> repo.apply("employees", request("delete", List.of(), null, null)));
        assertThrows(IllegalArgumentException.class, () -> repo.apply("employees", request("delete", List.of("1", "1"), null, null)));
        assertThrows(IllegalArgumentException.class, () -> repo.apply("employees", request("other", List.of("1"), null, null)));
        assertThrows(IllegalArgumentException.class, () -> repo.apply("employees", request("update", List.of("1"), Map.of("mat", "2"), null)));
        assertThrows(IllegalArgumentException.class, () -> repo.apply("employees", request("update", List.of("1"), Map.of("dateEmbauche", "bad"), null)));
        assertThrows(IllegalArgumentException.class, () -> repo.apply("couturieres", request("update", List.of("1"), Map.of("actif", ""), null)));
        assertThrows(IllegalArgumentException.class, () -> repo.apply("employees", request("rename", List.of("1"), null, Map.of("1", " "))));
        verify(db, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void databaseFailureRollsBackOracleTransaction() throws Exception {
        when(db.update("UPDATE SYSTEM.POLY SET NAME=? WHERE MAT=?", "SECOND", "2"))
                .thenThrow(new IllegalStateException("database failure"));
        assertThrows(IllegalStateException.class, () -> repo.apply("employees",
                request("rename", List.of("1", "2"), null, Map.of("1", "FIRST", "2", "SECOND"))));
        verify(db).update("UPDATE SYSTEM.POLY SET NAME=? WHERE MAT=?", "FIRST", "1");
        verify(connection).rollback();
        verify(connection, never()).commit();
    }
}
