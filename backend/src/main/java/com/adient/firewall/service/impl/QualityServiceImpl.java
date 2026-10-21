package com.adient.firewall.service.impl;

import com.adient.firewall.dto.PageResponse;
import com.adient.firewall.dto.QualityRecordDto;
import com.adient.firewall.dto.QualityRecordInput;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.IQualityService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class QualityServiceImpl implements IQualityService {

    private final QualityRepository repo;

    private static final List<DateTimeFormatter> DATE_FORMATS = List.of(
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd"),
            DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss"),
            DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"),
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ofPattern("MM/dd/yyyy HH:mm:ss"),
            DateTimeFormatter.ofPattern("MM/dd/yyyy HH:mm"),
            DateTimeFormatter.ofPattern("MM/dd/yyyy"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm:ss"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy"),
            DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss"),
            DateTimeFormatter.ofPattern("yyyy/MM/dd"),
            DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss"),
            DateTimeFormatter.ofPattern("dd.MM.yyyy"),
            DateTimeFormatter.ofPattern("dd/MM/yyyy h:mm a"),
            DateTimeFormatter.ofPattern("MM/dd/yyyy h:mm:ss a"),
            DateTimeFormatter.ofPattern("MM/dd/yyyy h:mm a")
    );

    private static final DateTimeFormatter OUT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    // ─── Read ─────────────────────────────────────────────────────────────────

    @Override
    public PageResponse<QualityRecordDto> getRecords(
            String tablePrefix, String operatorCol, String projet,
            int page, int limit, Map<String, String> filters) {

        String tableName = QualityRepository.safe(tablePrefix + "_" + projet);
        repo.ensureTableColumnsOnce(tableName, operatorCol);
        String where = buildWhere(filters, operatorCol);
        Object[] params = buildParams(filters);

        int total = repo.countRecords(tableName, where, params);
        // limit<=0 means "no cap" (used by exports): fetch every matching record instead
        // of truncating at an arbitrary page size.
        int effectiveLimit = limit > 0 ? limit : Math.max(total, 1);
        List<Map<String, Object>> rows = repo.fetchRecords(tableName, operatorCol, where, params, page, effectiveLimit);
        List<QualityRecordDto> records = groupByBarcode(rows, operatorCol);

        return PageResponse.of(records, page, effectiveLimit, total);
    }

    @Override
    public Map<String, Object> getStats(String tablePrefix, String projet) {
        return getStats(tablePrefix, projet, "today", null, null);
    }

    @Override
    public Map<String, Object> getStats(String tablePrefix, String projet, String period, String dateFrom, String dateTo) {
        return getStats(tablePrefix, projet, period, dateFrom, dateTo, null, null);
    }

    @Override
    public Map<String, Object> getStats(String tablePrefix, String projet, String period, String dateFrom, String dateTo,
                                        String superviseur, String poste) {
        String tableName = QualityRepository.safe(tablePrefix + "_" + projet);
        String today = LocalDate.now().toString();
        String from, to;
        switch (period != null ? period : "today") {
            case "month" -> { from = LocalDate.now().withDayOfMonth(1).toString(); to = today; }
            case "custom" -> { from = (dateFrom != null && !dateFrom.isBlank()) ? dateFrom : today;
                               to   = (dateTo   != null && !dateTo.isBlank())   ? dateTo   : today; }
            default -> { from = today; to = today; }
        }
        Map<String, Object> totals = repo.fetchStatsByPeriod(tableName, from, to, superviseur, poste);
        String defect = repo.fetchCommonDefectByPeriod(tableName, from, to, superviseur, poste);
        long total     = toLong(totals.get("TOTAL"));
        long okCount   = toLong(totals.get("OK_COUNT"));
        long returned  = toLong(totals.get("RETURNED"));
        long scrapped  = toLong(totals.get("SCRAPPED"));
        long notRet    = toLong(totals.get("NOT_RETURNED"));
        int  retPct    = total > 0 ? (int) Math.round((double) returned / total * 100) : 0;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total",             total);
        result.put("okItems",           okCount);
        result.put("returned",          returned);
        result.put("scrapped",          scrapped);
        result.put("notReturned",       notRet);
        result.put("returnedPercent",   retPct);
        result.put("mostCommonDefect",  defect != null ? defect : "-");
        // backward-compat aliases used by existing frontend
        result.put("todayItems",    total);
        result.put("returnedToday", returned);
        result.put("commonDefect",  defect != null ? defect : "-");
        result.put("projet",        projet);
        return result;
    }

    @Override
    public Map<String, Object> getReport(String tablePrefix, String projet, Map<String, String> filters) {
        String tableName = QualityRepository.safe(tablePrefix + "_" + projet);
        List<String> conds = new ArrayList<>();
        List<Object> params = new ArrayList<>();

        conds.add("REPRISE='Not Returned'");
        if (filters.containsKey("supervisor") && !filters.get("supervisor").isBlank()) {
            conds.add("LOWER(SUPERVISEUR)=?");
            params.add(filters.get("supervisor").toLowerCase());
        }
        if (filters.containsKey("ref") && !filters.get("ref").isBlank()) {
            conds.add("INSTR(LOWER(REF),?)>0");
            params.add(filters.get("ref").toLowerCase());
        }
        if (filters.containsKey("startDate") && !filters.get("startDate").isBlank()) {
            conds.add("DATEFW BETWEEN TO_DATE(?,'YYYY-MM-DD') AND TO_DATE(?,'YYYY-MM-DD')");
            params.add(filters.get("startDate"));
            params.add(filters.getOrDefault("endDate", filters.get("startDate")));
        }

        String where = "WHERE " + String.join(" AND ", conds);
        Integer cnt = repo.getJdbcTemplate().queryForObject(
                "SELECT COUNT(DISTINCT BARCODE) FROM SYSTEM." + tableName + " " + where,
                Integer.class, params.toArray());

        return Map.of("partCount", cnt != null ? cnt : 0);
    }

    @Override
    @Transactional
    public void deleteByKey(String tablePrefix, String projet, String barCode, String codDef) {
        String tableName = QualityRepository.safe(tablePrefix + "_" + projet);
        int rows = repo.deleteRecord(tableName, barCode, codDef);
        if (rows == 0) throw new NoSuchElementException("Record not found");
    }

    @Override
    public List<String> getSources(String tablePrefix) {
        if ("FIREWALL".equals(tablePrefix)) return repo.getFirewallTables();
        if ("CSL".equals(tablePrefix))      return repo.getCslTables();
        return List.of();
    }

    // ─── Write ────────────────────────────────────────────────────────────────

    @Override
    @Transactional
    public void createRecord(String tablePrefix, String operatorCol, QualityRecordInput in) {
        String target = detectTable(tablePrefix, in.barCode());
        ensureTableReady(target, operatorCol);
        repo.insertQualityRecord(target, operatorCol, buildMap(in, operatorCol));
    }

    @Override
    @Transactional
    public Map<String, Object> importRecords(String tablePrefix, String operatorCol, String projet, List<QualityRecordInput> records) {
        String tableName = QualityRepository.safe(tablePrefix + "_" + projet);
        ensureTableReady(tableName, operatorCol);

        // Detect which columns actually exist on the table (handles legacy PHP tables
        // that may be missing DEFECT_STATUS, REF2, REF3, SUPERVISEUR, etc.)
        Set<String> tableCols = repo.getTableColumnNames(tableName);
        if (tableCols.isEmpty()) {
            log.warn("Column detection failed for {} — import will use minimal safe column set", tableName);
        } else {
            log.info("Import: table={} columns({}): {}", tableName, tableCols.size(), tableCols);
        }

        int total = records.size();
        int inserted = 0, skipped = 0, errors = 0;
        for (QualityRecordInput in : records) {
            if (in.barCode() == null || in.barCode().isBlank() ||
                    in.codeDef() == null || in.codeDef().isBlank()) {
                skipped++;
                continue;
            }
            Map<String, Object> p = buildMap(in, operatorCol);
            try {
                int rows = repo.insertIfNotExistsDynamic(tableName, operatorCol, tableCols, p);
                if (rows > 0) inserted++;
                else skipped++;
            } catch (Exception e) {
                errors++;
                Throwable root = e.getCause() != null ? e.getCause() : e;
                // Log full stack on first 3 errors to diagnose root cause, then summarize
                if (errors <= 3) {
                    log.error("Import ERROR #{} barCode={} codeDef={} table={} | {}: {}",
                            errors, in.barCode(), in.codeDef(), tableName,
                            root.getClass().getSimpleName(), root.getMessage());
                } else if (errors == 4) {
                    log.error("Import errors continuing for table {} — suppressing further per-row logs", tableName);
                }
            }
        }
        return Map.of("total", total, "inserted", inserted, "skipped", skipped, "errors", errors);
    }

    @Override
    @Transactional
    public void updateRecord(String tablePrefix, String operatorCol, String projet, Long id, QualityRecordInput in) {
        String tableName = QualityRepository.safe(tablePrefix + "_" + projet);
        repo.ensureTableColumns(tableName, operatorCol);
        int rows = repo.updateQualityRecord(tableName, operatorCol, buildMap(in, operatorCol));
        if (rows == 0) throw new NoSuchElementException("Record not found");
    }

    @Override
    @Transactional
    public void deleteRecord(String tablePrefix, String projet, Long id, String codDef) {
        String tableName = QualityRepository.safe(tablePrefix + "_" + projet);
        int rows;
        if (id != null) {
            rows = repo.getJdbcTemplate().update("DELETE FROM SYSTEM." + tableName + " WHERE ID=?", id);
        } else {
            rows = repo.getJdbcTemplate().update("DELETE FROM SYSTEM." + tableName + " WHERE CODDEF=?", codDef);
        }
        if (rows == 0) throw new NoSuchElementException("Record not found");
    }

    // ─── Table readiness ──────────────────────────────────────────────────────

    /**
     * Prepares a legacy table (created by the old PHP app) for Spring Boot inserts:
     * 1. Adds any missing columns (REF2, REF3, DEFECT_STATUS, SUPERVISEUR, …)
     * 2. Creates the ID sequence if it does not exist
     * 3. Creates or replaces the BEFORE-INSERT trigger so ID is always populated
     *
     * @param tableName   e.g. "FIREWALL_P6" or "CSL_J4U"
     * @param operatorCol "CQFW" or "CQCSL"
     */
    private void ensureTableReady(String tableName, String operatorCol) {
        // 1. Add missing columns
        repo.ensureTableColumns(tableName, operatorCol);

        // 2. Derive naming convention from table name
        // BUG FIX: "FIREWALL_" = 9 chars, "CSL_" = 4 chars — correct.
        // But the table name from QualityRepository.safe() is already uppercased,
        // so we must derive project in UPPER then lower for seq/trig names.
        boolean isCsl  = tableName.startsWith("CSL_");
        // BUG FIX: use the full prefix length to extract project correctly
        //   "FIREWALL_P7"  → prefix "FIREWALL_" (9)  → project = "P7"
        //   "CSL_P7"       → prefix "CSL_"      (4)  → project = "P7"
        //   Always use tableName as-is (already safe/uppercase from repo)
        String prefix  = isCsl ? "CSL_" : "FIREWALL_";
        String project = tableName.substring(prefix.length());            // e.g. "P7"
        String projLow = project.toLowerCase();                           // e.g. "p7"

        // BUG FIX: Oracle USER_SEQUENCES stores names in UPPERCASE.
        // Keep seqName in lowercase for CREATE, but query with UPPER().
        // Consistent naming: firewall → "p7_seq" / csl → "csl_p7_seq"
        String seqName  = (isCsl ? "csl_" : "") + projLow + "_seq";      // e.g. "p7_seq"
        // BUG FIX: trigName must be UPPER to match Oracle's case-sensitive quoted identifiers.
        // Use same convention as PHP legacy: "P7_BI" (firewall) or "CSL_P7_BI" (csl)
        String trigName = (isCsl ? "CSL_" : "") + project + "_BI";       // e.g. "P7_BI"

        JdbcTemplate db = repo.getJdbcTemplate();

        // 3. Create sequence in SYSTEM schema if missing.
        // CRITICAL FIX: The sequence MUST be created in SYSTEM schema because:
        //   - The trigger is compiled in the context of the SYSTEM schema (table owner)
        //   - When the trigger calls SEQ.NEXTVAL, Oracle resolves the name in SYSTEM's schema
        //   - If the sequence lives in the Spring Boot user's schema, Oracle can't find it → ORA-02289
        String seqFull = "SYSTEM." + seqName.toUpperCase();               // e.g. SYSTEM.P7_SEQ
        try {
            Integer seqExists = db.queryForObject(
                    "SELECT COUNT(*) FROM ALL_SEQUENCES WHERE SEQUENCE_OWNER='SYSTEM' AND SEQUENCE_NAME=UPPER(?)",
                    Integer.class, seqName);
            if (seqExists == null || seqExists == 0) {
                int maxId = 0;
                try {
                    Integer m = db.queryForObject(
                            "SELECT NVL(MAX(ID),0) FROM SYSTEM." + tableName, Integer.class);
                    if (m != null) maxId = m;
                } catch (Exception ex) {
                    log.warn("Could not read MAX(ID) from {} — starting sequence at 1. Cause: {}", tableName, ex.getMessage());
                }
                db.execute("CREATE SEQUENCE " + seqFull +
                        " START WITH " + (maxId + 1) + " INCREMENT BY 1 NOCACHE NOCYCLE");
                log.info("Created sequence {} starting at {} for table {}", seqFull, maxId + 1, tableName);
            } else {
                log.debug("Sequence {} already exists in SYSTEM schema", seqFull);
            }
        } catch (Exception e) {
            log.error("CRITICAL: Could not ensure sequence {} for table {}: {}", seqFull, tableName, e.getMessage());
        }

        // 4. Create or replace the BEFORE INSERT trigger.
        // The trigger references the sequence by its simple name (Oracle resolves in SYSTEM schema context).
        try {
            String onTable   = "SYSTEM." + tableName;                      // e.g. SYSTEM.FIREWALL_P7
            String seqSimple = seqName.toUpperCase();                      // e.g. P7_SEQ (resolved in SYSTEM context)
            String trigSql   = "CREATE OR REPLACE TRIGGER SYSTEM.\"" + trigName + "\" " +
                    "BEFORE INSERT ON " + onTable + " FOR EACH ROW WHEN (NEW.ID IS NULL) " +
                    "BEGIN :NEW.ID := " + seqSimple + ".NEXTVAL; END;";
            db.execute(trigSql);
            log.info("Ensured trigger SYSTEM.{} ON {} using sequence {}", trigName, onTable, seqSimple);
        } catch (Exception e) {
            log.error("CRITICAL: Could not create/replace trigger {} for table {}: {}", trigName, tableName, e.getMessage());
        }
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private String detectTable(String prefix, String barcode) {
        List<String> projects = repo.getProjectNames();
        for (int len : new int[]{12, 10, 14}) {
            if (barcode.length() < len) continue;
            String pdef = barcode.substring(0, len);
            Optional<Map<String, Object>> hit = repo.lookupBarcode(projects, pdef);
            if (hit.isPresent()) {
                String proj = (String) hit.get().get("TABLE_NAME");
                return QualityRepository.safe(prefix + "_" + proj);
            }
        }
        throw new NoSuchElementException("Barcode not found in any project: " + barcode);
    }

    private Map<String, Object> buildMap(QualityRecordInput in, String operatorCol) {
        String now = LocalDateTime.now().format(OUT_FMT);
        String operator = "CQFW".equals(operatorCol) ? in.cqFw() : in.cqCsl();
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("barCode",    in.barCode());
        p.put("datefw",     normalizeDate(in.dateFw(), now));
        p.put("operator",   operator);
        p.put("cqDelibera", in.cqDelibera());
        p.put("ref",        in.ref());
        p.put("codeDef",    in.codeDef());
        p.put("checkpoint", in.checkpoint());
        p.put("descDef",    in.descDef());
        p.put("qty",        in.qty() != null ? in.qty() : 1);
        p.put("version",    in.version());
        p.put("poste",      in.poste());
        p.put("remarque",   in.remarque());
        p.put("demirite",   in.demirite() != null ? in.demirite() : 0);
        p.put("reprise",    in.reprise() != null ? in.reprise() : "Not Returned");
        p.put("ref2",       in.ref2());
        p.put("ref3",       in.ref3());
        p.put("tampon",     in.tampon() != null ? in.tampon() : in.cqDelibera());
        p.put("project",      in.project());
        p.put("equipeProd",   in.equipe2() != null ? in.equipe2() : in.equipeProd());
        p.put("superviseur",  in.superviseur());
        p.put("defstatus",    in.defstatus() != null ? in.defstatus() : (in.defStatus() != null ? in.defStatus() : "NOT FIXED"));
        p.put("refDetail",    in.refDetail() != null ? in.refDetail() : in.ref());
        p.put("recordStatus", in.recordStatus() != null ? in.recordStatus() : "Open");
        p.put("matricule",    in.matricule());
        p.put("nomComplet",   in.nomComplet());
        return p;
    }

    private List<QualityRecordDto> groupByBarcode(List<Map<String, Object>> rows, String operatorCol) {
        List<QualityRecordDto> result = new ArrayList<>();
        String lastBarcode = null;
        for (Map<String, Object> row : rows) {
            String barcode = (String) row.get("BARCODE");
            if (barcode == null) continue;
            if (!barcode.equals(lastBarcode)) {
                lastBarcode = barcode;
                result.add(new QualityRecordDto(
                        toLong(row.get("ID")), barcode,
                        (String) row.get("DATEFW"), (String) row.get("DATE_CODE"),
                        "CQFW".equals(operatorCol)  ? (String) row.get("CQFW")  : null,
                        "CQCSL".equals(operatorCol) ? (String) row.get("CQCSL") : null,
                        (String) row.get("CQDELIBERA"), (String) row.get("REF"),
                        (String) row.get("VERSION"),    (String) row.get("POSTE"),
                        (String) row.get("REMARQUEDEFAUT"), (String) row.get("REPRISE"),
                        (String) row.get("REF2"), (String) row.get("REF3"),
                        (String) row.get("TAMPON"), (String) row.get("REFDETAIL"),
                        (String) row.get("PROJET"), (String) row.get("EQUIPEPROD"),
                        (String) row.get("SUPERVISEUR"),
                        (String) row.get("RECORD_STATUS"),
                        (String) row.get("MATRICULE"), (String) row.get("NOM_COMPLET"),
                        new ArrayList<>()
                ));
            }
            result.getLast().defects().add(new QualityRecordDto.DefectEntry(
                    (String) row.get("CODDEF"), (String) row.get("CHECKPOINT"), (String) row.get("DESC_DEF"),
                    row.get("QTY") != null ? ((Number) row.get("QTY")).intValue() : 0,
                    row.get("DEMERITE"), (String) row.get("DEFECT_STATUS")
            ));
        }
        return result;
    }

    private String buildWhere(Map<String, String> f, String operatorCol) {
        List<String> conds = new ArrayList<>();
        if (f.containsKey("search") && !f.get("search").isBlank())
            conds.add("(UPPER(BARCODE) LIKE UPPER(?) OR UPPER(" + operatorCol + ") LIKE UPPER(?) OR " +
                    "UPPER(CODDEF) LIKE UPPER(?) OR UPPER(DESC_DEF) LIKE UPPER(?) OR UPPER(POSTE) LIKE UPPER(?))");
        switch (f.getOrDefault("dateFilter", "")) {
            case "today"  -> conds.add("TO_CHAR(DATEFW,'YYYY-MM-DD')=TO_CHAR(SYSDATE,'YYYY-MM-DD')");
            case "week"   -> conds.add("DATEFW>=TRUNC(SYSDATE,'IW')");
            case "month"  -> conds.add("DATEFW>=TRUNC(SYSDATE,'MM')");
            case "custom" -> {
                if (f.containsKey("dateFrom") && !f.get("dateFrom").isBlank())
                    conds.add("TO_CHAR(DATEFW,'YYYY-MM-DD') BETWEEN ? AND ?");
            }
        }
        if (f.containsKey("superviseur") && !f.get("superviseur").isBlank())
            conds.add("UPPER(SUPERVISEUR)=UPPER(?)");
        if (f.containsKey("poste") && !f.get("poste").isBlank())
            conds.add("UPPER(POSTE) LIKE UPPER(?)");
        if (f.containsKey("refFilter") && !f.get("refFilter").isBlank())
            conds.add("INSTR(LOWER(REF),?)>0");
        if (f.containsKey("versionFilter") && !f.get("versionFilter").isBlank())
            conds.add("LOWER(VERSION)=?");
        if (f.containsKey("repriseFilter") && !f.get("repriseFilter").isBlank())
            conds.add("NVL(REPRISE,'Not Returned')=?");
        if (f.containsKey("barcodeFilter") && !f.get("barcodeFilter").isBlank())
            conds.add("BARCODE=?");
        if (f.containsKey("recordStatus") && !f.get("recordStatus").isBlank()) {
            if ("NOT_OK".equalsIgnoreCase(f.get("recordStatus")))
                conds.add("NVL(UPPER(RECORD_STATUS),'OPEN')<>'OK'");
            else
                conds.add("UPPER(NVL(RECORD_STATUS,'OPEN'))=UPPER(?)");
        }
        return conds.isEmpty() ? "" : String.join(" AND ", conds);
    }

    private Object[] buildParams(Map<String, String> f) {
        List<Object> p = new ArrayList<>();
        if (f.containsKey("search") && !f.get("search").isBlank()) {
            String s = "%" + f.get("search") + "%";
            p.add(s); p.add(s); p.add(s); p.add(s); p.add(s);
        }
        if (f.getOrDefault("dateFilter","").equals("custom") && f.containsKey("dateFrom") && !f.get("dateFrom").isBlank()) {
            p.add(f.get("dateFrom"));
            p.add(f.getOrDefault("dateTo", f.get("dateFrom")));
        }
        if (f.containsKey("superviseur") && !f.get("superviseur").isBlank())
            p.add(f.get("superviseur"));
        if (f.containsKey("poste") && !f.get("poste").isBlank())
            p.add("%" + f.get("poste") + "%");
        if (f.containsKey("refFilter") && !f.get("refFilter").isBlank())
            p.add(f.get("refFilter").toLowerCase());
        if (f.containsKey("versionFilter") && !f.get("versionFilter").isBlank())
            p.add(f.get("versionFilter").toLowerCase());
        if (f.containsKey("repriseFilter") && !f.get("repriseFilter").isBlank())
            p.add(f.get("repriseFilter"));
        if (f.containsKey("barcodeFilter") && !f.get("barcodeFilter").isBlank())
            p.add(f.get("barcodeFilter"));
        if (f.containsKey("recordStatus") && !f.get("recordStatus").isBlank()
                && !"NOT_OK".equalsIgnoreCase(f.get("recordStatus")))
            p.add(f.get("recordStatus"));
        return p.toArray();
    }

    private String normalizeDate(String raw, String fallback) {
        if (raw == null || raw.isBlank()) return fallback;
        String s = raw.trim();
        for (DateTimeFormatter fmt : DATE_FORMATS) {
            try { return LocalDateTime.parse(s, fmt).format(OUT_FMT); } catch (DateTimeParseException ignored) {}
            try { return LocalDate.parse(s, fmt).atStartOfDay().format(OUT_FMT); } catch (DateTimeParseException ignored) {}
        }
        return fallback;
    }

    private long toLong(Object o) { return o instanceof Number n ? n.longValue() : 0L; }

    @Override
    @Transactional
    public void bulkUpdateReprise(String tablePrefix, String projet, List<String> barcodes, String reprise) {
        if (barcodes == null || barcodes.isEmpty()) return;
        if (!Set.of("Returned", "Scrap", "Not Returned").contains(reprise))
            throw new IllegalArgumentException("Valeur reprise invalide: " + reprise + ". Valeurs autorisées: Returned, Scrap, Not Returned");
        String tableName = QualityRepository.safe(tablePrefix + "_" + projet);
        repo.bulkUpdateReprise(tableName, barcodes, reprise);
    }
}
