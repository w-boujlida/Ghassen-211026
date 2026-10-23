package com.adient.firewall.controller;

import com.adient.firewall.dto.ScanRule;
import com.adient.firewall.exception.GlobalExceptionHandler;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.repository.DeliberaRepository;
import com.adient.firewall.service.interfaces.IDefautCouturiereService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class DeliberaMultiScanTest {
    private final QualityRepository quality = spy(new QualityRepository(mock(JdbcTemplate.class)));
    private final DeliberaRepository repo = mock(DeliberaRepository.class);
    private final DeliberaController controller = new DeliberaController(repo, quality, mock(IDefautCouturiereService.class));

    private void rules() {
        doReturn(List.of(new ScanRule(6, "00", "AZ"), new ScanRule(4, "B", "9")))
                .when(quality).getDeliberaScanRules("P6");
        doReturn(Optional.of(Map.of("TABLE_NAME", "P6", "PDEF", "0012AZ")))
                .when(quality).lookupScanBarcode(List.of("P6"), "0012AZ", false);
    }

    @Test
    void pdefRulesOverrideVersionDefaultsDuringResolveValidateAndCreate() throws Exception {
        rules();
        doReturn(Optional.of(Map.of("TABLE_NAME", "P6", "PDEF", "0012AZ", "VERSION", "A")))
                .when(quality).lookupScanBarcode(List.of("P6"), "0012AZ", false, "A");
        doReturn(List.of(new ScanRule(6, "00", "AZ"), new ScanRule(3, "0", "x")))
                .when(quality).getDeliberaScanRules("P6", "0012AZ", "A");
        doReturn(Map.of("rules", List.of(new ScanRule(6, "00", "AZ"), new ScanRule(3, "0", "x"))))
                .when(quality).getReferenceScanSettings("P6", "0012AZ", "A");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(get("/api/delibera/scan-settings").param("project", "P6").param("version", "A").param("code", "0012AZ"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.pdef").value("0012AZ"))
                .andExpect(jsonPath("$.data.rules.length()").value(2));
        for (String path : List.of("/api/delibera/scan-validate", "/api/delibera/records")) {
            String body = path.endsWith("scan-validate")
                    ? "{\"project\":\"P6\",\"version\":\"A\",\"codes\":[\"0012AZ\",\"09x\"]}"
                    : "{\"barcode\":\"0012AZ\",\"projet\":\"P6\",\"version\":\"A\",\"scanCodes\":[\"0012AZ\",\"09x\"]}";
            mvc.perform(post(path).contentType("application/json").content(body)).andExpect(status().isOk());
            mvc.perform(post(path).contentType("application/json").content(body.replace("09x", "B/+9")))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void usesActualReferenceVersionEvenWhenCallerClaimsAnotherVersion() throws Exception {
        rules();
        doReturn(List.of(new ScanRule(6, "00", "AZ"))).when(quality).getDeliberaScanRules("P6", "A");
        doReturn(List.of(new ScanRule(8, "00", "AZ"))).when(quality).getDeliberaScanRules("P6", "B");
        doReturn(Optional.of(Map.of("TABLE_NAME", "P6", "PDEF", "0012AZ", "VERSION", "B")))
                .when(quality).lookupScanBarcode(List.of("P6"), "0012AZ", false);
        doReturn(Optional.of(Map.of("TABLE_NAME", "P6", "PDEF", "0012AZ", "VERSION", "B")))
                .when(quality).lookupScanBarcode(List.of("P6"), "0012AZ", false, "A");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(post("/api/delibera/scan-validate").contentType("application/json")
                .content("{\"project\":\"P6\",\"version\":\"A\",\"codes\":[\"0012AZ\"]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/delibera/records").contentType("application/json")
                .content("{\"barcode\":\"0012AZ\",\"projet\":\"P6\",\"version\":\"A\",\"scanCodes\":[\"0012AZ\"]}"))
                .andExpect(status().isBadRequest());
        verify(repo, never()).insertRecord(any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void selectedVersionResolvesSharedReferenceAndUsesItsOwnRules() throws Exception {
        doReturn(List.of(new ScanRule(8, "B", "9"), new ScanRule(3, "0", "x")))
                .when(quality).getDeliberaScanRules("P6", "B");
        doReturn(Map.of("rules", List.of(new ScanRule(8, "B", "9"), new ScanRule(3, "0", "x"))))
                .when(quality).getReferenceScanSettings("P6", "B0000009", "B");
        doReturn(Optional.of(Map.of("TABLE_NAME", "P6", "PDEF", "B0000009", "VERSION", "B")))
                .when(quality).lookupScanBarcode(List.of("P6"), "B0000009", false, "B");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(post("/api/delibera/scan-validate").contentType("application/json")
                .content("{\"project\":\"P6\",\"version\":\"B\",\"codes\":[\"B0000009\",\"09x\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value("B"));
        verify(quality).lookupScanBarcode(List.of("P6"), "B0000009", false, "B");
        mvc.perform(post("/api/delibera/records").contentType("application/json")
                .content("{\"barcode\":\"B0000009\",\"projet\":\"P6\",\"version\":\"B\",\"scanCodes\":[\"B0000009\",\"09x\"]}"))
                .andExpect(status().isOk());
    }

    @Test
    void cannotCreateOkOrNokBeforeAllCodesAreValidAndMatchingPrimary() throws Exception {
        rules();
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
        for (String status : List.of("RETURNED", "NOT_RETURNED")) {
            for (String codes : List.of("[\"0012AZ\"]", "[\"0012AZ\",\"\"]", "[\"0012AZ\",\"C/+9\"]",
                    "[\"0012AZ\",\"B/+8\"]", "[\"0012AZ\",\"B9\"]", "[\"0012AZ\",\"B/+99\"]",
                    "[\"other!\",\"B/+9\"]")) {
                mvc.perform(post("/api/delibera/records").contentType("application/json")
                        .content("{\"barcode\":\"0012AZ\",\"projet\":\"P6\",\"statutReprise\":\"" + status
                                + "\",\"scanCodes\":" + codes + "}"))
                        .andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.startsWith("Code-barres erroné")));
            }
        }
        verify(repo, never()).insertRecord(any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void validatesAndSavesTheCodesWithTheSameRecordForBothModes() throws Exception {
        rules();
        when(repo.insertRecord(any(), any(), any(), any(), any(), any(), any(), any(), any(), any())).thenReturn(42L);
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
        for (String status : List.of("RETURNED", "NOT_RETURNED")) {
            mvc.perform(post("/api/delibera/scan-validate").contentType("application/json")
                    .content("{\"project\":\"P6\",\"codes\":[\"0012AZ\",\"B/+9\"]}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.found").value(true));
            mvc.perform(post("/api/delibera/records").contentType("application/json")
                    .content("{\"barcode\":\"0012AZ\",\"projet\":\"P6\",\"statutReprise\":\"" + status
                            + "\",\"scanCodes\":[\"0012AZ\",\"B/+9\"]}")).andExpect(status().isOk());
        }
        verify(repo, times(2)).saveScanCodes(42L, List.of("0012AZ", "B/+9"));
    }

    @Test
    void cannotOpenExistingPieceWithDifferentComplementaryCode() throws Exception {
        rules();
        when(repo.findActiveRecordByBarcode("0012AZ")).thenReturn(Optional.of(
                Map.of("ID", 1, "PROJET", "P6", "SCAN_CODE_2", "B119")));
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(post("/api/delibera/scan-validate").contentType("application/json")
                .content("{\"project\":\"P6\",\"codes\":[\"0012AZ\",\"B229\"]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("code 2")));
    }

    @Test
    void manualNokSavesMultiplePostesDefectsAndCheckpointsOnOnePiece() throws Exception {
        rules();
        when(repo.insertRecord(any(), any(), any(), any(), any(), any(), any(), any(), any(), any())).thenReturn(42L);
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(post("/api/delibera/records").contentType("application/json").content("""
                {"barcode":"0012AZ","projet":"P6","scanCodes":["0012AZ","B/+9"],
                 "statutReprise":"NOT_RETURNED","posteIds":[11,12,11],"couturiereId":23,
                 "defauts":[{"codeDefaut":"D1","descDefaut":"Couture"},{"codeDefaut":"D2","descDefaut":"Tissu"}],
                 "checkpointResults":[{"checkpoint":"Couture","status":"NOK"}]}
                """)).andExpect(status().isOk());
        verify(repo).insertRecord(eq("0012AZ"), eq("P6"), isNull(), isNull(), isNull(),
                eq(11L), eq(23L), any(), isNull(), eq("NOT_RETURNED"));
        verify(repo).saveRecordPostes(42L, List.of(11L, 12L));
        verify(repo).saveScanCodes(42L, List.of("0012AZ", "B/+9"));
        verify(repo).insertRecordDefaut(42L, "D1", "Couture", "INITIAL");
        verify(repo).insertRecordDefaut(42L, "D2", "Tissu", "INITIAL");
        verify(repo).replaceRecordCheckpoints(eq(42L), argThat(rows -> rows.size() == 1 && "NOK".equals(rows.get(0).get("status"))));
    }

    @Test
    void editingAndReadingKeepEverySelectedPoste() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
        when(repo.findRecordById(42L)).thenReturn(Map.of("ID", 42L));
        when(repo.findRecordPostes(42L)).thenReturn(List.of(Map.of("ID", 11L, "NOM", "A"), Map.of("ID", 12L, "NOM", "B")));
        mvc.perform(put("/api/delibera/records/42").contentType("application/json")
                .content("{\"posteIds\":[11,12],\"couturiereId\":23}")).andExpect(status().isOk());
        verify(repo).updateRecord(42L, 11L, 23L);
        verify(repo).saveRecordPostes(42L, List.of(11L, 12L));
        mvc.perform(get("/api/delibera/records/42")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.postes.length()").value(2))
                .andExpect(jsonPath("$.data.POSTE_NOM").value("A / B"));
        mvc.perform(put("/api/delibera/records/42").contentType("application/json")
                .content("{\"posteIds\":[1.5]}")).andExpect(status().isBadRequest());
        verify(repo, times(1)).updateRecord(anyLong(), any(), any());
    }
}
