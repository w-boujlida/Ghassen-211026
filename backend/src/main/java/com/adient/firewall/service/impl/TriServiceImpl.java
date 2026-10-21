package com.adient.firewall.service.impl;

import com.adient.firewall.dto.PageResponse;
import com.adient.firewall.dto.TriFicheDto;
import com.adient.firewall.dto.TriFicheInput;
import com.adient.firewall.dto.TriZoneDto;
import com.adient.firewall.dto.TriZoneInput;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.repository.TriRepository;
import com.adient.firewall.service.interfaces.ITriService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class TriServiceImpl implements ITriService {

    private final TriRepository triRepo;
    private final QualityRepository qualityRepo;

    private static final List<String> VALID_STATUSES = List.of("NON LANCEE", "ENCOURS", "CLOTURE");

    private static final String[] ZONE_KEYS   = {
        "MAGASIN_MP", "COUPE", "DECOUPE_LIGNE", "LIGNE_COUTURE",
        "ZONE_DELIBERA", "ZONE_FW", "RACK_PF", "MAGASIN_PF"
    };
    private static final String[] ZONE_LABELS = {
        "MAGASIN MP", "COUPE", "DECOUPE LIGNE", "LIGNE COUTURE",
        "ZONE DELIBERA", "ZONE FW", "RACK PF", "MAGASIN PF"
    };

    @Override
    public PageResponse<TriFicheDto> getFiches(String projet, String status, int page, int limit) {
        int total = triRepo.countFiches(projet, status);
        List<Map<String, Object>> rows = triRepo.fetchFiches(projet, status, page, limit);
        List<TriFicheDto> fiches = rows.stream().map(this::toDto).collect(Collectors.toList());
        return PageResponse.of(fiches, page, limit, total);
    }

    @Override
    public TriFicheDto getFicheById(Long id) {
        try {
            Map<String, Object> row = triRepo.fetchFicheById(id);
            return toDto(row);
        } catch (Exception e) {
            throw new NoSuchElementException("Fiche TRI introuvable: " + id);
        }
    }

    @Override
    @Transactional
    public TriFicheDto createFiche(TriFicheInput input) {
        validate(input);
        String projet = input.projet().toUpperCase();
        int num = triRepo.getNextNum(projet);
        String dateTri = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        Long id = triRepo.insertFiche(projet, num, dateTri,
                nvl(input.coiffe()), nvl(input.version()), nvl(input.defaut()), nvl(input.status(), "NON LANCEE"));
        if (input.zones() != null && !input.zones().isEmpty()) {
            triRepo.insertZones(id, input.zones());
        }
        return getFicheById(id);
    }

    @Override
    @Transactional
    public TriFicheDto updateFiche(Long id, TriFicheInput input) {
        validate(input);
        Map<String, Object> existing;
        try {
            existing = triRepo.fetchFicheById(id);
        } catch (Exception e) {
            throw new NoSuchElementException("Fiche TRI introuvable: " + id);
        }
        String dateTri = str(existing.get("DATE_TRI"));
        if (dateTri == null || dateTri.isBlank()) dateTri = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        triRepo.updateFiche(id, dateTri, nvl(input.coiffe()), nvl(input.version()),
                nvl(input.defaut()), nvl(input.status(), "NON LANCEE"));
        triRepo.deleteZonesByFiche(id);
        if (input.zones() != null && !input.zones().isEmpty()) {
            triRepo.insertZones(id, input.zones());
        }
        return getFicheById(id);
    }

    @Override
    @Transactional
    public void deleteFiche(Long id) {
        int rows = triRepo.deleteFiche(id);
        if (rows == 0) throw new NoSuchElementException("Fiche TRI introuvable: " + id);
    }

    @Override
    public List<String> getAvailableProjects() {
        return qualityRepo.getProjectNames();
    }

    @Override
    public Map<String, Object> getStats(String projet) {
        return triRepo.fetchStats(projet);
    }

    @Override
    public byte[] exportExcel(String projet, String status) throws Exception {
        List<Map<String, Object>> fiches = triRepo.fetchAllForExport(projet, status);

        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Tri Export");

            // ── Styles ────────────────────────────────────────────────────────
            CellStyle hdrMain = wb.createCellStyle();
            hdrMain.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
            hdrMain.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            hdrMain.setAlignment(HorizontalAlignment.CENTER);
            hdrMain.setBorderBottom(BorderStyle.THIN);
            Font fWhite = wb.createFont(); fWhite.setColor(IndexedColors.WHITE.getIndex()); fWhite.setBold(true);
            hdrMain.setFont(fWhite);

            CellStyle hdrGlobale = wb.createCellStyle();
            hdrGlobale.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            hdrGlobale.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            hdrGlobale.setAlignment(HorizontalAlignment.CENTER);
            Font fGrey = wb.createFont(); fGrey.setColor(IndexedColors.DARK_TEAL.getIndex()); fGrey.setBold(true);
            hdrGlobale.setFont(fGrey);

            CellStyle hdrTriee = wb.createCellStyle();
            hdrTriee.setFillForegroundColor(IndexedColors.LIGHT_BLUE.getIndex());
            hdrTriee.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            hdrTriee.setAlignment(HorizontalAlignment.CENTER);
            Font fBlue = wb.createFont(); fBlue.setColor(IndexedColors.DARK_BLUE.getIndex()); fBlue.setBold(true);
            hdrTriee.setFont(fBlue);

            CellStyle hdrNok = wb.createCellStyle();
            hdrNok.setFillForegroundColor(IndexedColors.ROSE.getIndex());
            hdrNok.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            hdrNok.setAlignment(HorizontalAlignment.CENTER);
            Font fRed = wb.createFont(); fRed.setColor(IndexedColors.DARK_RED.getIndex()); fRed.setBold(true);
            hdrNok.setFont(fRed);

            CellStyle hdrOk = wb.createCellStyle();
            hdrOk.setFillForegroundColor(IndexedColors.LIGHT_GREEN.getIndex());
            hdrOk.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            hdrOk.setAlignment(HorizontalAlignment.CENTER);
            Font fGreen = wb.createFont(); fGreen.setColor(IndexedColors.DARK_GREEN.getIndex()); fGreen.setBold(true);
            hdrOk.setFont(fGreen);

            CellStyle dataCtr = wb.createCellStyle();
            dataCtr.setAlignment(HorizontalAlignment.CENTER);

            // ── Row 0: main headers (4 cols per zone: GLOBALE, TRIEE, NOK, OK) ─
            Row h0 = sheet.createRow(0);
            String[] mainCols = {"NUM", "DATE", "PROJET", "COIFFE", "VERSION", "DEFAUT", "STATUS"};
            for (int i = 0; i < mainCols.length; i++) {
                Cell c = h0.createCell(i);
                c.setCellValue(mainCols[i]);
                c.setCellStyle(hdrMain);
                sheet.addMergedRegion(new CellRangeAddress(0, 1, i, i));
            }
            int col = mainCols.length;
            for (String label : ZONE_LABELS) {
                Cell c = h0.createCell(col);
                c.setCellValue(label);
                c.setCellStyle(hdrMain);
                sheet.addMergedRegion(new CellRangeAddress(0, 0, col, col + 3));
                col += 4;
            }

            // ── Row 1: GLOBALE / TRIEE / NOK / OK sub-headers ─────────────────
            Row h1 = sheet.createRow(1);
            col = mainCols.length;
            for (int i = 0; i < ZONE_KEYS.length; i++) {
                Cell cg = h1.createCell(col);   cg.setCellValue("QTE GLOBALE"); cg.setCellStyle(hdrGlobale);
                Cell ct = h1.createCell(col+1); ct.setCellValue("QTE TRIEE");   ct.setCellStyle(hdrTriee);
                Cell cn = h1.createCell(col+2); cn.setCellValue("QTE NOK");     cn.setCellStyle(hdrNok);
                Cell co = h1.createCell(col+3); co.setCellValue("QTE OK");      co.setCellStyle(hdrOk);
                col += 4;
            }

            // ── Data rows ─────────────────────────────────────────────────────
            int rowIdx = 2;
            for (Map<String, Object> fiche : fiches) {
                Long ficheId = ((Number) fiche.get("ID")).longValue();
                List<Map<String, Object>> zones = triRepo.fetchZonesByFiche(ficheId);
                Map<String, int[]> zoneMap = new HashMap<>();
                for (Map<String, Object> z : zones) {
                    String zn = str(z.get("ZONE_NAME"));
                    int qg = z.get("QTE_GLOBALE") instanceof Number n ? n.intValue() : 0;
                    int qt = z.get("QTE_TRIEE")   instanceof Number n ? n.intValue() : 0;
                    int qn = z.get("QTE_NOK")     instanceof Number n ? n.intValue() : 0;
                    int qo = z.get("QTE_OK")      instanceof Number n ? n.intValue() : 0;
                    zoneMap.put(zn, new int[]{qg, qt, qn, qo});
                }

                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(fiche.get("NUM") instanceof Number n ? n.intValue() : 0);
                row.createCell(1).setCellValue(str(fiche.get("DATE_TRI")));
                row.createCell(2).setCellValue(str(fiche.get("PROJET")));
                row.createCell(3).setCellValue(str(fiche.get("COIFFE")));
                row.createCell(4).setCellValue(str(fiche.get("VERSION")));
                row.createCell(5).setCellValue(str(fiche.get("DEFAUT")));
                row.createCell(6).setCellValue(str(fiche.get("STATUS")));
                col = mainCols.length;
                for (String key : ZONE_KEYS) {
                    int[] vals = zoneMap.getOrDefault(key, new int[]{0, 0, 0, 0});
                    Cell cg = row.createCell(col);   cg.setCellValue(vals[0]); cg.setCellStyle(dataCtr);
                    Cell ct = row.createCell(col+1); ct.setCellValue(vals[1]); ct.setCellStyle(dataCtr);
                    Cell cn = row.createCell(col+2); cn.setCellValue(vals[2]); cn.setCellStyle(dataCtr);
                    Cell co = row.createCell(col+3); co.setCellValue(vals[3]); co.setCellStyle(dataCtr);
                    col += 4;
                }
            }

            // auto-size first 7 columns
            for (int i = 0; i < 7; i++) sheet.autoSizeColumn(i);

            wb.write(out);
            return out.toByteArray();
        }
    }

    @Override
    @Transactional
    public Map<String, Object> importExcel(byte[] data) throws Exception {
        int imported = 0, skipped = 0;
        List<String> errors = new ArrayList<>();

        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(data))) {
            Sheet sheet = wb.getSheetAt(0);
            // Row 0 and 1 are headers — data starts at row 2
            for (int i = 2; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                try {
                    int    num     = (int) getNumericCell(row, 0);
                    String dateTri = getStringCell(row, 1);
                    String projet  = getStringCell(row, 2).toUpperCase();
                    String coiffe  = getStringCell(row, 3);
                    String version = getStringCell(row, 4);
                    String defaut  = getStringCell(row, 5);
                    String status  = getStringCell(row, 6).toUpperCase();
                    if (projet.isBlank()) { skipped++; continue; }
                    if (status.isBlank()) status = "NON LANCEE";

                    if (triRepo.ficheExistsByNumProjet(num, projet)) {
                        skipped++;
                        continue;
                    }
                    if (dateTri.isBlank()) dateTri = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);

                    Long id = triRepo.insertFiche(projet, num, dateTri, coiffe, version, defaut, status);

                    List<TriZoneInput> zones = new ArrayList<>();
                    int col = 7;
                    for (String key : ZONE_KEYS) {
                        int qg = (int) getNumericCell(row, col);
                        int qt = (int) getNumericCell(row, col + 1);
                        int qn = (int) getNumericCell(row, col + 2);
                        int qo = (int) getNumericCell(row, col + 3);
                        if (qg > 0 || qt > 0 || qn > 0) zones.add(new TriZoneInput(key, qg, qt, qn, qo));
                        col += 4;
                    }
                    if (!zones.isEmpty()) triRepo.insertZones(id, zones);
                    imported++;
                } catch (Exception e) {
                    errors.add("Ligne " + (i + 1) + ": " + e.getMessage());
                }
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("imported", imported);
        result.put("skipped",  skipped);
        result.put("errors",   errors);
        return result;
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private void validate(TriFicheInput input) {
        if (input.projet() == null || input.projet().isBlank())
            throw new IllegalArgumentException("Le projet est obligatoire");
        String status = nvl(input.status(), "NON LANCEE").toUpperCase();
        if (VALID_STATUSES.stream().noneMatch(s -> s.equalsIgnoreCase(status)))
            throw new IllegalArgumentException("Statut invalide: " + status);
    }

    private TriFicheDto toDto(Map<String, Object> row) {
        Long id = toLong(row.get("ID"));
        List<Map<String, Object>> zoneRows = triRepo.fetchZonesByFiche(id);
        List<TriZoneDto> zones = zoneRows.stream()
                .map(z -> new TriZoneDto(
                        toLong(z.get("ID")),
                        str(z.get("ZONE_NAME")),
                        toInt(z.get("QTE_GLOBALE")),
                        toInt(z.get("QTE_TRIEE")),
                        toInt(z.get("QTE_NOK")),
                        toInt(z.get("QTE_OK"))))
                .collect(Collectors.toList());
        return new TriFicheDto(
                id,
                toInt(row.get("NUM")),
                str(row.get("DATE_TRI")),
                str(row.get("PROJET")),
                str(row.get("COIFFE")),
                str(row.get("VERSION")),
                str(row.get("DEFAUT")),
                str(row.get("STATUS")),
                zones);
    }

    private String str(Object o) { return o != null ? o.toString() : ""; }
    private String nvl(String s) { return s != null ? s : ""; }
    private String nvl(String s, String def) { return (s != null && !s.isBlank()) ? s : def; }
    private Long toLong(Object o) { return o instanceof Number n ? n.longValue() : 0L; }
    private Integer toInt(Object o) { return o instanceof Number n ? n.intValue() : 0; }

    private String getStringCell(Row row, int col) {
        Cell c = row.getCell(col);
        if (c == null) return "";
        return switch (c.getCellType()) {
            case STRING  -> c.getStringCellValue().trim();
            case NUMERIC -> String.valueOf((int) c.getNumericCellValue());
            default      -> "";
        };
    }

    private double getNumericCell(Row row, int col) {
        Cell c = row.getCell(col);
        if (c == null) return 0;
        return switch (c.getCellType()) {
            case NUMERIC -> c.getNumericCellValue();
            case STRING  -> { try { yield Double.parseDouble(c.getStringCellValue().trim()); } catch (Exception e) { yield 0; } }
            default      -> 0;
        };
    }
}
