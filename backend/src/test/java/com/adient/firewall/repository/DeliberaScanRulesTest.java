package com.adient.firewall.repository;

import com.adient.firewall.dto.ScanRule;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DeliberaScanRulesTest {
    @Test
    void validatesEachRequiredCodeLengthPrefixAndSuffixWithoutChangingText() {
        var repo = spy(new QualityRepository(mock(JdbcTemplate.class)));
        doReturn(List.of(new ScanRule(6, "00", "AZ"), new ScanRule(4, "B", "9"), new ScanRule(3, "", "x")))
                .when(repo).getDeliberaScanRules("P6");
        repo.validateDeliberaCodes("P6", List.of("0012AZ", "B/+9", "09x"));
        for (var codes : List.of(List.of("0012AZ"), List.of("0012AZ", "", "09x"),
                List.of("0012AZ", "B99", "09x"), List.of("0012AZ", "C/+9", "09x"),
                List.of("0012AZ", "B/+9", "09X"), List.of("0012AZ", "B/+9", "09xx"))) {
            assertTrue(assertThrows(IllegalArgumentException.class,
                    () -> repo.validateDeliberaCodes("P6", codes)).getMessage().startsWith("Code-barres erroné"));
        }
    }

    @Test
    void rejectsInvalidConfigurationAndAcceptsOptionalConditions() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> QualityRepository.checkScanRules(List.of()));
        assertThrows(IllegalArgumentException.class, () -> QualityRepository.checkScanRules(
                List.of(new ScanRule(2, "AB", "CD"))));
        assertThrows(IllegalArgumentException.class, () -> QualityRepository.checkScanRules(
                List.of(new ScanRule(0, "", ""))));
        assertThrows(IllegalArgumentException.class, () -> QualityRepository.checkScanRules(
                List.of(new ScanRule(2, "ABC", ""))));
        assertEquals(1, QualityRepository.checkScanRules(List.of(new ScanRule(3, "AB", "BC"))).size());
        QualityRepository.validateScanRule("P6", 1, new ScanRule(null, "", ""), "00a/+");
        assertThrows(Exception.class, () -> new ObjectMapper().readValue(
                "{\"length\":26.5,\"prefix\":\"\",\"suffix\":\"\"}", ScanRule.class));
        assertEquals(26, new ObjectMapper().readValue(
                "{\"length\":26,\"prefix\":\"00\",\"suffix\":\"A\"}", ScanRule.class).length());
    }
}
