package com.adient.firewall.repository;

import com.adient.firewall.config.OracleDataSourceConfig;
import com.adient.firewall.service.impl.UserConfigurationService;
import com.adient.firewall.service.impl.UserServiceImpl;
import com.adient.firewall.service.impl.PermissionService;
import com.adient.firewall.dto.CustomRoleDto;
import org.springframework.security.crypto.password.PasswordEncoder;
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
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named = "RUN_ORACLE_BULK_TESTS", matches = "true")
@SpringJUnitConfig(UserConfigurationOracleTest.Config.class)
class UserConfigurationOracleTest {
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
        @Bean UserServiceImpl users(JdbcTemplate db) {
            QualityRepository repo = new QualityRepository(db);
            return new UserServiceImpl(repo, mock(PasswordEncoder.class), new PermissionService(repo));
        }
        @Bean UserConfigurationService service(UserServiceImpl users) {
            return new UserConfigurationService(users);
        }
    }
    @Autowired UserConfigurationService service;
    @Autowired JdbcTemplate db;
    @Autowired PlatformTransactionManager transactions;

    private String key() { return "MB_" + UUID.randomUUID().toString().replace("-", "").substring(0, 15); }
    private String insertUser(String key, String role) {
        db.update("INSERT INTO SYSTEM.APP_USERS(MATRICULE,FULL_NAME,EMAIL,ROLE,PWD_HASH,IS_ACTIVE) VALUES (?,?,?,?,?,1)",
                key, "Original", key + "@test.invalid", role, "not-a-password");
        return db.queryForObject("SELECT TO_CHAR(ID) FROM SYSTEM.APP_USERS WHERE MATRICULE=?", String.class, key);
    }

    @Test void historyExportIsNotSilentlyTruncated() {
        String key = key();
        QualityRepository actual = new QualityRepository(db);
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            status.setRollbackOnly();
            String id = insertUser(key, "operator");
            List<Object[]> events = java.util.stream.IntStream.range(0, 503)
                    .mapToObj(i -> new Object[]{id, key}).toList();
            db.batchUpdate("INSERT INTO SYSTEM.LOGIN_HISTORY(USER_ID,MATRICULE,STATUS) VALUES (?,?,'success')", events);
            assertEquals(500, actual.listAllLoginHistory(key, null, null, null).size());
            assertEquals(503, actual.queryLoginHistory(Long.valueOf(id), null, null, null, "success", true).size());
            assertEquals(0, actual.queryLoginHistory(Long.valueOf(id), null, null, null, "failed", true).size());
        });
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM SYSTEM.LOGIN_HISTORY WHERE MATRICULE=?", Integer.class, key));
    }

    @Test void permissionsFailureRollsBackCustomRoleChangesInSameConfiguration() {
        QualityRepository actual = new QualityRepository(db);
        List<CustomRoleDto> before = actual.findAllCustomRoles();
        String key = key().toLowerCase();
        List<CustomRoleDto> changed = new java.util.ArrayList<>(before);
        changed.add(new CustomRoleDto(key, "Temporary", "#15803d", "#ffffff", "#ffffff"));
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            status.setRollbackOnly();
            assertThrows(IllegalArgumentException.class, () -> service.saveConfiguration(
                    new UserConfigurationService.Configuration(changed, Map.of("admin", Map.of("users", "none")))));
            assertTrue(status.isRollbackOnly());
        });
        assertEquals(before, actual.findAllCustomRoles());
    }
}
