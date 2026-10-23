package com.adient.firewall.service.impl;

import com.adient.firewall.dto.ScanRule;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.repository.DeliberaRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "RUN_ORACLE_SCAN_RULE_TESTS", matches = "true")
@SpringJUnitConfig(ReferenceMetadataOracleTest.Config.class)
class DeliberaScanRulesOracleTest {
    @Autowired JdbcTemplate db;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void pdefSettingsForSameVersionStayIndependentAndFallbackIsPreserved() {
        var quality = new QualityRepository(db);
        quality.initBarcodeSettings();
        var refs = db.queryForList("""
                SELECT DISTINCT TO_CHAR(PDEF) PDEF,TRIM(VERSION) VERSION FROM SYSTEM.P6
                WHERE VERSION IN (SELECT VERSION FROM SYSTEM.P6 GROUP BY VERSION HAVING COUNT(DISTINCT PDEF)>1)
                ORDER BY VERSION,PDEF FETCH FIRST 2 ROWS ONLY
                """);
        assertEquals(2, refs.size());
        String a = refs.get(0).get("PDEF").toString(), b = refs.get(1).get("PDEF").toString();
        String version = refs.get(0).get("VERSION").toString();
        assertEquals(version, refs.get(1).get("VERSION").toString());
        var previous = quality.getReferenceScanSettings("P6", a, version);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            status.setRollbackOnly();
            db.update("DELETE FROM SYSTEM.REF_SCAN_SETTINGS WHERE PROJECT_NAME='P6' AND PDEF IN (?,?)", a, b);
            assertEquals(quality.getVersionScanSettings("P6", version).get("rules"),
                    quality.getReferenceScanSettings("P6", a, version).get("rules"));
            quality.setReferenceScanSettings("P6", a, version, 26, List.of(new ScanRule(6, "00", "AZ")));
            quality.setReferenceScanSettings("P6", b, version, 30,
                    List.of(new ScanRule(4, "B", "9"), new ScanRule(3, "0", "x")));
            var fresh = new QualityRepository(db);
            assertEquals(26, ((Number) fresh.getReferenceScanSettings("P6", a, version).get("barcodeLength")).intValue());
            assertEquals(30, ((Number) fresh.getReferenceScanSettings("P6", b, version).get("barcodeLength")).intValue());
            String barcodeA = a + "X".repeat(26 - a.length());
            String barcodeB = b + "X".repeat(30 - b.length());
            assertTrue(fresh.lookupScanBarcode(List.of("P6"), barcodeA, true, version).isPresent());
            assertTrue(fresh.lookupScanBarcode(List.of("P6"), barcodeB, true, version).isPresent());
            assertThrows(IllegalArgumentException.class,
                    () -> fresh.lookupScanBarcode(List.of("P6"), barcodeB.substring(0, 29), true, version));
            fresh.validateDeliberaCodes("P6", a, version, List.of("0012AZ"));
            fresh.validateDeliberaCodes("P6", b, version, List.of("B/+9", "09x"));
            assertThrows(IllegalArgumentException.class, () -> fresh.validateDeliberaCodes("P6", b, version, List.of("0012AZ")));
            quality.setReferenceScanSettings("P6", a, version, null, List.of(new ScanRule(null, "", "")));
            assertNull(fresh.getReferenceScanSettings("P6", a, version).get("barcodeLength"));
            assertEquals(2, fresh.getDeliberaScanRules("P6", b, version).size());
            assertThrows(IllegalArgumentException.class, () -> quality.setReferenceScanSettings("P6", "UNKNOWN_TEST_PDEF",
                    version, 26, List.of(new ScanRule(26, "", ""))));
        });
        assertEquals(previous, quality.getReferenceScanSettings("P6", a, version));
    }

    @Test
    void versionSettingsAreIsolatedAndUseLegacyDefaultsUntilConfigured() {
        var quality = new QualityRepository(db);
        quality.initBarcodeSettings();
        var versions = db.queryForList(
                "SELECT DISTINCT TRIM(VERSION) FROM SYSTEM.P6 WHERE VERSION IS NOT NULL ORDER BY 1 FETCH FIRST 2 ROWS ONLY",
                String.class);
        assertEquals(2, versions.size());
        String a = versions.get(0), b = versions.get(1);
        var previousA = quality.getVersionScanSettings("P6", a);
        var previousB = quality.getVersionScanSettings("P6", b);
        var legacy = quality.getBarcodeLength("P6");
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            status.setRollbackOnly();
            db.update("DELETE FROM SYSTEM.VERSION_SCAN_SETTINGS WHERE PROJECT_NAME='P6' AND VERSION_NAME IN (?,?)", a, b);
            assertEquals(false, quality.getVersionScanSettings("P6", a).get("configured"));
            assertEquals(legacy, quality.getVersionScanSettings("P6", a).get("barcodeLength"));
            quality.setVersionScanSettings("P6", a, 26, List.of(new ScanRule(6, "00", "AZ")));
            quality.setVersionScanSettings("P6", b, 30, List.of(new ScanRule(4, "B", "9"), new ScanRule(3, "0", "x")));
            var fresh = new QualityRepository(db);
            assertEquals(26, ((Number) fresh.getVersionScanSettings("P6", a).get("barcodeLength")).intValue());
            assertEquals(30, ((Number) fresh.getVersionScanSettings("P6", b).get("barcodeLength")).intValue());
            fresh.validateDeliberaCodes("P6", a, List.of("0012AZ"));
            fresh.validateDeliberaCodes("P6", b, List.of("B/+9", "09x"));
            assertThrows(IllegalArgumentException.class, () -> fresh.validateDeliberaCodes("P6", b, List.of("0012AZ")));
            quality.setVersionScanSettings("P6", a, null, List.of(new ScanRule(null, "", "")));
            assertNull(fresh.getVersionScanSettings("P6", a).get("barcodeLength"));
            assertEquals(2, fresh.getDeliberaScanRules("P6", b).size());
            assertEquals(legacy, quality.getBarcodeLength("P6"));
            assertThrows(IllegalArgumentException.class, () -> quality.setVersionScanSettings("P6", "UNKNOWN_TEST_VERSION", 26,
                    List.of(new ScanRule(26, "", ""))));
        });
        assertEquals(previousA, quality.getVersionScanSettings("P6", a));
        assertEquals(previousB, quality.getVersionScanSettings("P6", b));
    }

    @Test
    void multiplePostesPersistWithoutDuplicatingPieceAndCanBeReplaced() {
        var records = new DeliberaRepository(db);
        records.ensureRecordPostesTable();
        var postes = db.queryForList("SELECT ID FROM SYSTEM.POSTES ORDER BY ID FETCH FIRST 2 ROWS ONLY", Long.class);
        assertEquals(2, postes.size(), "This integration test requires two configured posts");
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            status.setRollbackOnly();
            long id = records.insertRecord("NOK_POSTES_TEST_" + UUID.randomUUID(), "P6", "TEST",
                    null, null, postes.get(0), null, "TEST", null, "NOT_RETURNED");
            assertEquals(1, records.findRecordPostes(id).size(), "Legacy single-post fallback");
            records.saveRecordPostes(id, postes);
            assertEquals(2, new DeliberaRepository(db).findRecordPostes(id).size());
            records.updateRecord(id, postes.get(1), null);
            records.saveRecordPostes(id, List.of(postes.get(1)));
            assertEquals(1, records.findRecordPostes(id).size());
            records.deleteRecord(id);
            assertEquals(0, db.queryForObject(
                    "SELECT COUNT(*) FROM SYSTEM.DELIBERA_RECORD_POSTES WHERE RECORD_ID=?", Integer.class, id));
        });
    }

    @Test
    void rulesPersistWithAllThreeCodesAndRollbackPreservesPreviousSettings() {
        var quality = new QualityRepository(db);
        var records = new DeliberaRepository(db);
        quality.initBarcodeSettings();
        records.ensureScanCodeColumns();
        var previous = quality.getDeliberaScanRules("P6");
        var legacyLength = quality.getBarcodeLength("P6");
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            status.setRollbackOnly();
            var rules = List.of(new ScanRule(6, "00", "AZ"), new ScanRule(4, "B", "9"), new ScanRule(3, "", "x"));
            quality.setDeliberaScanRules("P6", rules);
            assertEquals(rules, new QualityRepository(db).getDeliberaScanRules("P6"));
            assertEquals(legacyLength, quality.getBarcodeLength("P6"), "Firewall/CSL must remain unchanged");
            quality.validateDeliberaCodes("P6", List.of("0012AZ", "B/+9", "09x"));
            assertThrows(IllegalArgumentException.class, () -> quality.validateDeliberaCodes("P6", List.of("0012AZ")));
            String barcode = "SCAN_RULE_TEST_" + UUID.randomUUID();
            long id = records.insertRecord(barcode, "P6", "TEST", null, null, null, null, "TEST", null, "NOT_RETURNED");
            records.saveScanCodes(id, List.of(barcode, "B/+9", "09x"));
            var read = new DeliberaRepository(db).findRecordById(id);
            assertEquals("B/+9", read.get("SCAN_CODE_2"));
            assertEquals("09x", read.get("SCAN_CODE_3"));
            assertEquals(barcode, read.get("BARCODE"));
            quality.setDeliberaScanRules("P6", List.of(new ScanRule(null, "", "")));
            assertEquals(1, quality.getDeliberaScanRules("P6").size());
        });
        assertEquals(previous, quality.getDeliberaScanRules("P6"));
        assertEquals(legacyLength, quality.getBarcodeLength("P6"));
    }
}
