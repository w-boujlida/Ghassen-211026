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

@EnabledIfEnvironmentVariable(named = "RUN_ORACLE_BARCODE_TESTS", matches = "true")
@SpringJUnitConfig(ReferenceMetadataOracleTest.Config.class)
class ConfigurableBarcodeOracleTest {
    @Autowired JdbcTemplate db;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void settingsPersistAndFullSerialCodesPassWhileWrongLengthsFail() {
        var repo = new QualityRepository(db);
        repo.initBarcodeSettings();
        Integer previous = repo.getBarcodeLength("P6");
        String pdef = db.queryForObject(
                "SELECT TO_CHAR(PDEF) FROM SYSTEM.P6 WHERE PDEF IS NOT NULL AND ROWNUM=1", String.class);
        assertNotNull(pdef);
        assertTrue(pdef.length() < 26);
        String code = pdef + "A/+-" + "9".repeat(26 - pdef.length() - 4);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            status.setRollbackOnly();
            repo.setBarcodeLength("P6", 26);
            assertEquals(26, new QualityRepository(db).getBarcodeLength("P6"));
            assertTrue(repo.lookupScanBarcode(List.of("P6"), code).isPresent());
            assertTrue(assertThrows(IllegalArgumentException.class,
                    () -> repo.lookupScanBarcode(List.of("P6"), code.substring(1))).getMessage().contains("manquant"));
            assertTrue(assertThrows(IllegalArgumentException.class,
                    () -> repo.lookupScanBarcode(List.of("P6"), code + "X")).getMessage().contains("en trop"));
            repo.setBarcodeLength("P6", null);
            assertNull(repo.getBarcodeLength("P6"));
            assertTrue(repo.lookupScanBarcode(List.of("P6"), code + "X").isPresent());
        });
        assertEquals(previous, repo.getBarcodeLength("P6"));
    }
}
