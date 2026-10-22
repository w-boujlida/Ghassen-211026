package com.adient.firewall.service.impl;

import com.adient.firewall.config.OracleDataSourceConfig;
import com.adient.firewall.dto.EmployeeDto;
import com.adient.firewall.dto.EmployeeImportDto;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.IEmployeeService;
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
import java.util.Locale;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "RUN_ORACLE_EMPLOYEE_TESTS", matches = "true")
@SpringJUnitConfig(EmployeeTamponOracleTest.Config.class)
class EmployeeTamponOracleTest {
    @Configuration
    @EnableTransactionManagement
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
        @Bean IEmployeeService service(JdbcTemplate db) {
            return new EmployeeServiceImpl(new QualityRepository(db));
        }
    }

    @Autowired IEmployeeService service;
    @Autowired JdbcTemplate db;
    @Autowired PlatformTransactionManager transactionManager;

    private String key() {
        return "EMP_TEST_" + UUID.randomUUID().toString().replace("-", "").toUpperCase(Locale.ROOT);
    }

    private EmployeeDto employee(String mat, String code) {
        return new EmployeeDto(mat, "Test employee", code, "2026-10-22", "CSL", "TEST", "A", "TEST");
    }

    @Test
    void createsReplacesAndReleasesStampWithoutDeletingCodes() {
        String mat = key();
        String code = key();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            status.setRollbackOnly();
            service.create(employee(mat, code.toLowerCase(Locale.ROOT)));
            assertEquals(code, db.queryForObject("SELECT TAMPON FROM SYSTEM.POLY WHERE MAT=?", String.class, mat));
            assertEquals(mat, db.queryForObject("SELECT MAT FROM SYSTEM.TAMPONS WHERE CODE=?", String.class, code));
            QualityRepository repo = new QualityRepository(db);
            assertTrue(repo.getTamponCodes().contains(code));
            assertEquals("TEST", repo.findSupervisorByTampon(code).orElseThrow().get("SUPERVISOR"));

            db.update("INSERT INTO SYSTEM.TAMPONS (CODE,MAT) VALUES (?,?)", code + "X", mat);
            db.update("INSERT INTO SYSTEM.TAMPONS (CODE) VALUES (?)", code + "N");
            service.update(employee(mat, code + "N"));
            assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.TAMPONS WHERE MAT=?", Integer.class, mat));
            assertNull(db.queryForObject("SELECT MAT FROM SYSTEM.TAMPONS WHERE CODE=?", String.class, code));
            assertEquals(code + "N", db.queryForObject("SELECT TAMPON FROM SYSTEM.POLY WHERE MAT=?", String.class, mat));

            service.delete(mat);
            assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.POLY WHERE MAT=?", Integer.class, mat));
            assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.TAMPONS WHERE MAT=?", Integer.class, mat));
            assertEquals(3, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.TAMPONS WHERE CODE IN (?,?,?)",
                    Integer.class, code, code + "X", code + "N"));
        });
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.TAMPONS WHERE CODE IN (?,?,?)",
                Integer.class, code, code + "X", code + "N"));
    }

    @Test
    void duplicateStampRollsBackEntireImportIncludingNewCodes() {
        String mat = key();
        String code = key();
        var rows = List.of(
                new EmployeeImportDto(mat, "Test", "", "CSL", "", "A", "", List.of(code)),
                new EmployeeImportDto(mat + "N", "Test", "", "CSL", "", "A", "", List.of(code)));

        var error = assertThrows(IllegalArgumentException.class, () -> service.importEmployees(rows));

        assertTrue(error.getMessage().contains("Ligne 3"));
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.POLY WHERE MAT IN (?,?)",
                Integer.class, mat, mat + "N"));
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.TAMPONS WHERE CODE=?", Integer.class, code));
    }
}
