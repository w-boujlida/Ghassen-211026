package com.adient.firewall.repository;

import com.adient.firewall.config.OracleDataSourceConfig;
import com.adient.firewall.dto.DeliberaReturnRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "RUN_ORACLE_BULK_TESTS", matches = "true")
@SpringJUnitConfig(DeliberaReturnOracleTest.Config.class)
class DeliberaReturnOracleTest {
    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    static class Config {
        @Bean DataSource dataSource() {
            return new DriverManagerDataSource("jdbc:oracle:thin:@oracle21c:1521/" + System.getenv("ORACLE_DBNAME"),
                    System.getenv("ORACLE_USER"), System.getenv("ORACLE_PASSWORD"));
        }
        @Bean JdbcTemplate db(DataSource ds) { return new JdbcTemplate(ds); }
        @Bean PlatformTransactionManager oracleTransactionManager(DataSource ds) {
            return new OracleDataSourceConfig().oracleTransactionManager(ds);
        }
        @Bean DeliberaRepository repo(JdbcTemplate db) { return new DeliberaRepository(db); }
    }
    @Autowired DeliberaRepository repo;
    @Autowired JdbcTemplate db;
    @Autowired PlatformTransactionManager transactions;

    @Test void justificationAndResolvedCodesPersistOnSameRecordsWithoutDuplicates() {
        String key = "RETURN_TEST_" + UUID.randomUUID().toString().replace("-", "");
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            status.setRollbackOnly();
            long first = repo.insertRecord(key, "P6", "REF", "V1", "L1", null, null, "TEST", null, "NOT_RETURNED");
            repo.insertRecordDefaut(first, "D1", "Test", "INITIAL");
            repo.returnToOk(first, new DeliberaReturnRequest("Réparation contrôlée", List.of()), "TEST_RETURN");
            var record = repo.findRecordById(first);
            assertEquals("RETURNED", record.get("STATUT_REPRISE"));
            assertEquals("Réparation contrôlée", record.get("RETURN_JUSTIFICATION"));
            assertEquals("TEST_RETURN", record.get("RETURNED_BY"));
            assertNotNull(record.get("RETURNED_AT"));
            assertEquals(0, ((Number) repo.findDefautsByRecordId(first).get(0).get("VERIFIE")).intValue());
            assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.DELIBERA_RECORDS WHERE BARCODE=?", Integer.class, key));
            long second = repo.insertRecord(key + "B", "P6", "REF", "V1", "L1", null, null, "TEST", null, "NOT_RETURNED");
            repo.insertRecordDefaut(second, "D1", "Test", "INITIAL");
            repo.insertRecordDefaut(second, "D2", "Test", "INITIAL");
            List<Long> ids = repo.findDefautsByRecordId(second).stream().map(d -> ((Number) d.get("ID")).longValue()).toList();
            repo.returnToOk(second, new DeliberaReturnRequest(null, ids), "TEST_RETURN");
            assertEquals("RETURNED", repo.findRecordById(second).get("STATUT_REPRISE"));
            assertTrue(repo.findDefautsByRecordId(second).stream().allMatch(d -> ((Number) d.get("VERIFIE")).intValue() == 1));
        });
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.DELIBERA_RECORDS WHERE BARCODE IN (?,?)", Integer.class, key, key + "B"));
    }
}
