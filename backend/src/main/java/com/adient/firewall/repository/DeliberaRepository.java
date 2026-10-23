package com.adient.firewall.repository;

import com.adient.firewall.dto.CouturiereDto;
import com.adient.firewall.dto.DeliberaRecordDto;
import com.adient.firewall.dto.DeliberaReturnRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.PostConstruct;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.*;

@Repository
@RequiredArgsConstructor
@Slf4j
public class DeliberaRepository {

    private final JdbcTemplate db;

    @PostConstruct
    public void init() {
        // Add CREATED_BY column for user-level filtering (migration-safe)
        try { db.execute("ALTER TABLE SYSTEM.DELIBERA_RECORDS ADD CREATED_BY VARCHAR2(100)"); }
        catch (Exception ignored) {}
        // Add LIGNE column (project line, copied from the reference at scan time)
        try { db.execute("ALTER TABLE SYSTEM.DELIBERA_RECORDS ADD LIGNE VARCHAR2(26 BYTE)"); }
        catch (Exception ignored) {}
        // Add CHECKPOINT column (checkpoint chosen at scan time, from REF_CHECKPOINTS)
        try { db.execute("ALTER TABLE SYSTEM.DELIBERA_RECORDS ADD CHECKPOINT VARCHAR2(500)"); }
        catch (Exception ignored) {}
        ensureRecordCheckpointsTable();
        ensureHourlyTargetsTable();
        ensureScanCodeColumns();
        ensureRecordPostesTable();
        for (var column : Map.of("RETURN_JUSTIFICATION", "VARCHAR2(2000 CHAR)",
                "RETURNED_BY", "VARCHAR2(100)", "RETURNED_AT", "TIMESTAMP").entrySet()) {
            Integer count = db.queryForObject(
                    "SELECT COUNT(*) FROM ALL_TAB_COLUMNS WHERE OWNER='SYSTEM' AND TABLE_NAME='DELIBERA_RECORDS' AND COLUMN_NAME=?",
                    Integer.class, column.getKey());
            if (count == null) throw new IllegalStateException("Impossible de vérifier le schéma Délibéra");
            if (count == 0) db.execute("ALTER TABLE SYSTEM.DELIBERA_RECORDS ADD "
                    + column.getKey() + " " + column.getValue());
        }
        // Composite index to speed up projet+ligne+date_scan filtering (comptage horaire, listing, KPIs)
        try { db.execute("CREATE INDEX SYSTEM.IDX_DELIBERA_PROJ_LIGNE_DT ON SYSTEM.DELIBERA_RECORDS (PROJET, LIGNE, CREATED_AT)"); }
        catch (Exception ignored) {}
    }

    public void ensureRecordPostesTable() {
        Integer count = db.queryForObject(
                "SELECT COUNT(*) FROM ALL_TABLES WHERE OWNER='SYSTEM' AND TABLE_NAME='DELIBERA_RECORD_POSTES'",
                Integer.class);
        if (count == null) throw new IllegalStateException("Impossible de vérifier les postes Délibéra");
        if (count == 0) db.execute("""
                CREATE TABLE SYSTEM.DELIBERA_RECORD_POSTES (
                    RECORD_ID NUMBER NOT NULL REFERENCES SYSTEM.DELIBERA_RECORDS(ID) ON DELETE CASCADE,
                    POSTE_ID NUMBER NOT NULL REFERENCES SYSTEM.POSTES(ID),
                    PRIMARY KEY (RECORD_ID, POSTE_ID)
                )
                """);
    }

    public void saveRecordPostes(long recordId, List<Long> posteIds) {
        db.update("DELETE FROM SYSTEM.DELIBERA_RECORD_POSTES WHERE RECORD_ID=?", recordId);
        for (Long posteId : posteIds) {
            db.update("INSERT INTO SYSTEM.DELIBERA_RECORD_POSTES (RECORD_ID,POSTE_ID) VALUES (?,?)", recordId, posteId);
        }
    }

    public List<Map<String, Object>> findRecordPostes(long recordId) {
        return db.queryForList("""
                SELECT p.ID,p.NOM FROM SYSTEM.POSTES p
                WHERE p.ID IN (SELECT POSTE_ID FROM SYSTEM.DELIBERA_RECORD_POSTES WHERE RECORD_ID=?
                    UNION SELECT POSTE_ID FROM SYSTEM.DELIBERA_RECORDS WHERE ID=?)
                ORDER BY p.NOM,p.ID
                """, recordId, recordId);
    }

    public void ensureScanCodeColumns() {
        for (String column : List.of("SCAN_CODE_2", "SCAN_CODE_3")) {
            Integer count = db.queryForObject(
                    "SELECT COUNT(*) FROM ALL_TAB_COLUMNS WHERE OWNER='SYSTEM' AND TABLE_NAME='DELIBERA_RECORDS' AND COLUMN_NAME=?",
                    Integer.class, column);
            if (count == null) throw new IllegalStateException("Impossible de vérifier les codes complémentaires Délibéra");
            if (count == 0) db.execute("ALTER TABLE SYSTEM.DELIBERA_RECORDS ADD " + column + " VARCHAR2(100 CHAR)");
        }
    }

