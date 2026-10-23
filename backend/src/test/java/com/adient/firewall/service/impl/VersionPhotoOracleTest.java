package com.adient.firewall.service.impl;

import com.adient.firewall.repository.QualityRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named = "RUN_ORACLE_PHOTO_TESTS", matches = "true")
@SpringJUnitConfig(ReferenceMetadataOracleTest.Config.class)
class VersionPhotoOracleTest {
    @Autowired JdbcTemplate db;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void savesReplacesAndDeletesIsolatedPhotosWithOracleBlobPersistence() throws Exception {
        var repo = new QualityRepository(db);
        var service = new VersionPhotoService(repo);
        service.init();
        var tuple = db.queryForMap("SELECT LIGNE,VERSION FROM SYSTEM.J4U WHERE LIGNE IS NOT NULL " +
                "AND VERSION IS NOT NULL AND ROWNUM=1");
        String line = tuple.get("LIGNE").toString().trim();
        String version = tuple.get("VERSION").toString().trim();
        String red = VersionPhotoServiceTest.photo(0xff0000);
        String blue = VersionPhotoServiceTest.largePhoto();
        assertTrue(blue.length() > 32_768);
        var before = service.get("J4U", line, version);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            status.setRollbackOnly();
            service.save("J4U", line, version, red);
            assertEquals(red, new VersionPhotoService(repo).get("J4U", line, version).get("dataUrl"));
            assertEquals(false, service.get("J4U", line + "_TEST", version).get("available"));
            service.save("J4U", line, version, blue);
            assertEquals(blue, service.get("J4U", line, version).get("dataUrl"));
            service.delete("J4U", line, version);
            assertEquals(false, service.get("J4U", line, version).get("available"));
            // Exercise the blank-line/version key without editing reference tables.
            var blankRepo = spy(new QualityRepository(db));
            var blankDb = spy(new JdbcTemplate(db.getDataSource()));
            doReturn(blankDb).when(blankRepo).getJdbcTemplate();
            doReturn(1).when(blankDb).queryForObject(contains("NVL(TRIM(LIGNE)"), eq(Integer.class), eq(" "), eq(" "));
            var blankService = new VersionPhotoService(blankRepo);
            blankService.save("J4U", "", "", red);
            assertEquals(red, blankService.get("J4U", " ", "").get("dataUrl"));
            blankService.delete("J4U", "", "");
        });
        assertEquals(before, service.get("J4U", line, version));
    }
}
