package com.adient.firewall.repository;

import com.adient.firewall.config.OracleDataSourceConfig;
import com.adient.firewall.dto.OperatorBulkRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "RUN_ORACLE_BULK_TESTS", matches = "true")
@SpringJUnitConfig(OperatorBulkOracleTest.Config.class)
class OperatorBulkOracleTest {

    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    static class Config {
        @Bean DataSource dataSource() {
            return new DriverManagerDataSource(
                    "jdbc:oracle:thin:@oracle21c:1521/" + System.getenv("ORACLE_DBNAME"),
                    System.getenv("ORACLE_USER"), System.getenv("ORACLE_PASSWORD"));
        }
        @Bean JdbcTemplate jdbcTemplate(DataSource ds) { return new JdbcTemplate(ds); }
        @Bean PlatformTransactionManager oracleTransactionManager(DataSource ds) {
            return new OracleDataSourceConfig().oracleTransactionManager(ds);
        }
        @Bean OperatorBulkRepository repository(JdbcTemplate db) { return new OperatorBulkRepository(db); }
    }

    @Autowired OperatorBulkRepository repo;
    @Autowired JdbcTemplate db;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void realOracleActionsPreserveAssignmentsAndUnchangedFields() {
        String key = "BULK_TEST_" + UUID.randomUUID().toString().replace("-", "").toUpperCase(Locale.ROOT);
        String newName = key + "_N";
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            status.setRollbackOnly();
            db.update("INSERT INTO SYSTEM.SUPERVISORS (NAME) VALUES (?)", key);
            db.update("INSERT INTO SYSTEM.POLY (MAT,NAME,TAMPON,EQUIPE2,SUPERVISOR) VALUES (?,?,?,?,?)",
                    key, "ORIGINAL", key, "A", key);
            db.update("INSERT INTO SYSTEM.TAMPONS (CODE,DESCRIPTION,MAT) VALUES (?,?,?)", key, "Original", key);
            String tamponId = db.queryForObject("SELECT TO_CHAR(ID) FROM SYSTEM.TAMPONS WHERE CODE=?", String.class, key);
            db.update("INSERT INTO SYSTEM.DELIBERA_COUTURIERES (MATRICULE,NOM,ACTIF) VALUES (?,?,?)", key, "Original", 1);
            String couturiereId = db.queryForObject("SELECT TO_CHAR(ID) FROM SYSTEM.DELIBERA_COUTURIERES WHERE MATRICULE=?", String.class, key);

            repo.apply("employees", new OperatorBulkRequest("update", List.of(key), Map.of("equipe2", "B"), null));
            assertEquals("B", db.queryForObject("SELECT EQUIPE2 FROM SYSTEM.POLY WHERE MAT=?", String.class, key));
            assertEquals("ORIGINAL", db.queryForObject("SELECT NAME FROM SYSTEM.POLY WHERE MAT=?", String.class, key));
            repo.apply("supervisors", new OperatorBulkRequest("rename", List.of(key), null, Map.of(key, newName)));
            assertEquals(newName, db.queryForObject("SELECT SUPERVISOR FROM SYSTEM.POLY WHERE MAT=?", String.class, key));
            repo.apply("tampons", new OperatorBulkRequest("rename", List.of(tamponId), null, Map.of(tamponId, newName)));
            assertEquals(newName, db.queryForObject("SELECT TAMPON FROM SYSTEM.POLY WHERE MAT=?", String.class, key));
            repo.apply("couturieres", new OperatorBulkRequest("update", List.of(couturiereId), Map.of("actif", "0"), null));
            assertEquals(0, db.queryForObject("SELECT ACTIF FROM SYSTEM.DELIBERA_COUTURIERES WHERE ID=?", Integer.class, couturiereId));
            repo.apply("employees", new OperatorBulkRequest("delete", List.of(key), null, null));
            assertNull(db.queryForObject("SELECT MAT FROM SYSTEM.TAMPONS WHERE ID=?", String.class, tamponId));
            repo.apply("tampons", new OperatorBulkRequest("delete", List.of(tamponId), null, null));
            repo.apply("couturieres", new OperatorBulkRequest("delete", List.of(couturiereId), null, null));
        });
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.POLY WHERE MAT=?", Integer.class, key));
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.SUPERVISORS WHERE NAME IN (?,?)", Integer.class, key, newName));
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.TAMPONS WHERE CODE IN (?,?)", Integer.class, key, newName));
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.DELIBERA_COUTURIERES WHERE MATRICULE=?", Integer.class, key));
    }

    @Test
    void realOracleDeletesOnlyFreeTamponsAndPreservesBothAssignmentSources() {
        String key = "BULK_TEST_" + UUID.randomUUID().toString().replace("-", "");
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            status.setRollbackOnly();
            db.update("INSERT INTO SYSTEM.POLY (MAT,NAME,TAMPON) VALUES (?, 'Original', ?)", key, key + "L");
            db.update("INSERT INTO SYSTEM.TAMPONS (CODE,MAT) VALUES (?,?)", key + "A", key);
            db.update("INSERT INTO SYSTEM.TAMPONS (CODE) VALUES (?)", key + "L");
            db.update("INSERT INTO SYSTEM.TAMPONS (CODE) VALUES (?)", key + "F");
            String assigned = db.queryForObject("SELECT TO_CHAR(ID) FROM SYSTEM.TAMPONS WHERE CODE=?", String.class, key + "A");
            String legacy = db.queryForObject("SELECT TO_CHAR(ID) FROM SYSTEM.TAMPONS WHERE CODE=?", String.class, key + "L");
            String free = db.queryForObject("SELECT TO_CHAR(ID) FROM SYSTEM.TAMPONS WHERE CODE=?", String.class, key + "F");
            var result = repo.apply("tampons", new OperatorBulkRequest("delete", List.of(free, legacy, assigned), null, null));
            assertEquals(1, result.affected());
            assertEquals(2, result.preserved().size());
            assertTrue(result.preserved().stream().anyMatch(t -> t.id().equals(assigned) && t.code().equals(key + "A") && key.equals(t.matricule())));
            assertTrue(result.preserved().stream().anyMatch(t -> t.id().equals(legacy) && t.code().equals(key + "L") && t.matricule() == null));
            assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.TAMPONS WHERE ID=?", Integer.class, free));
            assertEquals(key, db.queryForObject("SELECT MAT FROM SYSTEM.TAMPONS WHERE ID=?", String.class, assigned));
            assertEquals(key + "L", db.queryForObject("SELECT TAMPON FROM SYSTEM.POLY WHERE MAT=?", String.class, key));
            var allPreserved = repo.apply("tampons", new OperatorBulkRequest("delete", List.of(legacy, assigned), null, null));
            assertEquals(0, allPreserved.affected());
            assertEquals(2, allPreserved.preserved().size());
        });
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.TAMPONS WHERE CODE IN (?,?,?)", Integer.class, key + "A", key + "L", key + "F"));
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.POLY WHERE MAT=?", Integer.class, key));
    }

    @Test
    void realOracleFailureAfterFirstWriteLeavesNoCommittedChanges() {
        String first = "BULK_TEST_" + UUID.randomUUID().toString().replace("-", "");
        String second = first + "_2";
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            status.setRollbackOnly();
            db.update("INSERT INTO SYSTEM.POLY (MAT,NAME) VALUES (?,?)", first, "ORIGINAL");
            db.update("INSERT INTO SYSTEM.POLY (MAT,NAME) VALUES (?,?)", second, "ORIGINAL");
            var error = assertThrows(UncategorizedSQLException.class, () -> repo.apply("employees",
                    new OperatorBulkRequest("rename", List.of(first, second), null,
                            Map.of(first, "CHANGED", second, "X".repeat(201)))));
            assertEquals(12899, error.getSQLException().getErrorCode());
            assertTrue(status.isRollbackOnly());
        });
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.POLY WHERE MAT IN (?,?)", Integer.class, first, second));
    }
}
