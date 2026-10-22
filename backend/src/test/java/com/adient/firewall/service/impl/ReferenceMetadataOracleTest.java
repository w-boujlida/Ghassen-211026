package com.adient.firewall.service.impl;

import com.adient.firewall.config.OracleDataSourceConfig;
import com.adient.firewall.repository.DeliberaRepository;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.IProjectService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named = "RUN_ORACLE_METADATA_TESTS", matches = "true")
@SpringJUnitConfig(ReferenceMetadataOracleTest.Config.class)
class ReferenceMetadataOracleTest {
    @Configuration
    @EnableTransactionManagement
    static class Config {
        @Bean DataSource dataSource() {
            return new DriverManagerDataSource(
                    "jdbc:oracle:thin:@oracle21c:1521/" + System.getenv("ORACLE_DBNAME"),
                    System.getenv("ORACLE_USER"), System.getenv("ORACLE_PASSWORD"));
        }
        @Bean JdbcTemplate jdbcTemplate(DataSource ds) { return spy(new JdbcTemplate(ds)); }
        @Bean PlatformTransactionManager oracleTransactionManager(DataSource ds) {
            return new OracleDataSourceConfig().oracleTransactionManager(ds);
        }
        @Bean IProjectService service(JdbcTemplate db) {
            return new ProjectServiceImpl(new QualityRepository(db));
        }
    }

    @Autowired IProjectService service;
    @Autowired JdbcTemplate db;
    @Autowired PlatformTransactionManager transactionManager;

    private String pdef() {
        return "TEST/" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
    }

    @Test
    void metadataIsOrderedIsolatedReplaceableAndClearableOnOracle() {
        String pdef = pdef();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            status.setRollbackOnly();
            service.setRefVerifMessages("AUDI", pdef, List.of(" First ", "Second", "First"));
            service.setRefCheckpoints("AUDI", pdef, List.of("Couture", "Etiquette", "Couture"));
            service.setRefCheckpoints("P6", pdef, List.of("Other project"));

            assertEquals(List.of("First", "Second"), service.getRefVerifMessages("audi", pdef));
            assertEquals(List.of("Couture", "Etiquette"), service.getRefCheckpoints("audi", pdef));
            assertEquals(List.of("Other project"), service.getRefCheckpoints("P6", pdef));
            assertTrue(service.getRefVerifMessages("AUDI", pdef + "X").isEmpty());
            assertTrue(service.getAllRefCheckpoints().stream().anyMatch(row ->
                    pdef.equals(row.get("PDEF")) && "Couture".equals(row.get("CHECKPOINT"))));
            assertTrue(service.getAllRefVerifMessages().stream().anyMatch(row ->
                    pdef.equals(row.get("PDEF")) && "First".equals(row.get("MESSAGE"))));

            service.setRefVerifMessages("AUDI", pdef, List.of("Replacement"));
            service.setRefCheckpoints("AUDI", pdef, List.of("Replacement"));
            assertEquals(List.of("Replacement"), service.getRefVerifMessages("AUDI", pdef));
            assertEquals(List.of("Replacement"), service.getRefCheckpoints("AUDI", pdef));
            service.setRefVerifMessages("AUDI", pdef, List.of());
            service.setRefCheckpoints("AUDI", pdef, List.of());
            assertTrue(service.getRefVerifMessages("AUDI", pdef).isEmpty());
            assertTrue(service.getRefCheckpoints("AUDI", pdef).isEmpty());
        });
        assertTrue(service.getRefCheckpoints("P6", pdef).isEmpty());
    }

    @Test
    void deliberaStoresAndReadsPerCheckpointResults() {
        String barcode = "METADATA_" + UUID.randomUUID();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            status.setRollbackOnly();
            DeliberaRepository repo = new DeliberaRepository(db);
            long id = repo.insertRecord(barcode, "AUDI", "REF", "1", "L1", null, null,
                    "TEST", null, "RETURNED");
            repo.replaceRecordCheckpoints(id, List.of(
                    Map.of("checkpoint", "Couture", "status", "OK", "project", "AUDI", "pdef", "P/1"),
                    Map.of("checkpoint", "Etiquette", "status", "NOK", "project", "AUDI", "pdef", "P/1")));
            var results = repo.findRecordCheckpoints(id);
            assertEquals(2, results.size());
            assertEquals("Couture", results.get(0).get("CHECKPOINT"));
            assertEquals("OK", results.get(0).get("STATUS"));
            assertEquals("NOK", results.get(1).get("STATUS"));
            assertEquals("P/1", results.get(1).get("PDEF"));
            repo.replaceRecordCheckpoints(id, List.of(Map.of("checkpoint", "Couture", "status", "NOK")));
            assertEquals(1, repo.findRecordCheckpoints(id).size());
            assertEquals("NOK", repo.findRecordCheckpoints(id).get(0).get("STATUS"));
        });
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.DELIBERA_RECORDS WHERE BARCODE=?",
                Integer.class, barcode));
    }

    @Test
    void failedReplacementRestoresPreviousMessagesAndCheckpoints() {
        String pdef = pdef();
        service.setRefVerifMessages("AUDI", pdef, List.of("Original message"));
        service.setRefCheckpoints("AUDI", pdef, List.of("Original checkpoint"));
        try {
            doThrow(new DataIntegrityViolationException("Simulated insert failure")).when(db).update(
                    startsWith("INSERT INTO SYSTEM.REF_VERIF_MESSAGES"), eq("AUDI"), eq(pdef), eq("Fail"), eq(1));
            doThrow(new DataIntegrityViolationException("Simulated insert failure")).when(db).update(
                    startsWith("INSERT INTO SYSTEM.REF_CHECKPOINTS"), eq("AUDI"), eq(pdef), eq("Fail"), eq(1));
            assertThrows(DataIntegrityViolationException.class,
                    () -> service.setRefVerifMessages("AUDI", pdef, List.of("New message", "Fail")));
            assertThrows(DataIntegrityViolationException.class,
                    () -> service.setRefCheckpoints("AUDI", pdef, List.of("New checkpoint", "Fail")));
            assertEquals(List.of("Original message"), service.getRefVerifMessages("AUDI", pdef));
            assertEquals(List.of("Original checkpoint"), service.getRefCheckpoints("AUDI", pdef));
        } finally {
            service.setRefVerifMessages("AUDI", pdef, List.of());
            service.setRefCheckpoints("AUDI", pdef, List.of());
            reset(db);
        }
    }
}