    private void ensureRecordCheckpointsTable() {
        Integer count = db.queryForObject(
                "SELECT COUNT(*) FROM ALL_TABLES WHERE OWNER='SYSTEM' AND TABLE_NAME='DELIBERA_RECORD_CHECKPOINTS'",
                Integer.class);
        if (count == null) throw new IllegalStateException("Impossible de vérifier le schéma des checkpoints Délibéra");
        if (count == 0) {
            db.execute("""
                CREATE TABLE SYSTEM.DELIBERA_RECORD_CHECKPOINTS (
                    ID          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    RECORD_ID   NUMBER NOT NULL,
                    PROJECT_NAME VARCHAR2(50),
                    LIGNE       VARCHAR2(26),
                    PDEF        VARCHAR2(26),
                    FAS         VARCHAR2(26),
                    DESIGNATION VARCHAR2(128),
                    VERSION     VARCHAR2(26),
                    REF_DETAIL  VARCHAR2(26),
                    CHECKPOINT  VARCHAR2(500) NOT NULL,
                    STATUS      VARCHAR2(3) NOT NULL,
                    CONSTRAINT CK_DELIBERA_CHECKPOINT_STATUS CHECK (STATUS IN ('OK','NOK')),
                    CONSTRAINT UQ_DELIBERA_RECORD_CHECKPOINT UNIQUE (RECORD_ID, CHECKPOINT),
                    CONSTRAINT FK_DELIBERA_RECORD_CHECKPOINT FOREIGN KEY (RECORD_ID)
                        REFERENCES SYSTEM.DELIBERA_RECORDS(ID) ON DELETE CASCADE
                )
            """);
        }
    }

    private void ensureHourlyTargetsTable() {
        Integer count = db.queryForObject(
            "SELECT COUNT(*) FROM ALL_TABLES WHERE OWNER='SYSTEM' AND TABLE_NAME='DELIBERA_HOURLY_TARGETS'",
            Integer.class);
        if (count == null || count == 0) {
            db.execute("""
                CREATE TABLE SYSTEM.DELIBERA_HOURLY_TARGETS (
                    ID          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    TARGET_DATE DATE NOT NULL,
                    PROJET      VARCHAR2(100) NOT NULL,
                    LIGNE       VARCHAR2(100) NOT NULL,
                    HEURE       NUMBER(2) NOT NULL,
                    TARGET_QTY  NUMBER(10) DEFAULT 0 NOT NULL,
                    UPDATED_BY  VARCHAR2(100),
                    UPDATED_AT  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    CONSTRAINT UQ_DELIBERA_HOURLY_TARGET UNIQUE (TARGET_DATE, PROJET, LIGNE, HEURE),
                    CONSTRAINT CK_DELIBERA_HOURLY_HOUR CHECK (HEURE BETWEEN 0 AND 23),
                    CONSTRAINT CK_DELIBERA_HOURLY_QTY CHECK (TARGET_QTY >= 0)
                )
            """);
        }
    }

    // ─── Couturières ──────────────────────────────────────────────────────────

    public List<CouturiereDto> findCouturieres(String projet, String equipe) {
        StringBuilder sql = new StringBuilder(
            "SELECT ID,MATRICULE,NOM,PROJET,EQUIPE,ACTIF FROM SYSTEM.DELIBERA_COUTURIERES WHERE 1=1 ");
        List<Object> p = new ArrayList<>();
        if (projet != null && !projet.isBlank()) { sql.append("AND UPPER(PROJET)=UPPER(?) "); p.add(projet); }
        if (equipe != null && !equipe.isBlank()) { sql.append("AND UPPER(EQUIPE)=UPPER(?) "); p.add(equipe); }
        sql.append("ORDER BY NOM");
        return db.query(sql.toString(), p.toArray(), (rs, i) -> new CouturiereDto(
            rs.getLong("ID"), rs.getString("MATRICULE"), rs.getString("NOM"),
            rs.getString("PROJET"), rs.getString("EQUIPE"), rs.getInt("ACTIF")));
    }

    public long insertCouturiere(CouturiereDto dto) {
        KeyHolder kh = new GeneratedKeyHolder();
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                "INSERT INTO SYSTEM.DELIBERA_COUTURIERES (MATRICULE,NOM,PROJET,EQUIPE,ACTIF) VALUES (?,?,?,?,?)",
                new String[]{"ID"});
            ps.setString(1, dto.matricule());
            ps.setString(2, dto.nom());
            ps.setString(3, dto.projet());
            ps.setString(4, dto.equipe());
            ps.setInt(5, dto.actif() != null ? dto.actif() : 1);
            return ps;
        }, kh);
        return Objects.requireNonNull(kh.getKey()).longValue();
    }

    public void updateCouturiere(CouturiereDto dto) {
        db.update("UPDATE SYSTEM.DELIBERA_COUTURIERES SET MATRICULE=?,NOM=?,PROJET=?,EQUIPE=?,ACTIF=? WHERE ID=?",
            dto.matricule(), dto.nom(), dto.projet(), dto.equipe(),
            dto.actif() != null ? dto.actif() : 1, dto.id());
    }

    public void deleteCouturiere(long id) {
        db.update("DELETE FROM SYSTEM.DELIBERA_COUTURIERES WHERE ID=?", id);
    }

    @Transactional
    public Map<String, Integer> importCouturieres(List<CouturiereDto> list) {
        Set<String> existing = new HashSet<>(db.queryForList(
                "SELECT UPPER(MATRICULE) FROM SYSTEM.DELIBERA_COUTURIERES WHERE MATRICULE IS NOT NULL",
                String.class));
        Set<String> seen = new HashSet<>();
        int inserted = 0;
        int skipped = 0;
        for (CouturiereDto dto : list) {
            if (dto.matricule() == null || dto.matricule().isBlank()
                    || dto.nom() == null || dto.nom().isBlank()) {
                throw new IllegalArgumentException("Matricule et nom de couturière obligatoires");
            }
            String matricule = dto.matricule().trim().toUpperCase(Locale.ROOT);
            if (!seen.add(matricule) || existing.contains(matricule)) {
                skipped++;
                continue;
            }
            db.update("INSERT INTO SYSTEM.DELIBERA_COUTURIERES (MATRICULE,NOM,PROJET,EQUIPE,ACTIF) VALUES (?,?,?,?,?)",
                dto.matricule().trim(), dto.nom().trim(), dto.projet(), dto.equipe(), dto.actif() != null ? dto.actif() : 1);
            existing.add(matricule);
            inserted++;
        }
        return Map.of("inserted", inserted, "skipped", skipped);
    }

    // ─── Barcode lookup ───────────────────────────────────────────────────────

    public Optional<Map<String, Object>> lookupBarcode(String barcode) {
        // Search across all FIREWALL_* and CSL_* tables for this barcode
        List<String> tables = db.queryForList(
            "SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME LIKE 'FIREWALL_%' OR TABLE_NAME LIKE 'CSL_%' ORDER BY TABLE_NAME",
            String.class);
        for (String tbl : tables) {
            try {
                List<Map<String, Object>> rows = db.queryForList(
                    "SELECT PROJET,REF,VERSION FROM SYSTEM." + tbl + " WHERE BARCODE=? AND ROWNUM=1", barcode);
                if (!rows.isEmpty()) return Optional.of(rows.get(0));
            } catch (Exception ignored) {}
        }
        // Also check project reference tables
        List<String> projTables = db.queryForList(
            "SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME NOT LIKE 'FIREWALL_%' AND TABLE_NAME NOT LIKE 'CSL_%' " +
            "AND TABLE_NAME NOT IN ('APP_USERS','POLY','LOGIN_HISTORY','AUDIT_LOG','ROLE_PERMISSIONS','CUSTOM_ROLES'," +
            "'DELIBERA_COUTURIERES','DELIBERA_RECORDS','DELIBERA_RECORD_DEFAUTS') ORDER BY TABLE_NAME",
            String.class);
        for (String tbl : projTables) {
            try {
                List<Map<String, Object>> rows = db.queryForList(
                    "SELECT FAS_ADIENT_PART_NUMBER AS REF, DESIGNATION, VERSION FROM SYSTEM.\"" + tbl + "\" " +
                    "WHERE FAS_ADIENT_PART_NUMBER=? AND ROWNUM=1", barcode);
                if (!rows.isEmpty()) {
                    Map<String, Object> r = new HashMap<>(rows.get(0));
                    r.put("PROJET", tbl);
                    return Optional.of(r);
                }
            } catch (Exception ignored) {}
        }
        return Optional.empty();
    }

    // ─── Records ──────────────────────────────────────────────────────────────

    public Optional<Map<String, Object>> findActiveRecordByBarcode(String barcode) {
        List<Map<String, Object>> rows = db.queryForList(
            "SELECT ID,BARCODE,PROJET,REFERENCE,VERSION,LIGNE,SCAN_CODE_2,SCAN_CODE_3,POSTE_ID,COUTURIERE_ID,STATUT_REPRISE," +
            "TO_CHAR(CREATED_AT,'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT " +
            "FROM SYSTEM.DELIBERA_RECORDS WHERE BARCODE=? AND STATUT_REPRISE='NOT_RETURNED' " +
            "ORDER BY CREATED_AT DESC FETCH FIRST 1 ROWS ONLY", barcode);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public boolean hasReturnedRecord(String barcode) {
        Integer count = db.queryForObject(
            "SELECT COUNT(*) FROM SYSTEM.DELIBERA_RECORDS WHERE BARCODE=? AND STATUT_REPRISE='RETURNED'",
            Integer.class, barcode);
        return count != null && count > 0;
    }

    public void saveScanCodes(long id, List<String> codes) {
        db.update("UPDATE SYSTEM.DELIBERA_RECORDS SET SCAN_CODE_2=?,SCAN_CODE_3=? WHERE ID=?",
                new org.springframework.jdbc.core.SqlParameterValue(java.sql.Types.VARCHAR, codes.size() > 1 ? codes.get(1) : null),
                new org.springframework.jdbc.core.SqlParameterValue(java.sql.Types.VARCHAR, codes.size() > 2 ? codes.get(2) : null), id);
    }

    public long insertRecord(String barcode, String projet, String reference, String version, String ligne,
                             Long posteId, Long couturiereId, String createdBy, String checkpoint, String statutReprise) {
        KeyHolder kh = new GeneratedKeyHolder();
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                "INSERT INTO SYSTEM.DELIBERA_RECORDS (BARCODE,PROJET,REFERENCE,VERSION,LIGNE,POSTE_ID,COUTURIERE_ID,CREATED_BY,CHECKPOINT,STATUT_REPRISE) " +
                "VALUES (?,?,?,?,?,?,?,?,?,?)", new String[]{"ID"});
            ps.setString(1, barcode);
            ps.setString(2, projet);
            ps.setString(3, reference);
            ps.setString(4, version);
            ps.setString(5, ligne);
            if (posteId != null) ps.setLong(6, posteId); else ps.setNull(6, java.sql.Types.NUMERIC);
            if (couturiereId != null) ps.setLong(7, couturiereId); else ps.setNull(7, java.sql.Types.NUMERIC);
            ps.setString(8, createdBy);
            ps.setString(9, checkpoint);
            ps.setString(10, statutReprise != null ? statutReprise : "NOT_RETURNED");
            return ps;
        }, kh);
        return Objects.requireNonNull(kh.getKey()).longValue();
    }

    public void insertRecordDefaut(long recordId, String codeDefaut, String descDefaut, String addedAt) {
        db.update("INSERT INTO SYSTEM.DELIBERA_RECORD_DEFAUTS (RECORD_ID,CODE_DEFAUT,DESC_DEFAUT,ADDED_AT) VALUES (?,?,?,?)",
            recordId, codeDefaut, descDefaut, addedAt != null ? addedAt : "INITIAL");
    }

    public List<Map<String, Object>> findDefautsByRecordId(long recordId) {
        return db.queryForList(
            "SELECT ID,RECORD_ID,CODE_DEFAUT,DESC_DEFAUT,VERIFIE,ADDED_AT FROM SYSTEM.DELIBERA_RECORD_DEFAUTS " +
            "WHERE RECORD_ID=? ORDER BY ID", recordId);
    }

    public void updateDefautVerifie(long defautId, boolean verifie) {
        db.update("UPDATE SYSTEM.DELIBERA_RECORD_DEFAUTS SET VERIFIE=? WHERE ID=?", verifie ? 1 : 0, defautId);
    }

    public void updateRecordStatut(long recordId, String statut) {
        db.update("UPDATE SYSTEM.DELIBERA_RECORDS SET STATUT_REPRISE=?,UPDATED_AT=CURRENT_TIMESTAMP WHERE ID=?",
            statut, recordId);
    }

    @Transactional("oracleTransactionManager")
    public void replaceRecordCheckpoints(long recordId, List<Map<String, String>> checkpoints) {
        db.update("DELETE FROM SYSTEM.DELIBERA_RECORD_CHECKPOINTS WHERE RECORD_ID=?", recordId);
        for (Map<String, String> checkpoint : checkpoints) {
            db.update("INSERT INTO SYSTEM.DELIBERA_RECORD_CHECKPOINTS " +
                            "(RECORD_ID,PROJECT_NAME,LIGNE,PDEF,FAS,DESIGNATION,VERSION,REF_DETAIL,CHECKPOINT,STATUS) " +
                            "VALUES (?,?,?,?,?,?,?,?,?,?)",
                    recordId, checkpoint.get("project"), checkpoint.get("ligne"), checkpoint.get("pdef"),
                    checkpoint.get("fas"), checkpoint.get("designation"), checkpoint.get("version"),
                    checkpoint.get("refDetail"), checkpoint.get("checkpoint"), checkpoint.get("status"));
        }
    }

    public List<Map<String, Object>> findRecordCheckpoints(long recordId) {
        return db.queryForList(
                "SELECT PROJECT_NAME,LIGNE,PDEF,FAS,DESIGNATION,VERSION,REF_DETAIL,CHECKPOINT,STATUS " +
                        "FROM SYSTEM.DELIBERA_RECORD_CHECKPOINTS WHERE RECORD_ID=? ORDER BY ID",
                recordId);
    }

    @Transactional("oracleTransactionManager")
    public void returnToOk(long recordId, DeliberaReturnRequest request, String user) {
        if (request == null) throw new IllegalArgumentException("Confirmation du retour requise");
        String justification = request.justification() == null ? "" : request.justification().trim();
        if (justification.length() > 2000) throw new IllegalArgumentException("Le justificatif est limité à 2000 caractères");
        List<Long> selected = request.resolvedDefectIds() == null ? List.of() : request.resolvedDefectIds();
        if (selected.stream().anyMatch(Objects::isNull) || new HashSet<>(selected).size() != selected.size()) {
            throw new IllegalArgumentException("Sélection de défauts invalide");
        }
        if (!"NOT_RETURNED".equals(lockRecordStatus(recordId))) {
            throw new IllegalStateException("Cette coiffe est déjà OK. Le retour ne peut pas être enregistré une seconde fois.");
        }

        List<Map<String, Object>> defects = db.queryForList(
                "SELECT ID,VERIFIE FROM SYSTEM.DELIBERA_RECORD_DEFAUTS WHERE RECORD_ID=? ORDER BY ID FOR UPDATE", recordId);
        Set<Long> ids = new HashSet<>();
        for (Map<String, Object> defect : defects) ids.add(((Number) defect.get("ID")).longValue());
        if (!ids.containsAll(selected)) throw new IllegalArgumentException("Un défaut sélectionné n'appartient pas à cette coiffe");
        boolean allResolved = !defects.isEmpty() && defects.stream().allMatch(defect ->
                selected.contains(((Number) defect.get("ID")).longValue())
                        || defect.get("VERIFIE") instanceof Number n && n.intValue() == 1);
        if (justification.isEmpty() && !allResolved) {
            throw new IllegalArgumentException("Ajoutez un justificatif ou confirmez tous les codes défauts résolus");
        }
        for (Long id : selected) {
            db.update("UPDATE SYSTEM.DELIBERA_RECORD_DEFAUTS SET VERIFIE=1 WHERE ID=? AND RECORD_ID=?", id, recordId);
        }
        db.update("UPDATE SYSTEM.DELIBERA_RECORDS SET STATUT_REPRISE='RETURNED', RETURN_JUSTIFICATION=?, "
                        + "RETURNED_BY=?, RETURNED_AT=CURRENT_TIMESTAMP, UPDATED_AT=CURRENT_TIMESTAMP WHERE ID=?",
                justification.isEmpty() ? null : justification, user, recordId);
    }

    public String lockRecordStatus(long recordId) {
        Map<String, Object> record = db.queryForMap(
                "SELECT STATUT_REPRISE FROM SYSTEM.DELIBERA_RECORDS WHERE ID=? FOR UPDATE", recordId);
        return Objects.toString(record.get("STATUT_REPRISE"), "");
    }

    public Map<String, Object> findRecordById(long id) {
        return db.queryForMap(
            "SELECT r.ID, r.BARCODE, r.SCAN_CODE_2, r.SCAN_CODE_3, r.PROJET, r.REFERENCE, r.VERSION, r.LIGNE, r.CHECKPOINT, " +
            "r.POSTE_ID, r.COUTURIERE_ID, r.STATUT_REPRISE, r.CREATED_BY, r.RETURN_JUSTIFICATION, r.RETURNED_BY, " +
            "TO_CHAR(r.RETURNED_AT,'YYYY-MM-DD HH24:MI:SS') AS RETURNED_AT, " +
            "TO_CHAR(r.CREATED_AT,'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT, " +
            "p.NOM AS POSTE_NOM, c.NOM AS COUTURIERE_NOM, c.MATRICULE AS COUTURIERE_MATRICULE " +
            "FROM SYSTEM.DELIBERA_RECORDS r " +
            "LEFT JOIN SYSTEM.POSTES p ON r.POSTE_ID = p.ID " +
            "LEFT JOIN SYSTEM.DELIBERA_COUTURIERES c ON r.COUTURIERE_ID = c.ID " +
            "WHERE r.ID=?", id);
    }

    public List<Map<String, Object>> listRecords(String projet, String statut, String dateFrom, String dateTo,
                                                  String refDetail, String shift, String createdBy, int page, int limit) {
        StringBuilder sql = new StringBuilder(
            "SELECT r.ID, r.BARCODE, r.SCAN_CODE_2, r.SCAN_CODE_3, r.PROJET, r.REFERENCE, r.VERSION, r.LIGNE, r.CHECKPOINT, r.POSTE_ID, r.STATUT_REPRISE, " +
            "r.CREATED_BY, r.RETURN_JUSTIFICATION, r.RETURNED_BY, " +
            "TO_CHAR(r.RETURNED_AT,'YYYY-MM-DD HH24:MI:SS') AS RETURNED_AT, " +
            "TO_CHAR(r.CREATED_AT,'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT, " +
            "p.NOM AS POSTE_NOM, c.NOM AS COUTURIERE_NOM, r.COUTURIERE_ID, " +
            "u.MATRICULE AS SCANNER_MATRICULE, NVL(u.FULL_NAME, r.CREATED_BY) AS SCANNER_NOM " +
            "FROM SYSTEM.DELIBERA_RECORDS r " +
            "LEFT JOIN SYSTEM.POSTES p ON r.POSTE_ID = p.ID " +
            "LEFT JOIN SYSTEM.DELIBERA_COUTURIERES c ON r.COUTURIERE_ID = c.ID " +
            "LEFT JOIN SYSTEM.APP_USERS u ON UPPER(u.MATRICULE) = UPPER(r.CREATED_BY) " +
            "WHERE 1=1 ");
        List<Object> params = new ArrayList<>();
        appendDeliberaFilters(sql, params, projet, statut, dateFrom, dateTo, refDetail, shift, createdBy);
        sql.append("ORDER BY r.CREATED_AT DESC ");

        int offset = (page - 1) * limit;
        sql.append("OFFSET ? ROWS FETCH NEXT ? ROWS ONLY");
        params.add(offset);
        params.add(limit);

        return db.queryForList(sql.toString(), params.toArray());
    }

    public int countRecordsDelibera(String projet, String statut, String dateFrom, String dateTo,
                                    String refDetail, String shift, String createdBy) {
        StringBuilder sql = new StringBuilder(
            "SELECT COUNT(*) FROM SYSTEM.DELIBERA_RECORDS r " +
            "LEFT JOIN SYSTEM.POSTES p ON r.POSTE_ID = p.ID WHERE 1=1 ");
        List<Object> params = new ArrayList<>();
        appendDeliberaFilters(sql, params, projet, statut, dateFrom, dateTo, refDetail, shift, createdBy);
        Integer cnt = db.queryForObject(sql.toString(), Integer.class, params.toArray());
        return cnt != null ? cnt : 0;
    }

    private void appendDeliberaFilters(StringBuilder sql, List<Object> params,
                                        String projet, String statut, String dateFrom, String dateTo,
                                        String refDetail, String shift, String createdBy) {
        if (projet    != null && !projet.isBlank())    { sql.append("AND UPPER(r.PROJET)=UPPER(?) ");            params.add(projet); }
        if (statut    != null && !statut.isBlank())    { sql.append("AND r.STATUT_REPRISE=? ");                  params.add(statut); }
        if (dateFrom  != null && !dateFrom.isBlank())  { sql.append("AND TRUNC(r.CREATED_AT) >= TO_DATE(?,'YYYY-MM-DD') "); params.add(dateFrom); }
        if (dateTo    != null && !dateTo.isBlank())    { sql.append("AND TRUNC(r.CREATED_AT) <= TO_DATE(?,'YYYY-MM-DD') "); params.add(dateTo); }
        // Partial match on REFERENCE, trimmed and case-insensitive
        if (refDetail != null && !refDetail.isBlank()) { sql.append("AND UPPER(r.REFERENCE) LIKE UPPER(?) ");   params.add("%" + refDetail.trim() + "%"); }
        if (createdBy != null && !createdBy.isBlank()) { sql.append("AND UPPER(r.CREATED_BY) LIKE UPPER(?) ");  params.add("%" + createdBy.trim() + "%"); }
        // Shift filter using EXTRACT(HOUR) — SHIFT_3 wraps midnight via OR
        if (shift     != null && !shift.isBlank()) {
            switch (shift) {
                case "SHIFT_1" -> sql.append("AND EXTRACT(HOUR FROM r.CREATED_AT) >= 6  AND EXTRACT(HOUR FROM r.CREATED_AT) < 14 ");
                case "SHIFT_2" -> sql.append("AND EXTRACT(HOUR FROM r.CREATED_AT) >= 14 AND EXTRACT(HOUR FROM r.CREATED_AT) < 22 ");
                case "SHIFT_3" -> sql.append("AND (EXTRACT(HOUR FROM r.CREATED_AT) >= 22 OR EXTRACT(HOUR FROM r.CREATED_AT) < 6) ");
            }
        }
    }

    // Returns distinct CREATED_BY values joined with APP_USERS for the user filter dropdown
    public List<Map<String, Object>> listCreatedByUsers(String projet) {
        StringBuilder sql = new StringBuilder(
            "SELECT DISTINCT r.CREATED_BY AS matricule, NVL(u.FULL_NAME, r.CREATED_BY) AS fullName " +
            "FROM SYSTEM.DELIBERA_RECORDS r " +
            "LEFT JOIN SYSTEM.APP_USERS u ON UPPER(u.MATRICULE) = UPPER(r.CREATED_BY) " +
            "WHERE r.CREATED_BY IS NOT NULL ");
        List<Object> params = new ArrayList<>();
        if (projet != null && !projet.isBlank()) { sql.append("AND UPPER(r.PROJET)=UPPER(?) "); params.add(projet); }
        sql.append("ORDER BY fullName");
        return db.queryForList(sql.toString(), params.toArray());
    }

    public Map<String, Object> getKpis(String projet) {
        StringBuilder sql = new StringBuilder(
            "SELECT COUNT(*) AS TOTAL, " +
            "SUM(CASE WHEN STATUT_REPRISE='RETURNED' THEN 1 ELSE 0 END) AS RETURNED, " +
            "SUM(CASE WHEN STATUT_REPRISE='NOT_RETURNED' THEN 1 ELSE 0 END) AS NOT_RETURNED " +
            "FROM SYSTEM.DELIBERA_RECORDS WHERE 1=1 ");
        List<Object> params = new ArrayList<>();
        if (projet != null && !projet.isBlank()) { sql.append("AND UPPER(PROJET)=UPPER(?) "); params.add(projet); }
        return db.queryForMap(sql.toString(), params.toArray());
    }

    public List<Map<String, Object>> countRecordsByDay(String projet, String dateFrom, String dateTo) {
        StringBuilder sql = new StringBuilder(
            "SELECT TO_CHAR(TRUNC(CREATED_AT),'YYYY-MM-DD') AS JOUR, COUNT(*) AS CNT " +
            "FROM SYSTEM.DELIBERA_RECORDS WHERE 1=1 ");
        List<Object> params = new ArrayList<>();
        if (projet != null && !projet.isBlank()) { sql.append("AND UPPER(PROJET)=UPPER(?) "); params.add(projet); }
        if (dateFrom != null && !dateFrom.isBlank()) { sql.append("AND TRUNC(CREATED_AT)>=TO_DATE(?,'YYYY-MM-DD') "); params.add(dateFrom); }
        if (dateTo != null && !dateTo.isBlank()) { sql.append("AND TRUNC(CREATED_AT)<=TO_DATE(?,'YYYY-MM-DD') "); params.add(dateTo); }
        sql.append("GROUP BY TRUNC(CREATED_AT) ORDER BY TRUNC(CREATED_AT)");
        return db.queryForList(sql.toString(), params.toArray());
    }

    public List<Map<String, Object>> getHourlyOkNok(String date) {
        return db.queryForList(
            "SELECT UPPER(TRIM(PROJET)) AS PROJET, " +
            "NVL(NULLIF(UPPER(TRIM(LIGNE)),''),'SANS LIGNE') AS LIGNE, " +
            "EXTRACT(HOUR FROM CREATED_AT) AS HEURE, " +
            "SUM(CASE WHEN STATUT_REPRISE='RETURNED' THEN 1 ELSE 0 END) AS OK, " +
            "SUM(CASE WHEN STATUT_REPRISE='NOT_RETURNED' THEN 1 ELSE 0 END) AS NOK " +
            "FROM SYSTEM.DELIBERA_RECORDS " +
            "WHERE CREATED_AT>=TO_DATE(?,'YYYY-MM-DD') AND CREATED_AT<TO_DATE(?,'YYYY-MM-DD')+1 " +
            "GROUP BY UPPER(TRIM(PROJET)), NVL(NULLIF(UPPER(TRIM(LIGNE)),''),'SANS LIGNE'), EXTRACT(HOUR FROM CREATED_AT)",
            date, date);
    }

    public List<Map<String, Object>> getHourlyTargets(String date) {
        return db.queryForList(
            "SELECT UPPER(PROJET) AS PROJET, UPPER(LIGNE) AS LIGNE, HEURE, TARGET_QTY AS TARGET " +
            "FROM SYSTEM.DELIBERA_HOURLY_TARGETS WHERE TARGET_DATE=TO_DATE(?,'YYYY-MM-DD') " +
            "ORDER BY PROJET,LIGNE,HEURE", date);
    }

    public void upsertHourlyTarget(String date, String projet, String ligne, int heure, int target, String updatedBy) {
        db.update(
            "MERGE INTO SYSTEM.DELIBERA_HOURLY_TARGETS t " +
            "USING (SELECT TO_DATE(?,'YYYY-MM-DD') TARGET_DATE, ? PROJET, ? LIGNE, ? HEURE, ? TARGET_QTY, ? UPDATED_BY FROM DUAL) s " +
            "ON (t.TARGET_DATE=s.TARGET_DATE AND t.PROJET=s.PROJET AND t.LIGNE=s.LIGNE AND t.HEURE=s.HEURE) " +
            "WHEN MATCHED THEN UPDATE SET t.TARGET_QTY=s.TARGET_QTY,t.UPDATED_BY=s.UPDATED_BY,t.UPDATED_AT=CURRENT_TIMESTAMP " +
            "WHEN NOT MATCHED THEN INSERT (TARGET_DATE,PROJET,LIGNE,HEURE,TARGET_QTY,UPDATED_BY) " +
            "VALUES (s.TARGET_DATE,s.PROJET,s.LIGNE,s.HEURE,s.TARGET_QTY,s.UPDATED_BY)",
            date, projet, ligne, heure, target, updatedBy);
    }

    public void updateRecord(long id, Long posteId, Long couturiereId) {
        db.update("UPDATE SYSTEM.DELIBERA_RECORDS SET POSTE_ID=?, COUTURIERE_ID=?, UPDATED_AT=CURRENT_TIMESTAMP WHERE ID=?",
            posteId, couturiereId, id);
    }

    public void deleteRecord(long id) {
        db.update("DELETE FROM SYSTEM.DELIBERA_RECORD_DEFAUTS WHERE RECORD_ID=?", id);
        db.update("DELETE FROM SYSTEM.DELIBERA_RECORDS WHERE ID=?", id);
    }

    public void deleteRecordDefauts(long recordId) {
        db.update("DELETE FROM SYSTEM.DELIBERA_RECORD_DEFAUTS WHERE RECORD_ID=?", recordId);
    }

    // ─── Comptage horaire des scans (module Délibéra) ─────────────────────────

    // Une seule requête agrégée en base : GROUP BY sur l'heure (CREATED_AT est déjà en Africa/Tunis,
    // cf. connection-init-sql "ALTER SESSION SET TIME_ZONE='Africa/Tunis'"). Bornes [date, date+1[
    // plutôt que TRUNC(CREATED_AT)=? pour rester sargable sur l'index (PROJET, LIGNE, CREATED_AT).
    // Rétrocompatible : ligne peut être null/blank pour obtenir le comptage groupé par LIGNE + HEURE
    // pour tout le projet (utilisé par le dashboard Suivi Qualité afin d'éviter le N+1 par ligne).
    public List<Map<String, Object>> countScansParHeure(String projet, String ligne, String date) {
        StringBuilder sql = new StringBuilder(
            "SELECT r.LIGNE AS LIGNE, EXTRACT(HOUR FROM r.CREATED_AT) AS HEURE, COUNT(*) AS CNT " +
            "FROM SYSTEM.DELIBERA_RECORDS r " +
            "WHERE UPPER(r.PROJET) = UPPER(?) " +
            "AND r.CREATED_AT >= TO_DATE(?, 'YYYY-MM-DD') AND r.CREATED_AT < TO_DATE(?, 'YYYY-MM-DD') + 1 ");
        List<Object> params = new ArrayList<>(List.of(projet, date, date));
        if (ligne != null && !ligne.isBlank()) {
            sql.append("AND UPPER(r.LIGNE) = UPPER(?) ");
            params.add(ligne);
        }
        sql.append("GROUP BY r.LIGNE, EXTRACT(HOUR FROM r.CREATED_AT)");
        return db.queryForList(sql.toString(), params.toArray());
    }

    public List<Map<String, Object>> countScansParHeureGlobal(String date) {
        String sql =
            "SELECT r.PROJET AS PROJET, NVL(TRIM(r.LIGNE),'SANS LIGNE') AS LIGNE, " +
            "EXTRACT(HOUR FROM r.CREATED_AT) AS HEURE, COUNT(*) AS CNT " +
            "FROM SYSTEM.DELIBERA_RECORDS r " +
            "WHERE r.CREATED_AT >= TO_DATE(?, 'YYYY-MM-DD') " +
            "AND r.CREATED_AT < TO_DATE(?, 'YYYY-MM-DD') + 1 " +
            "GROUP BY r.PROJET, NVL(TRIM(r.LIGNE),'SANS LIGNE'), EXTRACT(HOUR FROM r.CREATED_AT)";
        return db.queryForList(sql, date, date);
    }

    // ─── Agrégations historiques (module Statistiques & Rapport) ──────────────
    // Toujours une seule requête GROUP BY/TRUNC par appel, bornes [dateDebut, dateFinExclusive[
    // pour rester sargable sur IDX_DELIBERA_PROJ_LIGNE_DT (PROJET, LIGNE, CREATED_AT) — jamais de
    // TRUNC()/EXTRACT() dans le WHERE.
    //
    // `unitTrunc` est inliné en littéral dans le texte SQL (pas en bind variable) : Oracle ne peut
    // pas garantir à la préparation qu'un bind variable TRUNC(date, ?) utilisé dans le SELECT et le
    // même bind utilisé dans le GROUP BY désigneront la même valeur à l'exécution, et rejette la
    // requête (ORA-00979, "not a GROUP BY expression"). `unitTrunc` reste whitelisté (jamais
    // construit depuis l'input HTTP brut) — re-vérifié ici en défense en profondeur.

    private static final Set<String> UNITS_TRUNC_VALIDES = Set.of("HH24", "DD", "IW");

    private static String validateUnitTrunc(String unitTrunc) {
        if (!UNITS_TRUNC_VALIDES.contains(unitTrunc))
            throw new IllegalArgumentException("Unité de troncature invalide: " + unitTrunc);
        return unitTrunc;
    }

    /** Vue globale tous projets : comptage par projet et par bucket temporel. */
    public List<Map<String, Object>> countScansParBucketProjet(String dateDebut, String dateFinExclusive, String unitTrunc) {
        String u = validateUnitTrunc(unitTrunc);
        String sql =
            "SELECT r.PROJET AS CLE, TO_CHAR(TRUNC(r.CREATED_AT, '" + u + "'), 'YYYY-MM-DD HH24:MI:SS') AS BUCKET, COUNT(*) AS CNT " +
            "FROM SYSTEM.DELIBERA_RECORDS r " +
            "WHERE r.CREATED_AT >= TO_DATE(?, 'YYYY-MM-DD') AND r.CREATED_AT < TO_DATE(?, 'YYYY-MM-DD') " +
            "GROUP BY r.PROJET, TRUNC(r.CREATED_AT, '" + u + "') " +
            "ORDER BY TRUNC(r.CREATED_AT, '" + u + "')";
        return db.queryForList(sql, dateDebut, dateFinExclusive);
    }

    /**
     * Comptage horaire sur toute une plage de dates (grain HEURE fixe) — une seule requête,
     * réutilisée par la détection des dépassements de Limite du rapport, indépendamment de la
     * granularité choisie pour les charts.
     */
    public List<Map<String, Object>> countScansParHeureRange(String projet, String dateDebut, String dateFinExclusive) {
        String sql =
            "SELECT r.LIGNE AS LIGNE, TO_CHAR(TRUNC(r.CREATED_AT), 'YYYY-MM-DD') AS JOUR, " +
            "EXTRACT(HOUR FROM r.CREATED_AT) AS HEURE, COUNT(*) AS CNT " +
            "FROM SYSTEM.DELIBERA_RECORDS r " +
            "WHERE UPPER(r.PROJET) = UPPER(?) " +
            "AND r.CREATED_AT >= TO_DATE(?, 'YYYY-MM-DD') AND r.CREATED_AT < TO_DATE(?, 'YYYY-MM-DD') " +
            "GROUP BY r.LIGNE, TRUNC(r.CREATED_AT), EXTRACT(HOUR FROM r.CREATED_AT)";
        return db.queryForList(sql, projet, dateDebut, dateFinExclusive);
    }

    // ─── Postes (reuse existing POSTES table) ─────────────────────────────────

    public boolean postesTableExists() {
        try {
            db.queryForObject("SELECT COUNT(*) FROM SYSTEM.POSTES WHERE ROWNUM=1", Integer.class);
            return true;
        } catch (Exception e) { return false; }
    }

    public List<Map<String, Object>> findPostes(String projet) {
        try {
            if (!postesTableExists()) return Collections.emptyList();
            if (projet != null && !projet.isBlank()) {
                return db.queryForList("SELECT ID,NOM,CODE FROM SYSTEM.POSTES WHERE UPPER(PROJET)=UPPER(?) ORDER BY NOM", projet);
            }
            return db.queryForList("SELECT ID,NOM,CODE FROM SYSTEM.POSTES ORDER BY NOM");
        } catch (Exception e) {
            log.warn("Could not fetch postes: {}", e.getMessage());
            return Collections.emptyList();
        }
    }
}
