package com.adient.firewall.repository;

import com.adient.firewall.dto.CustomRoleDto;
import com.adient.firewall.dto.EmployeeDto;
import com.adient.firewall.dto.QualityRecordDto;
import com.adient.firewall.dto.UserDto;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSetMetaData;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Repository
@RequiredArgsConstructor
@Slf4j
public class QualityRepository {

    private final JdbcTemplate db;

    // ─── Safety ───────────────────────────────────────────────────────────────

    public static String safe(String name) {
        String upper = name.toUpperCase();
        if (!upper.matches("[A-Z][A-Z0-9_]{0,29}")) {
            throw new IllegalArgumentException("Invalid table/project name: " + name);
        }
        return upper;
    }

    // ─── Table existence ─────────────────────────────────────────────────────

    public boolean tableExists(String tableName) {
        String sql = "SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME = ?";
        Integer cnt = db.queryForObject(sql, Integer.class, tableName.toUpperCase());
        return cnt != null && cnt > 0;
    }

    public List<String> getFirewallTables() {
        return db.queryForList(
                "SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME LIKE 'FIREWALL_%' ORDER BY TABLE_NAME",
                String.class);
    }

    public List<String> getCslTables() {
        return db.queryForList(
                "SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME LIKE 'CSL_%' ORDER BY TABLE_NAME",
                String.class);
    }

    public void ensureMasterTables() {
        if (!tableExists("DEF")) {
            db.execute("""
                CREATE TABLE SYSTEM.DEF (
                    COD                     VARCHAR2(50) NOT NULL,
                    DESCRIPTION_DEFAUT      VARCHAR2(200),
                    DEMERITE                NUMBER(6),
                    DELAI_ECHEANCE_HEURES   NUMBER(6)
                )
            """);
            log.info("Created empty SYSTEM.DEF master table; add defect codes from Projects.");
        }
        if (!tableExists("POLY")) {
            db.execute("""
                CREATE TABLE SYSTEM.POLY (
                    MAT             VARCHAR2(50) PRIMARY KEY,
                    NAME            VARCHAR2(200),
                    TAMPON          VARCHAR2(100),
                    DATE_EMBAUCHE   DATE,
                    PROJET          VARCHAR2(100),
                    EQUIPE          VARCHAR2(100),
                    EQUIPE2         VARCHAR2(100),
                    SUPERVISOR      VARCHAR2(200)
                )
            """);
            log.info("Created empty SYSTEM.POLY employee master table; add employees from Operators.");
        }
    }

    // ─── Firewall / CSL – paginated list ─────────────────────────────────────

    public int countRecords(String tableName, String where, Object[] params) {
        String sql = "SELECT COUNT(DISTINCT BARCODE) FROM SYSTEM." + tableName +
                (where.isEmpty() ? "" : " WHERE " + where);
        Integer cnt = db.queryForObject(sql, Integer.class, params);
        return cnt != null ? cnt : 0;
    }

    public List<Map<String, Object>> fetchRecords(String tableName,
                                                  String operatorCol,
                                                  String where,
                                                  Object[] params,
                                                  int page,
                                                  int limit) {
        int startRow = (page - 1) * limit + 1;
        int endRow   = page * limit;

        // Level 1: raw defect rows plus each row's group date (MAX(DATEFW) per BARCODE),
        // materialized as a plain column so it can be reused for ranking below —
        // Oracle disallows nesting one analytic function inside another's OVER clause.
        String inner = "SELECT fw.ID, fw.BARCODE," +
                "TO_CHAR(fw.DATEFW,'YYYY-MM-DD HH24:MI:SS') AS DATEFW," +
                "TO_CHAR(fw.DATEFW,'DDD')||LPAD(TO_CHAR(fw.DATEFW,'WW'),2,'0')||TO_CHAR(fw.DATEFW,'YY') AS DATE_CODE," +
                "fw." + operatorCol + "," +
                "fw.CQDELIBERA,fw.REF,fw.CODDEF,fw.CHECKPOINT,fw.DESC_DEF,fw.QTY,fw.VERSION,fw.POSTE,fw.REMARQUEDEFAUT,fw.DEMERITE," +
                "NVL(fw.REPRISE,'Not Returned') AS REPRISE,fw.REF2,fw.REF3,fw.TAMPON,fw.REFDETAIL,fw.PROJET,fw.EQUIPEPROD," +
                "NVL(fw.SUPERVISEUR,(SELECT p.SUPERVISOR FROM SYSTEM.POLY p WHERE p.TAMPON=fw.TAMPON AND ROWNUM=1)) AS SUPERVISEUR," +
                "fw.DEFECT_STATUS,fw.RECORD_STATUS,fw.MATRICULE,fw.NOM_COMPLET," +
                "MAX(fw.DATEFW) OVER (PARTITION BY fw.BARCODE) AS GRP_DATE " +
                "FROM SYSTEM." + tableName + " fw" +
                (where.isEmpty() ? "" : " WHERE " + where);

        // Level 2: DENSE_RANK on that materialized GRP_DATE groups every defect row of a
        // given BARCODE under the same RN, so the page window below always includes or
        // excludes a whole record — it can no longer cut a record's defects in half at
        // the page boundary.
        String ranked = "SELECT lvl1.*, DENSE_RANK() OVER (ORDER BY GRP_DATE DESC, BARCODE) AS RN FROM (" + inner + ") lvl1";

        String sql = "SELECT * FROM (" + ranked + ") WHERE RN BETWEEN ? AND ? ORDER BY GRP_DATE DESC,BARCODE,ID";

        Object[] fullParams = appendParams(params, startRow, endRow);
        return db.queryForList(sql, fullParams);
    }

    // ─── Firewall / CSL – CRUD ───────────────────────────────────────────────

    public int insertQualityRecord(String tableName, String operatorCol, Map<String, Object> p) {
        String sql = "INSERT INTO SYSTEM." + tableName + " (" +
                "BARCODE,DATEFW," + operatorCol + ",CQDELIBERA,REF,CODDEF,CHECKPOINT,DESC_DEF," +
                "QTY,VERSION,POSTE,REMARQUEDEFAUT,DEMERITE,REPRISE," +
                "REF2,REF3,TAMPON,REFDETAIL,PROJET,EQUIPEPROD,SUPERVISEUR,DEFECT_STATUS," +
                "RECORD_STATUS,MATRICULE,NOM_COMPLET" +
                ") VALUES (?,TO_DATE(?,'YYYY-MM-DD HH24:MI:SS'),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
        return db.update(sql,
                p.get("barCode"), p.get("datefw"), p.get("operator"), p.get("cqDelibera"),
                p.get("ref"), p.get("codeDef"), p.get("checkpoint"), p.get("descDef"),
                p.get("qty"), p.get("version"), p.get("poste"), p.get("remarque"),
                p.get("demirite"), p.get("reprise"),
                p.get("ref2"), p.get("ref3"), p.get("tampon"), p.get("refDetail"),
                p.get("project"), p.get("equipeProd"), p.get("superviseur"), p.get("defstatus"),
                p.get("recordStatus"), p.get("matricule"), p.get("nomComplet"));
    }

    public int insertIfNotExists(String tableName, String operatorCol, Map<String, Object> p) {
        String sql = "INSERT INTO SYSTEM." + tableName + " (" +
                "BARCODE,DATEFW," + operatorCol + ",CQDELIBERA,REF,CODDEF,DESC_DEF," +
                "QTY,VERSION,POSTE,REMARQUEDEFAUT,DEMERITE,REPRISE," +
                "REF2,REF3,TAMPON,REFDETAIL,PROJET,EQUIPEPROD,SUPERVISEUR,DEFECT_STATUS," +
                "RECORD_STATUS,MATRICULE,NOM_COMPLET" +
                ") SELECT ?,TO_DATE(?,'YYYY-MM-DD HH24:MI:SS'),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?" +
                " FROM DUAL WHERE NOT EXISTS (" +
                "SELECT 1 FROM SYSTEM." + tableName +
                " WHERE BARCODE=? AND CODDEF=? AND TRUNC(DATEFW)=TRUNC(TO_DATE(?,'YYYY-MM-DD HH24:MI:SS')))";
        return db.update(sql,
                p.get("barCode"), p.get("datefw"), p.get("operator"), p.get("cqDelibera"),
                p.get("ref"), p.get("codeDef"), p.get("descDef"),
                p.get("qty"), p.get("version"), p.get("poste"), p.get("remarque"),
                p.get("demirite"), p.get("reprise"),
                p.get("ref2"), p.get("ref3"), p.get("tampon"), p.get("refDetail"),
                p.get("project"), p.get("equipeProd"), p.get("superviseur"), p.get("defstatus"),
                p.get("recordStatus"), p.get("matricule"), p.get("nomComplet"),
                p.get("barCode"), p.get("codeDef"), p.get("datefw"));
    }

    public int updateQualityRecord(String tableName, String operatorCol, Map<String, Object> p) {
        String sql = "UPDATE SYSTEM." + tableName + " SET " +
                operatorCol + "=?,CQDELIBERA=?,REF=?,CODDEF=?,CHECKPOINT=?,DESC_DEF=?,QTY=?,VERSION=?," +
                "POSTE=?,REMARQUEDEFAUT=?,DEMERITE=?,REPRISE=?,REF2=?,REF3=?," +
                "TAMPON=?,REFDETAIL=?,PROJET=?,EQUIPEPROD=?,SUPERVISEUR=?,DEFECT_STATUS=?," +
                "RECORD_STATUS=?,MATRICULE=?,NOM_COMPLET=? " +
                "WHERE BARCODE=? AND CODDEF=?";
        return db.update(sql,
                p.get("operator"), p.get("cqDelibera"), p.get("ref"), p.get("codeDef"), p.get("checkpoint"),
                p.get("descDef"), p.get("qty"), p.get("version"), p.get("poste"),
                p.get("remarque"), p.get("demirite"), p.get("reprise"),
                p.get("ref2"), p.get("ref3"), p.get("tampon"), p.get("refDetail"),
                p.get("project"), p.get("equipeProd"), p.get("superviseur"), p.get("defstatus"),
                p.get("recordStatus"), p.get("matricule"), p.get("nomComplet"),
                p.get("barCode"), p.get("codeDef"));
    }

    public int updateReprise(String tableName, String barCode, String reprise) {
        return db.update("UPDATE SYSTEM." + tableName + " SET REPRISE=? WHERE BARCODE=?",
                reprise, barCode);
    }

    public int deleteRecord(String tableName, String barCode, String codDef) {
        return db.update("DELETE FROM SYSTEM." + tableName + " WHERE BARCODE=? AND CODDEF=?",
                barCode, codDef);
    }

    // ─── Stats ───────────────────────────────────────────────────────────────

    public Map<String, Object> fetchTodayStats(String tableName) {
        String sql = "SELECT COUNT(DISTINCT BARCODE) AS TOTAL_TODAY," +
                "SUM(CASE WHEN NVL(REPRISE,'Not Returned')='Returned' THEN 1 ELSE 0 END) AS RETURNED_TODAY " +
                "FROM (SELECT DISTINCT BARCODE,REPRISE,DATEFW FROM SYSTEM." + tableName + ") " +
                "WHERE TO_CHAR(DATEFW,'YYYY-MM-DD')=TO_CHAR(SYSDATE,'YYYY-MM-DD')";
        return db.queryForMap(sql);
    }

    public List<Map<String, Object>> countScansParHeure(String tableName, String date) {
        String table = safe(tableName);
        String project;
        if (table.startsWith("CSL_")) {
            project = table.substring("CSL_".length());
        } else if (table.startsWith("FIREWALL_")) {
            project = table.substring("FIREWALL_".length());
        } else {
            throw new IllegalArgumentException("Expected a Firewall or CSL table: " + table);
        }
        ensureLigneColumn(project);
        String sql = "WITH barcodes AS (" +
                "SELECT BARCODE, MIN(DATEFW) AS DATEFW " +
                "FROM SYSTEM.\"" + table + "\" " +
                "WHERE DATEFW >= TO_DATE(?,'YYYY-MM-DD') " +
                "AND DATEFW < TO_DATE(?,'YYYY-MM-DD') + 1 AND BARCODE IS NOT NULL " +
                "GROUP BY BARCODE" +
                "), resolved AS (" +
                "SELECT b.BARCODE, b.DATEFW, COALESCE(" +
                "(SELECT MAX(TRIM(r.LIGNE)) FROM SYSTEM.\"" + project + "\" r " +
                "WHERE TRIM(TO_CHAR(r.PDEF))=SUBSTR(b.BARCODE,1,12) AND TRIM(r.LIGNE) IS NOT NULL), " +
                "(SELECT MAX(TRIM(r.LIGNE)) FROM SYSTEM.\"" + project + "\" r " +
                "WHERE TRIM(TO_CHAR(r.PDEF))=SUBSTR(b.BARCODE,1,10) AND TRIM(r.LIGNE) IS NOT NULL), " +
                "(SELECT MAX(TRIM(r.LIGNE)) FROM SYSTEM.\"" + project + "\" r " +
                "WHERE TRIM(TO_CHAR(r.PDEF))=SUBSTR(b.BARCODE,1,14) AND TRIM(r.LIGNE) IS NOT NULL), " +
                "'SANS LIGNE') AS LIGNE " +
                "FROM barcodes b" +
                ") " +
                "SELECT LIGNE, EXTRACT(HOUR FROM CAST(DATEFW AS TIMESTAMP)) AS HEURE, " +
                "COUNT(*) AS CNT FROM resolved " +
                "GROUP BY LIGNE, EXTRACT(HOUR FROM CAST(DATEFW AS TIMESTAMP))";
        return db.queryForList(sql, date, date);
    }

    public String fetchCommonDefect(String tableName) {
        String sql = "SELECT CODDEF FROM (" +
                "SELECT CODDEF,COUNT(*) AS CNT FROM SYSTEM." + tableName +
                " WHERE DATEFW>=TRUNC(SYSDATE,'IW') AND CODDEF IS NOT NULL GROUP BY CODDEF ORDER BY CNT DESC" +
                ") WHERE ROWNUM=1";
        try {
            return db.queryForObject(sql, String.class);
        } catch (Exception e) {
            return "-";
        }
    }

    public Map<String, Object> fetchStatsByPeriod(String tableName, String dateFrom, String dateTo) {
        return fetchStatsByPeriod(tableName, dateFrom, dateTo, null, null);
    }


//pb count totale
 /*   public Map<String, Object> fetchStatsByPeriod(String tableName, String dateFrom, String dateTo,
                                                  String superviseur, String poste) {
        List<Object> params = new ArrayList<>();
        params.add(dateFrom); params.add(dateTo);
        StringBuilder extra = new StringBuilder();
        if (superviseur != null && !superviseur.isBlank()) { extra.append(" AND SUPERVISEUR=?"); params.add(superviseur); }
        if (poste       != null && !poste.isBlank())       { extra.append(" AND POSTE=?");       params.add(poste); }
        String sql = "SELECT COUNT(DISTINCT BARCODE) AS TOTAL," +
                "SUM(CASE WHEN RECORD_STATUS='OK' THEN 1 ELSE 0 END) AS OK_COUNT," +
                "SUM(CASE WHEN RECORD_STATUS='CLOSED' THEN 1 ELSE 0 END) AS RETURNED," +
                "SUM(CASE WHEN REPRISE='Scrap' THEN 1 ELSE 0 END) AS SCRAPPED," +
                "SUM(CASE WHEN NVL(REPRISE,'Not Returned')='Not Returned' THEN 1 ELSE 0 END) AS NOT_RETURNED " +
                "FROM (SELECT DISTINCT BARCODE,REPRISE,RECORD_STATUS,DATEFW,SUPERVISEUR,POSTE FROM SYSTEM." + tableName + ") " +
                "WHERE DATEFW >= TO_DATE(?,'YYYY-MM-DD') AND DATEFW < TO_DATE(?,'YYYY-MM-DD') + 1" + extra;
        return db.queryForMap(sql, params.toArray());
    }*/

    public Map<String, Object> fetchStatsByPeriod(String tableName, String dateFrom, String dateTo,
                                                  String superviseur, String poste) {
        List<Object> params = new ArrayList<>();
        params.add(dateFrom);
        params.add(dateTo);
        StringBuilder extra = new StringBuilder();
        if (superviseur != null && !superviseur.isBlank()) {
            extra.append(" AND SUPERVISEUR=?");
            params.add(superviseur);
        }
        if (poste != null && !poste.isBlank()) {
            extra.append(" AND POSTE=?");
            params.add(poste);
        }

        String sql =
                "WITH barcode_status AS ( " +
                        "  SELECT BARCODE, " +
                        "    MAX(CASE WHEN RECORD_STATUS='OK' THEN 4 " +
                        "             WHEN RECORD_STATUS='CLOSED' THEN 3 " +
                        "             WHEN REPRISE='Scrap' THEN 2 " +
                        "             ELSE 1 END) AS STATUS_LEVEL " +
                        "  FROM SYSTEM." + tableName + " " +
                        "  WHERE DATEFW >= TO_DATE(?,'YYYY-MM-DD') " +
                        "    AND DATEFW < TO_DATE(?,'YYYY-MM-DD') + 1" + extra + " " +
                        "  GROUP BY BARCODE " +
                        ") " +
                        "SELECT COUNT(*) AS TOTAL, " +
                        "  SUM(CASE WHEN STATUS_LEVEL=4 THEN 1 ELSE 0 END) AS OK_COUNT, " +
                        "  SUM(CASE WHEN STATUS_LEVEL=3 THEN 1 ELSE 0 END) AS RETURNED, " +
                        "  SUM(CASE WHEN STATUS_LEVEL=2 THEN 1 ELSE 0 END) AS SCRAPPED, " +
                        "  SUM(CASE WHEN STATUS_LEVEL=1 THEN 1 ELSE 0 END) AS NOT_RETURNED " +
                        "FROM barcode_status";

        return db.queryForMap(sql, params.toArray());
    }

    /**
     * Statut OK/NOK par BARCODE pour le dashboard "Suivi Qualité par Shift", à partir d'une table
     * FIREWALL_&lt;projet&gt;. Cette table n'a pas de colonne LIGNE (contrairement à DELIBERA_RECORDS
     * et à la table de référence projet) : la résolution ligne↔barcode se fait côté service via
     * {@link #getPdefLigneMap} (même logique de correspondance que {@link #lookupBarcode}).
     * Un même BARCODE peut apparaître sur plusieurs lignes (une par défaut) ; on le déduplique
     * d'abord par BARCODE, comptant OK si son RECORD_STATUS le plus favorable vu sur la fenêtre est
     * 'OK', NOK sinon (cohérent avec le CASE utilisé par {@link #fetchStatsByPeriod}). L'heure est
     * dérivée de la première occurrence du barcode. Bornes {@code debut}/{@code fin} au format
     * 'YYYY-MM-DD HH24:MI:SS', fin exclue — permet à l'appelant de couvrir une fenêtre traversant
     * minuit (ex. 20:00 -> 06:00 le lendemain).
     */
    public List<Map<String, Object>> findBarcodeStatusParHeure(String tableName, String debut, String fin) {
        String sql = "SELECT BARCODE, TO_CHAR(MIN(DATEFW),'YYYY-MM-DD HH24:MI:SS') AS DATEFW," +
                " MAX(CASE WHEN RECORD_STATUS='OK' THEN 1 ELSE 0 END) AS IS_OK" +
                " FROM SYSTEM." + tableName +
                " WHERE DATEFW >= TO_DATE(?,'YYYY-MM-DD HH24:MI:SS') AND DATEFW < TO_DATE(?,'YYYY-MM-DD HH24:MI:SS')" +
                " GROUP BY BARCODE";
        return db.queryForList(sql, debut, fin);
    }

    /**
     * PDEF (converti en texte, numérique ou non) → LIGNE pour un projet, depuis sa table de
     * référence SYSTEM."&lt;projet&gt;". Sert à résoudre la ligne de production d'un BARCODE scanné
     * par correspondance de préfixe, exactement comme {@link #lookupBarcode}.
     */
    public Map<String, String> getPdefLigneMap(String project) {
        String pn = safe(project);
        ensureLigneColumn(pn);
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT TO_CHAR(PDEF) AS PDEF, LIGNE FROM SYSTEM.\"" + pn +
                "\" WHERE PDEF IS NOT NULL AND LIGNE IS NOT NULL AND TRIM(LIGNE) IS NOT NULL");
        Map<String, String> map = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String pdef = row.get("PDEF") != null ? String.valueOf(row.get("PDEF")).trim() : null;
            String ligne = row.get("LIGNE") != null ? String.valueOf(row.get("LIGNE")).trim() : null;
            if (pdef != null && !pdef.isBlank() && ligne != null && !ligne.isBlank()) {
                map.putIfAbsent(pdef, ligne);
            }
        }
        return map;
    }












    public String fetchCommonDefectByPeriod(String tableName, String dateFrom, String dateTo) {
        return fetchCommonDefectByPeriod(tableName, dateFrom, dateTo, null, null);
    }

    public String fetchCommonDefectByPeriod(String tableName, String dateFrom, String dateTo,
                                            String superviseur, String poste) {
        List<Object> params = new ArrayList<>();
        params.add(dateFrom); params.add(dateTo);
        StringBuilder extra = new StringBuilder();
        if (superviseur != null && !superviseur.isBlank()) { extra.append(" AND SUPERVISEUR=?"); params.add(superviseur); }
        if (poste       != null && !poste.isBlank())       { extra.append(" AND POSTE=?");       params.add(poste); }
        String sql = "SELECT CODDEF FROM (" +
                "SELECT CODDEF,COUNT(*) AS CNT FROM SYSTEM." + tableName +
                " WHERE DATEFW >= TO_DATE(?,'YYYY-MM-DD') AND DATEFW < TO_DATE(?,'YYYY-MM-DD') + 1" +
                " AND CODDEF IS NOT NULL" + extra + " GROUP BY CODDEF ORDER BY CNT DESC" +
                ") WHERE ROWNUM=1";
        try {
            return db.queryForObject(sql, String.class, params.toArray());
        } catch (Exception e) {
            return "-";
        }
    }

    // ─── Barcode lookup ───────────────────────────────────────────────────────

    private static final Set<String> NUMERIC_PDEF_PROJECTS = Set.of("P6", "P7");

    public Optional<Map<String, Object>> lookupBarcode(List<String> projectNames, String barcode) {
        if (projectNames.isEmpty()) return Optional.empty();

        int[] prefixLengths = {12, 10, 14};

        for (int len : prefixLengths) {
            if (barcode.length() < len) continue;
            String prefix = barcode.substring(0, len);

            for (String p : projectNames) {
                try {
                    String safeName = safe(p);
                    ensureLigneColumn(safeName);
                    String pdefCond = NUMERIC_PDEF_PROJECTS.contains(safeName)
                            ? "TO_CHAR(PDEF) = ?"
                            : "PDEF = ?";

                    String sql = "SELECT PDEF,VERSION,REF_DETAIL,LIGNE,'" + safeName +
                            "' AS TABLE_NAME,DESIGNATION FROM SYSTEM." + safeName +
                            " WHERE " + pdefCond + " AND ROWNUM=1";

                    List<Map<String, Object>> rows = db.queryForList(sql, prefix);
                    if (!rows.isEmpty()) {
                        log.info("Barcode {} matched in {} with prefix len={}", barcode, safeName, len);
                        return Optional.of(rows.get(0));
                    }
                } catch (Exception e) {
                    log.warn("Lookup failed table={} prefix={}: {}", p, prefix, e.getMessage());
                }
            }
        }

        log.warn("No match found for barcode={}", barcode);
        return Optional.empty();
    }

    public List<String> getProjectNames() {
        return db.queryForList(
                "SELECT TABLE_NAME FROM USER_TABLES " +
                        "WHERE TABLE_NAME NOT LIKE 'FIREWALL_%' AND TABLE_NAME NOT LIKE 'CSL_%' " +
                        "AND TABLE_NAME NOT IN ('DEF','POLY','APP_USERS','SUPERVISORS','REF_VERIF_MESSAGES','REF_CHECKPOINTS') " +
                        "AND TABLE_NAME IN (" +
                        "  SELECT TABLE_NAME FROM USER_TAB_COLUMNS WHERE COLUMN_NAME IN ('PDEF','FAS_ADIENT_PART_NUMBER') " +
                        "  GROUP BY TABLE_NAME HAVING COUNT(DISTINCT COLUMN_NAME)=2" +
                        ") ORDER BY TABLE_NAME",
                String.class);
    }

    // ─── Employees ───────────────────────────────────────────────────────────

    public int countEmployees(String where, Object[] params) {
        String sql = "SELECT COUNT(DISTINCT MAT) FROM SYSTEM.POLY" +
                (where.isEmpty() ? "" : " WHERE " + where);
        Integer cnt = db.queryForObject(sql, Integer.class, params);
        return cnt != null ? cnt : 0;
    }

    public List<EmployeeDto> fetchEmployees(String where, Object[] params, int page, int limit) {
        int start = (page - 1) * limit + 1;
        int end   = page * limit;
        String inner = "SELECT MAT,NAME,TAMPON,TO_CHAR(DATE_EMBAUCHE,'YYYY-MM-DD') AS DATE_EMBAUCHE," +
                "PROJET,EQUIPE,EQUIPE2,SUPERVISOR,ROW_NUMBER() OVER (ORDER BY MAT ASC) AS RN FROM SYSTEM.POLY" +
                (where.isEmpty() ? "" : " WHERE " + where);
        String sql = "SELECT * FROM (" + inner + ") WHERE RN BETWEEN ? AND ? ORDER BY MAT ASC";
        return db.query(sql, appendParams(params, start, end),
                (rs, i) -> new EmployeeDto(
                        rs.getString("MAT"), rs.getString("NAME"),
                        rs.getString("TAMPON"), rs.getString("DATE_EMBAUCHE"),
                        rs.getString("PROJET"), rs.getString("EQUIPE"),
                        rs.getString("EQUIPE2"), rs.getString("SUPERVISOR")));
    }

    public int insertEmployee(EmployeeDto e) {
        return db.update("INSERT INTO SYSTEM.POLY (MAT,NAME,TAMPON,DATE_EMBAUCHE,PROJET,EQUIPE,EQUIPE2,SUPERVISOR) " +
                        "VALUES (?,UPPER(?),UPPER(?),TO_DATE(?,'YYYY-MM-DD'),UPPER(?),UPPER(?),UPPER(?),UPPER(?))",
                e.mat(), e.name(), e.tampon(), e.dateEmbauche(),
                e.projet(), e.equipe(), e.equipe2(), e.supervisor());
    }

    public boolean employeeExists(String mat) {
        Integer count = db.queryForObject(
                "SELECT COUNT(*) FROM SYSTEM.POLY WHERE UPPER(TO_CHAR(MAT))=UPPER(?)",
                Integer.class, mat);
        return count != null && count > 0;
    }

    public int updateEmployee(EmployeeDto e) {
        return db.update("UPDATE SYSTEM.POLY SET NAME=UPPER(?),TAMPON=UPPER(?),DATE_EMBAUCHE=TO_DATE(?,'YYYY-MM-DD')," +
                        "PROJET=UPPER(?),EQUIPE=UPPER(?),EQUIPE2=UPPER(?),SUPERVISOR=UPPER(?) WHERE MAT=?",
                e.name(), e.tampon(), e.dateEmbauche(),
                e.projet(), e.equipe(), e.equipe2(), e.supervisor(), e.mat());
    }

    public int deleteEmployee(String mat) {
        return db.update("DELETE FROM SYSTEM.POLY WHERE MAT=?", mat);
    }

    // ─── Lookup helpers ───────────────────────────────────────────────────────

    public Optional<Map<String, Object>> lookupPoly(String tampon) {
        try {
            Map<String, Object> row = db.queryForMap(
                    "SELECT PROJET,EQUIPE,EQUIPE2,SUPERVISOR FROM SYSTEM.POLY WHERE TAMPON=? AND ROWNUM=1",
                    tampon);
            return Optional.of(row);
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public Optional<Map<String, Object>> lookupDef(String cod) {
        try {
            Map<String, Object> row = db.queryForMap(
                    "SELECT DESCRIPTION_DEFAUT,DEMERITE FROM SYSTEM.DEF WHERE COD=? AND ROWNUM=1",
                    cod);
            return Optional.of(row);
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public List<String> getPolyTampons() {
        return db.queryForList(
                "SELECT DISTINCT TAMPON FROM SYSTEM.POLY WHERE TAMPON IS NOT NULL ORDER BY TAMPON",
                String.class);
    }

    public List<String> getDefCodes() {
        return db.queryForList(
                "SELECT DISTINCT COD FROM SYSTEM.DEF WHERE COD IS NOT NULL ORDER BY COD",
                String.class);
    }

    public void ensureDefDelaiColumn() {
        try {
            Integer cnt = db.queryForObject(
                    "SELECT COUNT(*) FROM ALL_TAB_COLUMNS WHERE TABLE_NAME='DEF' AND COLUMN_NAME='DELAI_ECHEANCE_HEURES' AND OWNER='SYSTEM'",
                    Integer.class);
            if (cnt == null || cnt == 0) {
                db.execute("ALTER TABLE SYSTEM.DEF ADD DELAI_ECHEANCE_HEURES NUMBER(6) DEFAULT NULL");
                log.info("Added DELAI_ECHEANCE_HEURES column to SYSTEM.DEF");
            }
        } catch (Exception e) {
            log.warn("Could not ensure DELAI_ECHEANCE_HEURES on DEF: {}", e.getMessage());
        }
    }

    public List<Map<String, Object>> getDefCodesList() {
        ensureDefDelaiColumn();
        // GROUP BY COD to eliminate duplicate rows that may exist in SYSTEM.DEF
        return db.queryForList(
            "SELECT COD, MAX(DESCRIPTION_DEFAUT) AS DESCRIPTION_DEFAUT, " +
            "MAX(DEMERITE) AS DEMERITE, MAX(DELAI_ECHEANCE_HEURES) AS DELAI_ECHEANCE_HEURES " +
            "FROM SYSTEM.DEF WHERE COD IS NOT NULL GROUP BY COD ORDER BY COD");
    }

    public List<Map<String, Object>> fetchNotReturnedWithDelay(String tableName) {
        ensureDefDelaiColumn();
        String sql = "SELECT fw.BARCODE," +
                "TO_CHAR(fw.DATEFW,'YYYY-MM-DD HH24:MI:SS') AS DATEFW," +
                "fw.CODDEF, fw.SUPERVISEUR, fw.TAMPON, fw.REF," +
                "d.DELAI_ECHEANCE_HEURES, d.DESCRIPTION_DEFAUT AS DESC_DEF," +
                "ROUND((SYSDATE - fw.DATEFW) * 24, 1) AS HEURES_ECOULES " +
                "FROM SYSTEM." + tableName + " fw " +
                "JOIN SYSTEM.DEF d ON fw.CODDEF = d.COD " +
                "WHERE NVL(fw.REPRISE,'Not Returned') = 'Not Returned' " +
                "AND d.DELAI_ECHEANCE_HEURES IS NOT NULL " +
                "ORDER BY (SYSDATE - fw.DATEFW) DESC";
        try {
            return db.queryForList(sql);
        } catch (Exception e) {
            log.warn("fetchNotReturnedWithDelay failed for {}: {}", tableName, e.getMessage());
            return Collections.emptyList();
        }
    }

    public List<String> getSupervisors() {
        return db.queryForList(
                "SELECT DISTINCT SUPERVISOR FROM SYSTEM.POLY WHERE SUPERVISOR IS NOT NULL ORDER BY SUPERVISOR",
                String.class);
    }

    public boolean supervisorsTableExists() {
        return tableExists("SUPERVISORS");
    }

    public List<Map<String, Object>> getSupervisorsList() {
        if (supervisorsTableExists()) {
            return db.queryForList("SELECT NAME,'table' AS SOURCE FROM SYSTEM.SUPERVISORS ORDER BY NAME");
        }
        return db.queryForList(
                "SELECT DISTINCT SUPERVISOR AS NAME,'poly' AS SOURCE FROM SYSTEM.POLY WHERE SUPERVISOR IS NOT NULL ORDER BY SUPERVISOR");
    }

    // ─── Users ───────────────────────────────────────────────────────────────

    public boolean usersTableExists() {
        return tableExists("APP_USERS");
    }

    public void ensureUsersTable() {
        if (!usersTableExists()) {
            db.execute("""
                CREATE TABLE SYSTEM.APP_USERS (
                    ID         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    MATRICULE  VARCHAR2(50)  NOT NULL,
                    FULL_NAME  VARCHAR2(200) NOT NULL,
                    EMAIL      VARCHAR2(200),
                    PHONE      VARCHAR2(30),
                    ROLE       VARCHAR2(30)  DEFAULT 'operator' NOT NULL,
                    PWD_HASH   VARCHAR2(255) NOT NULL,
                    IS_ACTIVE  NUMBER(1)     DEFAULT 1 NOT NULL,
                    CREATED_AT TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT APP_USERS_MATR_UQ  UNIQUE (MATRICULE),
                    CONSTRAINT APP_USERS_EMAIL_UQ UNIQUE (EMAIL)
                )
            """);
        }
    }

    public Optional<Map<String, Object>> findUserByMatricule(String matricule) {
        try {
            Map<String, Object> row = db.queryForMap(
                    "SELECT ID,MATRICULE,FULL_NAME,ROLE,PWD_HASH FROM SYSTEM.APP_USERS " +
                            "WHERE UPPER(MATRICULE)=UPPER(?) AND IS_ACTIVE=1", matricule);
            return Optional.of(row);
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public Optional<Map<String, Object>> findUserById(Long id) {
        try {
            return Optional.of(db.queryForMap(
                    "SELECT ID,PWD_HASH FROM SYSTEM.APP_USERS WHERE ID=? AND IS_ACTIVE=1", id));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public int countAdmins() {
        Integer cnt = db.queryForObject(
                "SELECT COUNT(*) FROM SYSTEM.APP_USERS WHERE ROLE='admin' AND IS_ACTIVE=1",
                Integer.class);
        return cnt != null ? cnt : 0;
    }

    public void insertDefaultAdmin(String hash) {
        db.update("INSERT INTO SYSTEM.APP_USERS (MATRICULE,FULL_NAME,EMAIL,ROLE,PWD_HASH) " +
                "VALUES ('admin','Administrateur','admin@sage.local','admin',?)", hash);
    }

    // ── Extended user columns (migration-safe) ───────────────────────────────

    private void addColumnIfAbsent(String table, String column, String definition) {
        try {
            Integer cnt = db.queryForObject(
                    "SELECT COUNT(*) FROM USER_TAB_COLUMNS WHERE TABLE_NAME=? AND COLUMN_NAME=?",
                    Integer.class, table, column);
            if (cnt == null || cnt == 0) {
                db.execute("ALTER TABLE SYSTEM." + table + " ADD " + column + " " + definition);
            }
        } catch (Exception e) {
            log.warn("Could not add column {} to {}: {}", column, table, e.getMessage());
        }
    }

    // ── Project ref LIGNE column (self-healing, checked once per project) ────

    private final Set<String> ligneColumnEnsured = ConcurrentHashMap.newKeySet();

    private void ensureLigneColumn(String project) {
        if (ligneColumnEnsured.contains(project)) return;
        addColumnIfAbsent(project, "LIGNE", "VARCHAR2(26 BYTE)");
        ligneColumnEnsured.add(project);
    }

    public void ensureUserExtendedColumns() {
        addColumnIfAbsent("APP_USERS", "LAST_LOGIN",        "TIMESTAMP");
        addColumnIfAbsent("APP_USERS", "LOGIN_TIME_PRESET", "VARCHAR2(20) DEFAULT 'always'");
        addColumnIfAbsent("APP_USERS", "LOGIN_TIME_START",  "VARCHAR2(5)");
        addColumnIfAbsent("APP_USERS", "LOGIN_TIME_END",    "VARCHAR2(5)");
        addColumnIfAbsent("APP_USERS", "FAILED_ATTEMPTS",   "NUMBER(3) DEFAULT 0");
    }

    public List<UserDto> listUsers() {
        return db.query(
                "SELECT ID,MATRICULE,FULL_NAME,EMAIL,PHONE,ROLE,IS_ACTIVE," +
                        "LAST_LOGIN,LOGIN_TIME_PRESET,LOGIN_TIME_START,LOGIN_TIME_END,NVL(FAILED_ATTEMPTS,0) AS FAILED_ATTEMPTS " +
                        "FROM SYSTEM.APP_USERS ORDER BY ID",
                (rs, i) -> new UserDto(
                        rs.getLong("ID"), rs.getString("MATRICULE"),
                        rs.getString("FULL_NAME"), rs.getString("EMAIL"),
                        rs.getString("PHONE"), rs.getString("ROLE"),
                        rs.getInt("IS_ACTIVE") == 1,
                        rs.getTimestamp("LAST_LOGIN") != null
                                ? rs.getTimestamp("LAST_LOGIN").toInstant().toString() : null,
                        rs.getString("LOGIN_TIME_PRESET"),
                        rs.getString("LOGIN_TIME_START"),
                        rs.getString("LOGIN_TIME_END"),
                        rs.getInt("FAILED_ATTEMPTS")));
    }

    public int insertUser(String matricule, String fullName, String email, String phone, String role, String hash) {
        return db.update("INSERT INTO SYSTEM.APP_USERS (MATRICULE,FULL_NAME,EMAIL,PHONE,ROLE,PWD_HASH) VALUES (?,?,?,?,?,?)",
                matricule, fullName, email, phone, role, hash);
    }

    public int updateUser(Long id, String fullName, String email, String phone, String role, boolean active) {
        return db.update("UPDATE SYSTEM.APP_USERS SET FULL_NAME=?,EMAIL=?,PHONE=?,ROLE=?,IS_ACTIVE=? WHERE ID=?",
                fullName, email, phone, role, active ? 1 : 0, id);
    }

    public int updatePassword(Long id, String hash) {
        return db.update("UPDATE SYSTEM.APP_USERS SET PWD_HASH=? WHERE ID=?", hash, id);
    }

    public int updateUserTimeAccess(Long id, String preset, String start, String end) {
        return db.update("UPDATE SYSTEM.APP_USERS SET LOGIN_TIME_PRESET=?,LOGIN_TIME_START=?,LOGIN_TIME_END=? WHERE ID=?",
                preset, start, end, id);
    }

    public Optional<Map<String, Object>> findAdminHashByMatricule(String matricule) {
        try {
            return Optional.of(db.queryForMap(
                    "SELECT ID,PWD_HASH FROM SYSTEM.APP_USERS WHERE UPPER(MATRICULE)=UPPER(?) AND IS_ACTIVE=1",
                    matricule));
        } catch (Exception e) { return Optional.empty(); }
    }

    public Optional<Map<String, Object>> findUserByMatriculeAll(String matricule) {
        try {
            return Optional.of(db.queryForMap(
                    "SELECT ID,MATRICULE,FULL_NAME,ROLE,PWD_HASH,IS_ACTIVE," +
                            "NVL(FAILED_ATTEMPTS,0) AS FAILED_ATTEMPTS,LOGIN_TIME_PRESET,LOGIN_TIME_START,LOGIN_TIME_END " +
                            "FROM SYSTEM.APP_USERS WHERE UPPER(MATRICULE)=UPPER(?)", matricule));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    // ── Login history ─────────────────────────────────────────────────────────

    public void ensureLoginHistoryTable() {
        if (!tableExists("LOGIN_HISTORY")) {
            db.execute("""
                CREATE TABLE SYSTEM.LOGIN_HISTORY (
                    ID         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    USER_ID    NUMBER,
                    MATRICULE  VARCHAR2(50),
                    LOGIN_AT   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    IP_ADDRESS VARCHAR2(60),
                    SERVER_MAC VARCHAR2(30),
                    STATUS     VARCHAR2(10) NOT NULL
                )
            """);
        } else {
            addColumnIfAbsent("LOGIN_HISTORY", "SERVER_MAC", "VARCHAR2(30)");
        }
    }

    public void insertLoginHistory(Long userId, String matricule, String ip, String serverMac, String status) {
        db.update("INSERT INTO SYSTEM.LOGIN_HISTORY (USER_ID,MATRICULE,IP_ADDRESS,SERVER_MAC,STATUS) VALUES (?,?,?,?,?)",
                userId, matricule, ip, serverMac, status);
    }

    public void incrementFailedAttempts(String matricule) {
        db.update("UPDATE SYSTEM.APP_USERS SET FAILED_ATTEMPTS = NVL(FAILED_ATTEMPTS,0)+1 " +
                "WHERE UPPER(MATRICULE)=UPPER(?)", matricule);
    }

    public Integer getFailedAttempts(String matricule) {
        try {
            return db.queryForObject(
                    "SELECT NVL(FAILED_ATTEMPTS,0) FROM SYSTEM.APP_USERS WHERE UPPER(MATRICULE)=UPPER(?)",
                    Integer.class, matricule);
        } catch (Exception e) { return 0; }
    }

    public void resetFailedAttempts(Long userId) {
        db.update("UPDATE SYSTEM.APP_USERS SET FAILED_ATTEMPTS=0 WHERE ID=?", userId);
    }

    public void autoBlockUser(String matricule) {
        db.update("UPDATE SYSTEM.APP_USERS SET IS_ACTIVE=0 " +
                "WHERE UPPER(MATRICULE)=UPPER(?) AND NVL(FAILED_ATTEMPTS,0) >= 5", matricule);
    }

    public void updateLastLogin(Long userId) {
        db.update("UPDATE SYSTEM.APP_USERS SET LAST_LOGIN=CURRENT_TIMESTAMP WHERE ID=?", userId);
    }

    public List<Map<String, Object>> listLoginHistory(Long userId, String dateFrom, String dateTo) {
        StringBuilder sql = new StringBuilder(
                "SELECT h.ID, h.USER_ID, h.MATRICULE, NVL(u.FULL_NAME,h.MATRICULE) AS FULL_NAME, " +
                        "h.LOGIN_AT, h.IP_ADDRESS, h.SERVER_MAC, h.STATUS " +
                        "FROM SYSTEM.LOGIN_HISTORY h LEFT JOIN SYSTEM.APP_USERS u ON h.USER_ID=u.ID WHERE 1=1 ");
        List<Object> params = new ArrayList<>();
        if (userId != null)  { sql.append("AND h.USER_ID=? "); params.add(userId); }
        if (dateFrom != null && !dateFrom.isBlank()) {
            sql.append("AND TRUNC(h.LOGIN_AT) >= TO_DATE(?,'YYYY-MM-DD') "); params.add(dateFrom);
        }
        if (dateTo != null && !dateTo.isBlank()) {
            sql.append("AND TRUNC(h.LOGIN_AT) <= TO_DATE(?,'YYYY-MM-DD') "); params.add(dateTo);
        }
        sql.append("ORDER BY h.LOGIN_AT DESC FETCH FIRST 200 ROWS ONLY");
        return db.queryForList(sql.toString(), params.toArray());
    }

    public List<Map<String, Object>> listAllLoginHistory(String matricule, String dateFrom, String dateTo, String status) {
        return queryLoginHistory(null, matricule, dateFrom, dateTo, status, false);
    }

    public List<Map<String, Object>> queryLoginHistory(Long userId, String matricule, String dateFrom, String dateTo, String status, boolean all) {
        StringBuilder sql = new StringBuilder(
                "SELECT h.ID, h.USER_ID, h.MATRICULE, NVL(u.FULL_NAME,h.MATRICULE) AS FULL_NAME, " +
                        "h.LOGIN_AT, h.IP_ADDRESS, h.SERVER_MAC, h.STATUS " +
                        "FROM SYSTEM.LOGIN_HISTORY h LEFT JOIN SYSTEM.APP_USERS u ON h.USER_ID=u.ID WHERE 1=1 ");
        List<Object> params = new ArrayList<>();
        if (userId != null) { sql.append("AND h.USER_ID=? "); params.add(userId); }
        if (matricule != null && !matricule.isBlank()) {
            sql.append("AND UPPER(h.MATRICULE) LIKE UPPER(?) "); params.add("%" + matricule + "%");
        }
        if (dateFrom != null && !dateFrom.isBlank()) {
            sql.append("AND TRUNC(h.LOGIN_AT) >= TO_DATE(?,'YYYY-MM-DD') "); params.add(dateFrom);
        }
        if (dateTo != null && !dateTo.isBlank()) {
            sql.append("AND TRUNC(h.LOGIN_AT) <= TO_DATE(?,'YYYY-MM-DD') "); params.add(dateTo);
        }
        if (status != null && !status.isBlank()) { sql.append("AND h.STATUS=? "); params.add(status); }
        sql.append("ORDER BY h.LOGIN_AT DESC, h.ID DESC");
        if (!all) sql.append(" FETCH FIRST 500 ROWS ONLY");
        return db.queryForList(sql.toString(), params.toArray());
    }

    // ── Role permissions ──────────────────────────────────────────────────────

    public void ensurePermissionsTable() {
        if (!tableExists("ROLE_PERMISSIONS")) {
            db.execute("""
                CREATE TABLE SYSTEM.ROLE_PERMISSIONS (
                    ROLE       VARCHAR2(50) NOT NULL,
                    MODULE     VARCHAR2(50) NOT NULL,
                    PERMISSION VARCHAR2(10) DEFAULT 'none' NOT NULL,
                    CONSTRAINT PK_ROLE_PERMS PRIMARY KEY (ROLE, MODULE)
                )
            """);
            insertDefaultPermissions();
        }
    }

    private void insertDefaultPermissions() {
        String[] modules = {"overview","firewall","csl","delibera","tri","echeances","rapports","operators","projects","users"};
        for (String m : modules) {
            db.update("INSERT INTO SYSTEM.ROLE_PERMISSIONS (ROLE,MODULE,PERMISSION) VALUES (?,?,?)", "admin",            m, "admin");
            db.update("INSERT INTO SYSTEM.ROLE_PERMISSIONS (ROLE,MODULE,PERMISSION) VALUES (?,?,?)", "supervisor",       m,
                    "users".equals(m) ? "read" : "write");
            db.update("INSERT INTO SYSTEM.ROLE_PERMISSIONS (ROLE,MODULE,PERMISSION) VALUES (?,?,?)", "operator",         m,
                    ("firewall".equals(m)||"csl".equals(m)||"delibera".equals(m)) ? "write" : "rapports".equals(m) ? "read" : "none");
            db.update("INSERT INTO SYSTEM.ROLE_PERMISSIONS (ROLE,MODULE,PERMISSION) VALUES (?,?,?)", "operator_manager", m,
                    ("users".equals(m)||"operators".equals(m)||"projects".equals(m)) ? "none" : "read");
        }
    }

    // ─── Delibera tables ──────────────────────────────────────────────────────

    public void ensureDeliberaTables() {
        if (!tableExists("DELIBERA_COUTURIERES")) {
            db.execute("""
                CREATE TABLE SYSTEM.DELIBERA_COUTURIERES (
                    ID         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    MATRICULE  VARCHAR2(50)  NOT NULL,
                    NOM        VARCHAR2(150) NOT NULL,
                    PROJET     VARCHAR2(50),
                    EQUIPE     VARCHAR2(10),
                    ACTIF      NUMBER(1) DEFAULT 1,
                    CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP
                )
            """);
        }
        if (!tableExists("DELIBERA_RECORDS")) {
            db.execute("""
                CREATE TABLE SYSTEM.DELIBERA_RECORDS (
                    ID             NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    BARCODE        VARCHAR2(100) NOT NULL,
                    PROJET         VARCHAR2(50),
                    REFERENCE      VARCHAR2(100),
                    VERSION        VARCHAR2(100),
                    POSTE_ID       NUMBER,
                    COUTURIERE_ID  NUMBER,
                    STATUT_REPRISE VARCHAR2(20) DEFAULT 'NOT_RETURNED',
                    CREATED_AT     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UPDATED_AT     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """);
        }
        // SYSTIMESTAMP reads the DB host's OS clock and ignores the connection-init-sql's
        // "ALTER SESSION SET TIME_ZONE='Africa/Tunis'" — CURRENT_TIMESTAMP honors it instead.
        // Self-healing MODIFY for tables created before this fix.
        try { db.execute("ALTER TABLE SYSTEM.DELIBERA_RECORDS MODIFY CREATED_AT DEFAULT CURRENT_TIMESTAMP"); }
        catch (Exception e) { log.warn("Could not fix DELIBERA_RECORDS.CREATED_AT default: {}", e.getMessage()); }
        try { db.execute("ALTER TABLE SYSTEM.DELIBERA_RECORDS MODIFY UPDATED_AT DEFAULT CURRENT_TIMESTAMP"); }
        catch (Exception e) { log.warn("Could not fix DELIBERA_RECORDS.UPDATED_AT default: {}", e.getMessage()); }
        if (!tableExists("DELIBERA_RECORD_DEFAUTS")) {
            db.execute("""
                CREATE TABLE SYSTEM.DELIBERA_RECORD_DEFAUTS (
                    ID          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    RECORD_ID   NUMBER NOT NULL,
                    CODE_DEFAUT VARCHAR2(50)  NOT NULL,
                    DESC_DEFAUT VARCHAR2(200),
                    VERIFIE     NUMBER(1) DEFAULT 0,
                    ADDED_AT    VARCHAR2(20) DEFAULT 'INITIAL'
                )
            """);
        }
        // Auto-register delibera in permissions using centralized seeder
        seedModulePermissions("delibera", "admin", "write", "write", "read");
    }

    public Map<String, Map<String, String>> getPermissions() {
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT ROLE,MODULE,PERMISSION FROM SYSTEM.ROLE_PERMISSIONS ORDER BY ROLE,MODULE");
        Map<String, Map<String, String>> result = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String role   = (String) row.get("ROLE");
            String module = (String) row.get("MODULE");
            String perm   = (String) row.get("PERMISSION");
            result.computeIfAbsent(role, k -> new LinkedHashMap<>()).put(module, perm);
        }
        return result;
    }

    public void savePermission(String role, String module, String permission) {
        int rows = db.update(
                "UPDATE SYSTEM.ROLE_PERMISSIONS SET PERMISSION=? WHERE ROLE=? AND MODULE=?",
                permission, role, module);
        if (rows == 0) {
            db.update("INSERT INTO SYSTEM.ROLE_PERMISSIONS (ROLE,MODULE,PERMISSION) VALUES (?,?,?)",
                    role, module, permission);
        }
    }

    /**
     * Idempotent module registration — call from any @PostConstruct to auto-appear in the admin permissions UI.
     * Inserts only if no row exists for this module yet (MERGE-equivalent via count check).
     */
    public void seedModulePermissions(String module, String adminPerm, String supervisorPerm,
                                      String operatorPerm, String managerPerm) {
        try {
            Integer cnt = db.queryForObject(
                    "SELECT COUNT(*) FROM SYSTEM.ROLE_PERMISSIONS WHERE MODULE=?", Integer.class, module);
            if (cnt == null || cnt == 0) {
                db.update("INSERT INTO SYSTEM.ROLE_PERMISSIONS (ROLE,MODULE,PERMISSION) VALUES (?,?,?)", "admin",            module, adminPerm);
                db.update("INSERT INTO SYSTEM.ROLE_PERMISSIONS (ROLE,MODULE,PERMISSION) VALUES (?,?,?)", "supervisor",       module, supervisorPerm);
                db.update("INSERT INTO SYSTEM.ROLE_PERMISSIONS (ROLE,MODULE,PERMISSION) VALUES (?,?,?)", "operator",         module, operatorPerm);
                db.update("INSERT INTO SYSTEM.ROLE_PERMISSIONS (ROLE,MODULE,PERMISSION) VALUES (?,?,?)", "operator_manager", module, managerPerm);
            }
        } catch (Exception e) {
            log.warn("seedModulePermissions({}) skipped: {}", module, e.getMessage());
        }
    }

    // ─── Custom roles ─────────────────────────────────────────────────────────

    public void ensureCustomRolesTable() {
        if (!tableExists("CUSTOM_ROLES")) {
            db.execute("""
                CREATE TABLE SYSTEM.CUSTOM_ROLES (
                    ID         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    ROLE_KEY   VARCHAR2(50)  NOT NULL UNIQUE,
                    LABEL      VARCHAR2(100) NOT NULL,
                    COLOR      VARCHAR2(20),
                    BG         VARCHAR2(20),
                    BORDER     VARCHAR2(20),
                    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """);
        }
    }

    public List<CustomRoleDto> findAllCustomRoles() {
        ensureCustomRolesTable();
        return db.query(
                "SELECT ROLE_KEY, LABEL, COLOR, BG, BORDER FROM SYSTEM.CUSTOM_ROLES ORDER BY ID",
                (rs, i) -> new CustomRoleDto(
                        rs.getString("ROLE_KEY"),
                        rs.getString("LABEL"),
                        rs.getString("COLOR"),
                        rs.getString("BG"),
                        rs.getString("BORDER")));
    }

    public void deleteAllCustomRoles() {
        ensureCustomRolesTable();
        db.update("DELETE FROM SYSTEM.CUSTOM_ROLES");
    }

    public int countUsersWithRole(String role) {
        Integer count = db.queryForObject("SELECT COUNT(*) FROM SYSTEM.APP_USERS WHERE LOWER(ROLE)=LOWER(?)",
                Integer.class, role);
        return count == null ? 0 : count;
    }

    public void deleteRolePermissions(String role) {
        db.update("DELETE FROM SYSTEM.ROLE_PERMISSIONS WHERE ROLE=?", role);
    }

    public void insertCustomRole(String key, String label, String color, String bg, String border) {
        db.update("INSERT INTO SYSTEM.CUSTOM_ROLES (ROLE_KEY,LABEL,COLOR,BG,BORDER) VALUES (?,?,?,?,?)",
                key, label, color, bg, border);
    }

    // ─── Project refs ─────────────────────────────────────────────────────────

    public int countProjectRefs(String project) {
        Integer cnt = db.queryForObject("SELECT COUNT(*) FROM SYSTEM.\"" + safe(project) + "\"", Integer.class);
        return cnt != null ? cnt : 0;
    }

    public List<Map<String, Object>> fetchProjectRefs(String project, int page, int limit) {
        int maxRow = page * limit;
        int minRow = (page - 1) * limit;
        String sql = "SELECT * FROM (SELECT t.*,ROWNUM RN FROM SYSTEM.\"" + safe(project) + "\" t WHERE ROWNUM<=?) WHERE RN>?";
        List<Map<String, Object>> rows = db.queryForList(sql, maxRow, minRow);
        rows.forEach(r -> r.remove("RN"));
        return rows;
    }

    public List<Map<String, Object>> fetchProjectRefsWithRowid(String project, int page, int limit) {
        int maxRow = page * limit;
        int minRow = (page - 1) * limit;
        String pn = safe(project);
        ensureLigneColumn(pn);
        String sql = "SELECT ROWIDTOCHAR(t.ROWID) AS ROW_ID,t.FAS_ADIENT_PART_NUMBER,t.PDEF,t.DESIGNATION,t.VERSION,t.REF_DETAIL,t.LIGNE," +
                "(SELECT COUNT(*) FROM SYSTEM.REF_VERIF_MESSAGES m WHERE m.PROJECT_NAME='" + pn + "' AND m.PDEF=t.PDEF AND m.MESSAGE IS NOT NULL) AS MSG_COUNT," +
                "(SELECT COUNT(*) FROM SYSTEM.REF_CHECKPOINTS c WHERE c.PROJECT_NAME='" + pn + "' AND c.PDEF=t.PDEF AND c.CHECKPOINT IS NOT NULL) AS CHECKPOINT_COUNT," +
                "ROWNUM RN FROM SYSTEM.\"" + pn + "\" t WHERE ROWNUM<=?";
        String outer = "SELECT * FROM (" + sql + ") WHERE RN>?";
        List<Map<String, Object>> rows = db.queryForList(outer, maxRow, minRow);
        rows.forEach(r -> r.remove("RN"));
        return rows;
    }

    public void insertProjectRef(String project, String fas, String pdef, String desig, String ver, String ref, String ligne) {
        String pn = safe(project);
        ensureLigneColumn(pn);
        db.update("INSERT INTO SYSTEM.\"" + pn + "\" (FAS_ADIENT_PART_NUMBER,PDEF,DESIGNATION,VERSION,REF_DETAIL,LIGNE) VALUES (?,?,?,?,?,?)",
                fas, pdef, desig, ver, ref, ligne);
    }

    public void updateProjectRef(String project, String rowid, String fas, String pdef, String desig, String ver, String ref, String ligne) {
        String pn = safe(project);
        ensureLigneColumn(pn);
        db.update("UPDATE SYSTEM.\"" + pn + "\" SET FAS_ADIENT_PART_NUMBER=?,PDEF=?,DESIGNATION=?,VERSION=?,REF_DETAIL=?,LIGNE=? WHERE ROWID=CHARTOROWID(?)",
                fas, pdef, desig, ver, ref, ligne, rowid);
    }

    public void deleteProjectRef(String project, String rowid) {
        db.update("DELETE FROM SYSTEM.\"" + safe(project) + "\" WHERE ROWID=CHARTOROWID(?)", rowid);
    }

    public boolean existsProjectRefByPdef(String project, String pdef) {
        Integer cnt = db.queryForObject(
            "SELECT COUNT(*) FROM SYSTEM.\"" + safe(project) + "\" WHERE PDEF=?", Integer.class, pdef);
        return cnt != null && cnt > 0;
    }

    /** MERGE (upsert) by PDEF: update if exists, insert if not. Returns 1. */
    public int upsertProjectRef(String project, String fas, String pdef, String desig, String ver, String ref, String ligne) {
        String t = safe(project);
        ensureLigneColumn(t);
        String sql =
            "MERGE INTO SYSTEM.\"" + t + "\" tgt " +
            "USING (SELECT ? AS PDEF FROM DUAL) src ON (tgt.PDEF = src.PDEF) " +
            "WHEN MATCHED THEN UPDATE SET tgt.FAS_ADIENT_PART_NUMBER=?,tgt.DESIGNATION=?,tgt.VERSION=?,tgt.REF_DETAIL=?,tgt.LIGNE=? " +
            "WHEN NOT MATCHED THEN INSERT (FAS_ADIENT_PART_NUMBER,PDEF,DESIGNATION,VERSION,REF_DETAIL,LIGNE) " +
            "VALUES (?,?,?,?,?,?)";
        return db.update(sql, pdef, fas, desig, ver, ref, ligne, fas, pdef, desig, ver, ref, ligne);
    }

    /** Distinct, sorted, non-blank LIGNE values ("lignes de projet") for a project. */
    public List<String> getDistinctLignes(String project) {
        String pn = safe(project);
        ensureLigneColumn(pn);
        return db.queryForList(
            "SELECT DISTINCT LIGNE FROM SYSTEM.\"" + pn +
            "\" WHERE LIGNE IS NOT NULL AND TRIM(LIGNE) IS NOT NULL ORDER BY LIGNE",
            String.class);
    }

    // ─── Tampons ──────────────────────────────────────────────────────────────

    public boolean tamponsTableExists() {
        return tableExists("TAMPONS");
    }

    public void ensureTamponsTable() {
        if (!tamponsTableExists()) {
            db.execute("CREATE TABLE SYSTEM.TAMPONS (" +
                    "ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY," +
                    "CODE VARCHAR2(50) NOT NULL," +
                    "DESCRIPTION VARCHAR2(200)," +
                    "MAT VARCHAR2(50)," +
                    "CONSTRAINT TAMPONS_CODE_UQ UNIQUE (CODE))");
        }
    }

    public List<Map<String, Object>> getAllTampons() {
        ensureTamponsTable();
        if (countTampons() == 0) {
            migrateTamponsFromPoly();
        }
        return db.queryForList(
                "SELECT T.ID,T.CODE,T.DESCRIPTION,T.MAT,P.NAME AS EMPLOYEE_NAME " +
                        "FROM SYSTEM.TAMPONS T LEFT JOIN SYSTEM.POLY P ON T.MAT=P.MAT ORDER BY T.CODE");
    }

    public List<String> getTamponCodes() {
        ensureTamponsTable();
        if (countTampons() == 0) {
            migrateTamponsFromPoly();
        }
        List<String> fromTampons = db.queryForList(
                "SELECT CODE FROM SYSTEM.TAMPONS ORDER BY CODE", String.class);
        if (fromTampons.isEmpty()) return getPolyTampons();
        return fromTampons;
    }

    public Long insertTampon(String code, String description) {
        ensureTamponsTable();
        db.update("INSERT INTO SYSTEM.TAMPONS (CODE,DESCRIPTION) VALUES (UPPER(?),?)", code, description);
        return db.queryForObject("SELECT ID FROM SYSTEM.TAMPONS WHERE CODE=UPPER(?)", Long.class, code);
    }

    public Optional<Map<String, Object>> findTamponByCode(String code) {
        ensureTamponsTable();
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT ID,CODE,DESCRIPTION,MAT FROM SYSTEM.TAMPONS WHERE UPPER(CODE)=UPPER(?)",
                code);
        return rows.stream().findFirst();
    }

    public void assignTamponToEmployee(String code, String mat) {
        db.update("UPDATE SYSTEM.TAMPONS SET MAT=? WHERE UPPER(CODE)=UPPER(?) AND MAT IS NULL",
                mat, code);
    }

    public void synchronizeEmployeeTampon(String code, String mat) {
        Optional<Map<String, Object>> tampon = findTamponByCode(code);
        Integer otherOwners = db.queryForObject(
                "SELECT COUNT(*) FROM SYSTEM.POLY WHERE UPPER(TAMPON)=UPPER(?) AND MAT<>?",
                Integer.class, code, mat);
        if (otherOwners != null && otherOwners > 0) {
            throw new IllegalArgumentException("Le tampon " + code + " est déjà attribué à un autre employé");
        }
        if (tampon.isEmpty()) {
            insertTampon(code, "");
        }
        int assigned = db.update(
                "UPDATE SYSTEM.TAMPONS SET MAT=? WHERE UPPER(CODE)=UPPER(?) AND (MAT IS NULL OR MAT=?)",
                mat, code, mat);
        if (assigned == 0) {
            throw new IllegalArgumentException("Le tampon " + code + " est déjà attribué à un autre employé");
        }
        db.update("UPDATE SYSTEM.TAMPONS SET MAT=NULL WHERE MAT=? AND UPPER(CODE)<>UPPER(?)", mat, code);
    }

    public void releaseEmployeeTampons(String mat) {
        if (tamponsTableExists()) {
            db.update("UPDATE SYSTEM.TAMPONS SET MAT=NULL WHERE MAT=?", mat);
        }
    }

    public void updateTampon(Long id, String code, String description) {
        db.update("UPDATE SYSTEM.TAMPONS SET CODE=UPPER(?),DESCRIPTION=? WHERE ID=?", code, description, id);
    }

    public void deleteTampon(Long id) {
        db.update("DELETE FROM SYSTEM.TAMPONS WHERE ID=?", id);
    }

    public void assignTampon(Long id, String mat) {
        db.update("UPDATE SYSTEM.TAMPONS SET MAT=? WHERE ID=?", mat, id);
    }

    public void unassignTampon(Long id) {
        db.update("UPDATE SYSTEM.TAMPONS SET MAT=NULL WHERE ID=?", id);
    }

    public List<Map<String, Object>> getEmployeeTampons(String mat) {
        if (!tamponsTableExists()) return Collections.emptyList();
        return db.queryForList("SELECT ID,CODE,DESCRIPTION,MAT FROM SYSTEM.TAMPONS WHERE MAT=? ORDER BY CODE", mat);
    }

    public Optional<Map<String, Object>> findSupervisorByTampon(String code) {
        if (tamponsTableExists()) {
            try {
                Map<String, Object> row = db.queryForMap(
                        "SELECT P.PROJET,P.EQUIPE,P.EQUIPE2,P.SUPERVISOR,P.NAME,T.CODE " +
                                "FROM SYSTEM.TAMPONS T JOIN SYSTEM.POLY P ON T.MAT=P.MAT " +
                                "WHERE UPPER(T.CODE)=UPPER(?) AND ROWNUM=1", code);
                return Optional.of(row);
            } catch (Exception ignored) {}
        }
        return lookupPoly(code);
    }

    public boolean tamponHasEmployee(Long id) {
        Integer cnt = db.queryForObject("SELECT COUNT(*) FROM SYSTEM.TAMPONS WHERE ID=? AND MAT IS NOT NULL", Integer.class, id);
        return cnt != null && cnt > 0;
    }

    public boolean isTamponUsedByOther(Long id, String mat) {
        Integer cnt = db.queryForObject(
                "SELECT COUNT(*) FROM SYSTEM.TAMPONS WHERE ID=? AND MAT IS NOT NULL AND MAT!=?",
                Integer.class, id, mat);
        return cnt != null && cnt > 0;
    }

    public List<Map<String, Object>> getAvailableTampons() {
        ensureTamponsTable();
        return db.queryForList(
                "SELECT ID, CODE, DESCRIPTION FROM SYSTEM.TAMPONS WHERE MAT IS NULL ORDER BY CODE");
    }

    public List<Map<String, Object>> getAvailableTamponsForEmployee(String mat) {
        ensureTamponsTable();
        return db.queryForList(
                "SELECT ID, CODE, DESCRIPTION, MAT FROM SYSTEM.TAMPONS WHERE MAT IS NULL OR MAT=? ORDER BY CODE",
                mat);
    }

    public int countTampons() {
        if (!tamponsTableExists()) return 0;
        Integer cnt = db.queryForObject("SELECT COUNT(*) FROM SYSTEM.TAMPONS", Integer.class);
        return cnt != null ? cnt : 0;
    }

    public int migrateTamponsFromPoly() {
        ensureTamponsTable();
        int inserted = 0;
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT DISTINCT TAMPON, MAT FROM SYSTEM.POLY WHERE TAMPON IS NOT NULL ORDER BY TAMPON");
        for (Map<String, Object> row : rows) {
            String code = str(row.get("TAMPON"));
            String mat  = str(row.get("MAT"));
            if (code.isBlank()) continue;
            try {
                db.update("INSERT INTO SYSTEM.TAMPONS (CODE, MAT) VALUES (UPPER(?), ?)", code, mat.isBlank() ? null : mat);
                inserted++;
            } catch (Exception e) {
                String msg = e.getMessage() != null ? e.getMessage() : "";
                if (!msg.contains("ORA-00001") && !msg.contains("unique constraint")) {
                    log.warn("migrate-tampons: could not insert tampon {}: {}", code, msg);
                }
            }
        }
        log.info("migrate-tampons: inserted {} tampons from POLY.TAMPON", inserted);
        return inserted;
    }

    private String str(Object o) { return o != null ? o.toString() : ""; }

    // ─── One-shot column migration cache ─────────────────────────────────────

    private final Set<String> ensuredTables = ConcurrentHashMap.newKeySet();

    public void ensureTableColumnsOnce(String tableName, String operatorCol) {
        if (ensuredTables.contains(tableName)) return;
        ensureTableColumns(tableName, operatorCol);
        ensuredTables.add(tableName);
    }

    // ─── Supervisor / DefCode management ─────────────────────────────────────

    public void ensureSupervisorsTable() {
        if (!supervisorsTableExists()) {
            db.execute("CREATE TABLE SYSTEM.SUPERVISORS (ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, NAME VARCHAR2(200) NOT NULL UNIQUE)");
        }
    }

    public int insertSupervisor(String name) {
        ensureSupervisorsTable();
        return db.update("INSERT INTO SYSTEM.SUPERVISORS (NAME) VALUES (?)", name);
    }

    public boolean supervisorExists(String name) {
        Integer count = db.queryForObject(
                "SELECT COUNT(*) FROM SYSTEM.SUPERVISORS WHERE UPPER(NAME)=UPPER(?)",
                Integer.class, name);
        return count != null && count > 0;
    }

    public int deleteSupervisor(String name) {
        return db.update("DELETE FROM SYSTEM.SUPERVISORS WHERE NAME=?", name);
    }

    public int insertDefCode(String cod, String description, int demerite, Integer delaiEcheanceHeures) {
        ensureDefDelaiColumn();
        // Guard against duplicates (SYSTEM.DEF has no unique constraint on COD)
        Integer exists = db.queryForObject("SELECT COUNT(*) FROM SYSTEM.DEF WHERE COD=?", Integer.class, cod);
        if (exists != null && exists > 0) {
            throw new IllegalArgumentException("Le code défaut '" + cod + "' existe déjà");
        }
        return db.update("INSERT INTO SYSTEM.DEF (COD,DESCRIPTION_DEFAUT,DEMERITE,DELAI_ECHEANCE_HEURES) VALUES (?,?,?,?)",
                cod, description, demerite, delaiEcheanceHeures);
    }

    public int updateDefCode(String cod, String description, int demerite, Integer delaiEcheanceHeures) {
        ensureDefDelaiColumn();
        return db.update("UPDATE SYSTEM.DEF SET DESCRIPTION_DEFAUT=?,DEMERITE=?,DELAI_ECHEANCE_HEURES=? WHERE COD=?",
                description, demerite, delaiEcheanceHeures, cod);
    }

    public boolean defCodeExists(String cod) {
        Integer count = db.queryForObject("SELECT COUNT(*) FROM SYSTEM.DEF WHERE COD=?", Integer.class, cod);
        return count != null && count > 0;
    }

    public int deleteDefCode(String cod) {
        return db.update("DELETE FROM SYSTEM.DEF WHERE COD=?", cod);
    }

    // ─── Dashboard helpers ────────────────────────────────────────────────────

    public Map<String, Object> fetchKpiRow(String tableName, String today) {
        String sql = "SELECT COUNT(DISTINCT BARCODE) AS TOTAL," +
                "SUM(CASE WHEN NVL(REPRISE,'Not Returned')='Returned' THEN 1 ELSE 0 END) AS RET," +
                "SUM(CASE WHEN NVL(REPRISE,'Not Returned')='Not Returned' THEN 1 ELSE 0 END) AS NOTRET," +
                "SUM(CASE WHEN REPRISE='Scrap' THEN 1 ELSE 0 END) AS SCR " +
                "FROM SYSTEM." + tableName + " WHERE TO_CHAR(DATEFW,'YYYY-MM-DD')=?";
        return db.queryForMap(sql, today);
    }

    public int fetchMonthCount(String tableName, String thisMonth) {
        Integer cnt = db.queryForObject(
                "SELECT COUNT(DISTINCT BARCODE) FROM SYSTEM." + tableName + " WHERE DATEFW>=TO_DATE(?,'YYYY-MM-DD')",
                Integer.class, thisMonth);
        return cnt != null ? cnt : 0;
    }

    public List<Map<String, Object>> fetchReprise(String tableName, String thisMonth) {
        return db.queryForList(
                "SELECT NVL(REPRISE,'Not Returned') AS STATUS,COUNT(*) AS CNT FROM SYSTEM." + tableName +
                        " WHERE DATEFW>=TO_DATE(?,'YYYY-MM-DD') GROUP BY NVL(REPRISE,'Not Returned')",
                thisMonth);
    }

    public List<Map<String, Object>> fetchDefects(String tableName, String thisMonth) {
        return db.queryForList(
                "SELECT CODDEF,COUNT(*) AS CNT FROM SYSTEM." + tableName +
                        " WHERE DATEFW>=TO_DATE(?,'YYYY-MM-DD') AND CODDEF IS NOT NULL GROUP BY CODDEF",
                thisMonth);
    }

    public List<Map<String, Object>> fetchTrend(String tableName, boolean isFw) {
        return db.queryForList(
                "SELECT TO_CHAR(DATEFW,'YYYY-MM-DD') AS DAY,COUNT(DISTINCT BARCODE) AS CNT " +
                        "FROM SYSTEM." + tableName + " WHERE DATEFW>=TRUNC(SYSDATE)-6 GROUP BY TO_CHAR(DATEFW,'YYYY-MM-DD')");
    }

    public List<Map<String, Object>> fetchByRef(String tableName, String thisMonth) {
        return db.queryForList(
                "SELECT REF,COUNT(DISTINCT BARCODE) AS CNT FROM SYSTEM." + tableName +
                        " WHERE DATEFW>=TO_DATE(?,'YYYY-MM-DD') AND REF IS NOT NULL GROUP BY REF",
                thisMonth);
    }

    public Set<String> getTableColumnNames(String tableName) {
        try {
            Set<String> cols = db.query(
                    "SELECT * FROM SYSTEM." + tableName + " WHERE 1=0",
                    (java.sql.ResultSet rs) -> {
                        Set<String> result = new LinkedHashSet<>();
                        ResultSetMetaData meta = rs.getMetaData();
                        for (int i = 1; i <= meta.getColumnCount(); i++) {
                            result.add(meta.getColumnName(i).toUpperCase());
                        }
                        return result;
                    });
            if (cols != null && !cols.isEmpty()) {
                log.info("Table {} has {} columns: {}", tableName, cols.size(), cols);
                return cols;
            }
        } catch (Exception e) {
            log.debug("ResultSetMetaData fallback for {}: {}", tableName, e.getMessage());
        }
        try {
            List<String> cols = db.queryForList(
                    "SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME=UPPER(?)",
                    String.class, tableName);
            if (!cols.isEmpty()) {
                log.info("Table {} has {} columns (via USER_TAB_COLUMNS)", tableName, cols.size());
                return new LinkedHashSet<>(cols);
            }
        } catch (Exception e) {
            log.debug("USER_TAB_COLUMNS failed for {}: {}", tableName, e.getMessage());
        }
        log.warn("Could not determine columns for {} — will use safe minimal set", tableName);
        return Collections.emptySet();
    }

    public int insertIfNotExistsDynamic(String tableName, String operatorCol,
                                        Set<String> existingCols, Map<String, Object> p) {
        List<Object[]> allDefs = List.of(
                new Object[]{"BARCODE",        "barCode",    "?"},
                new Object[]{"DATEFW",         "datefw",     "TO_DATE(?,'YYYY-MM-DD HH24:MI:SS')"},
                new Object[]{operatorCol,      "operator",   "?"},
                new Object[]{"CQDELIBERA",     "cqDelibera", "?"},
                new Object[]{"REF",            "ref",        "?"},
                new Object[]{"CODDEF",         "codeDef",    "?"},
                new Object[]{"CHECKPOINT",     "checkpoint", "?"},
                new Object[]{"DESC_DEF",       "descDef",    "?"},
                new Object[]{"QTY",            "qty",        "?"},
                new Object[]{"VERSION",        "version",    "?"},
                new Object[]{"POSTE",          "poste",      "?"},
                new Object[]{"REMARQUEDEFAUT", "remarque",   "?"},
                new Object[]{"DEMERITE",       "demirite",   "?"},
                new Object[]{"REPRISE",        "reprise",    "?"},
                new Object[]{"REF2",           "ref2",       "?"},
                new Object[]{"REF3",           "ref3",       "?"},
                new Object[]{"TAMPON",         "tampon",     "?"},
                new Object[]{"REFDETAIL",      "refDetail",  "?"},
                new Object[]{"PROJET",         "project",    "?"},
                new Object[]{"EQUIPEPROD",     "equipeProd", "?"},
                new Object[]{"SUPERVISEUR",    "superviseur", "?"},
                new Object[]{"DEFECT_STATUS",  "defstatus",   "?"},
                new Object[]{"RECORD_STATUS",  "recordStatus","?"},
                new Object[]{"MATRICULE",      "matricule",   "?"},
                new Object[]{"NOM_COMPLET",    "nomComplet",  "?"}
        );
        Set<String> springOnlyCols = Set.of("DEFECT_STATUS", "RECORD_STATUS", "MATRICULE", "NOM_COMPLET");
        List<Object[]> active = allDefs.stream()
                .filter(d -> existingCols.isEmpty()
                        ? !springOnlyCols.contains((String) d[0])
                        : existingCols.contains((String) d[0]))
                .collect(Collectors.toList());

        String colList = active.stream().map(d -> (String) d[0]).collect(Collectors.joining(","));
        String valList = active.stream().map(d -> (String) d[2]).collect(Collectors.joining(","));
        List<Object> params = active.stream().map(d -> p.get((String) d[1])).collect(Collectors.toList());

        String sql = "INSERT INTO SYSTEM." + tableName + " (" + colList + ") " +
                "SELECT " + valList + " FROM DUAL WHERE NOT EXISTS (" +
                "SELECT 1 FROM SYSTEM." + tableName +
                " WHERE BARCODE=? AND CODDEF=? AND TRUNC(DATEFW)=TRUNC(TO_DATE(?,'YYYY-MM-DD HH24:MI:SS')))";
        params.add(p.get("barCode"));
        params.add(p.get("codeDef"));
        params.add(p.get("datefw"));
        return db.update(sql, params.toArray());
    }

    public void ensureTableColumns(String tableName, String operatorCol) {
        List<Map.Entry<String, String>> required = List.of(
                Map.entry(operatorCol,      "VARCHAR2(128)"),
                Map.entry("REF2",           "VARCHAR2(128)"),
                Map.entry("REF3",           "VARCHAR2(128)"),
                Map.entry("TAMPON",         "VARCHAR2(128)"),
                Map.entry("REFDETAIL",      "VARCHAR2(128)"),
                Map.entry("PROJET",         "VARCHAR2(128)"),
                Map.entry("EQUIPEPROD",     "VARCHAR2(128)"),
                Map.entry("SUPERVISEUR",    "VARCHAR2(128)"),
                Map.entry("REPRISE",        "VARCHAR2(128)"),
                Map.entry("CHECKPOINT",     "VARCHAR2(500)"),
                Map.entry("DEMERITE",       "NUMBER(38,0)"),
                Map.entry("DEFECT_STATUS",  "VARCHAR2(20) DEFAULT 'NOT FIXED'"),
                Map.entry("RECORD_STATUS",  "VARCHAR2(30) DEFAULT 'Open'"),
                Map.entry("MATRICULE",      "VARCHAR2(50)"),
                Map.entry("NOM_COMPLET",    "VARCHAR2(200)")
        );
        for (Map.Entry<String, String> col : required) {
            try {
                db.execute("ALTER TABLE SYSTEM." + tableName +
                        " ADD (" + col.getKey() + " " + col.getValue() + ")");
                log.info("Added column {} to {}", col.getKey(), tableName);
            } catch (Exception e) {
                String msg = e.getMessage() != null ? e.getMessage() : "";
                if (!msg.contains("ORA-01430")) {
                    log.warn("Could not add column {} to {}: {}", col.getKey(), tableName, msg);
                }
            }
        }
    }

    public JdbcTemplate getJdbcTemplate() {
        return db;
    }

    // ─── Private utility ─────────────────────────────────────────────────────

    private Object[] appendParams(Object[] base, Object... extra) {
        Object[] result = new Object[base.length + extra.length];
        System.arraycopy(base, 0, result, 0, base.length);
        System.arraycopy(extra, 0, result, base.length, extra.length);
        return result;
    }

    // ─── Bulk reprise update ──────────────────────────────────────────────────

    public int bulkUpdateReprise(String tableName, List<String> barcodes, String newReprise) {
        String placeholders = barcodes.stream().map(b -> "?").collect(Collectors.joining(","));
        String sql = "UPDATE SYSTEM." + tableName + " SET REPRISE=? WHERE BARCODE IN (" + placeholders + ")";
        Object[] params = new Object[barcodes.size() + 1];
        params[0] = newReprise;
        for (int i = 0; i < barcodes.size(); i++) params[i + 1] = barcodes.get(i);
        return db.update(sql, params);
    }

    // ─── Bulk ref delete (by ROWID) ───────────────────────────────────────────

    public int bulkDeleteProjectRefs(String project, List<String> rowids) {
        String placeholders = rowids.stream().map(r -> "CHARTOROWID(?)").collect(Collectors.joining(","));
        String sql = "DELETE FROM SYSTEM.\"" + safe(project) + "\" WHERE ROWID IN (" + placeholders + ")";
        return db.update(sql, rowids.toArray());
    }

    // ─── POSTES ───────────────────────────────────────────────────────────────

    private static final String[] INITIAL_POSTES = {
            "AIRBAG","Aspect","assem","assem BA2","assem BAS","assem FINI","assem HAUT",
            "assem MOQUETTE","assem OREILLE","assem PLATEAU","assem PROFIL","assem SD",
            "assem Tie Down","assem TOILE","assem ZIP","BA2","BAS","bonde","ceinture",
            "DRILL","ELASTIQUE","EMPIECEMENT MOQUETTE","Fermeture poche AIRBAG","FOND",
            "Glaçage","haut","Impression top tether nok","Joue","MOQUETTE","moquette haut",
            "moquette oreille","moquette profil","NON-TISSE","Oreille","PLATEAU",
            "Poche Rideau","POLIBAND","PROFIL","rempli","Renfort","Rideau","SCRATCH","sd",
            "ss","SS moquette","SS plateau","TEP","Tie Down","TOILE","Vignette","WIRE","ZIP",
            "NEZ","ASS U SHAP","coupe","NA","ND"
    };

    public void ensurePostesTable() {
        if (tableExists("POSTES")) {
            ensurePostesCodeColumn();
            return;
        }
        db.execute("CREATE TABLE SYSTEM.POSTES (" +
                "ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY," +
                "CODE VARCHAR2(50) UNIQUE," +
                "NOM VARCHAR2(100) NOT NULL," +
                "CREATED_AT TIMESTAMP DEFAULT SYSDATE)");
        for (String nom : INITIAL_POSTES) {
            try { db.update("INSERT INTO SYSTEM.POSTES (NOM) VALUES (?)", nom); } catch (Exception ignored) {}
        }
    }

    private void ensurePostesCodeColumn() {
        try {
            db.queryForObject("SELECT CODE FROM SYSTEM.POSTES WHERE ROWNUM=1", String.class);
        } catch (Exception e) {
            try {
                db.execute("ALTER TABLE SYSTEM.POSTES ADD (CODE VARCHAR2(50) UNIQUE)");
                log.info("Added CODE column to POSTES table");
            } catch (Exception ex) {
                log.warn("Could not add CODE column to POSTES: {}", ex.getMessage());
            }
        }
    }

    public List<Map<String, Object>> getPostes() {
        ensurePostesTable();
        return db.queryForList("SELECT ID, CODE, NOM FROM SYSTEM.POSTES ORDER BY NOM");
    }

    public void insertPoste(String nom, String code) {
        ensurePostesTable();
        if (code != null && !code.isBlank()) {
            db.update("INSERT INTO SYSTEM.POSTES (CODE, NOM) VALUES (?, ?)", code.trim().toUpperCase(), nom.trim());
        } else {
            db.update("INSERT INTO SYSTEM.POSTES (NOM) VALUES (?)", nom.trim());
        }
    }

    public void updatePoste(Long id, String nom, String code) {
        if (code != null && !code.isBlank()) {
            db.update("UPDATE SYSTEM.POSTES SET NOM = ?, CODE = ? WHERE ID = ?", nom.trim(), code.trim().toUpperCase(), id);
        } else {
            db.update("UPDATE SYSTEM.POSTES SET NOM = ?, CODE = NULL WHERE ID = ?", nom.trim(), id);
        }
    }

    public void deletePoste(Long id) {
        db.update("DELETE FROM SYSTEM.POSTES WHERE ID = ?", id);
    }

    // ─── Verification Messages (1 Ref → N Messages) ───────────────────────────

    @PostConstruct
    public void initVerifMessagesTable() {
        try {
            Integer cnt = db.queryForObject(
                "SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME='REF_VERIF_MESSAGES'", Integer.class);
            if (cnt == null || cnt == 0) {
                db.execute("CREATE TABLE SYSTEM.REF_VERIF_MESSAGES (" +
                    "ID NUMBER NOT NULL," +
                    "PROJECT_NAME VARCHAR2(50) NOT NULL," +
                    "PDEF VARCHAR2(26) NOT NULL," +
                    "MESSAGE VARCHAR2(500) NOT NULL," +
                    "DISPLAY_ORDER NUMBER DEFAULT 0," +
                    "CONSTRAINT REF_VERIF_MSG_PK PRIMARY KEY (ID)) TABLESPACE SYSTEM");
                db.execute("CREATE SEQUENCE ref_verif_msg_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE");
                log.info("Created REF_VERIF_MESSAGES table and sequence");
            } else {
                ensureProjectNameColumn("REF_VERIF_MESSAGES");
                ensureRefMetadataSchema("REF_VERIF_MESSAGES", "MESSAGE", "REF_VERIF_MSG_SEQ");
                resyncVerifMsgSequence();
            }
        } catch (Exception e) {
            log.warn("Could not init REF_VERIF_MESSAGES: {}", e.getMessage());
        }
    }

    /**
     * Realigns ref_verif_msg_seq with MAX(ID) in REF_VERIF_MESSAGES. A prod export
     * imported locally (or any load that inserts explicit IDs) can leave rows with
     * IDs the sequence doesn't know about; once NEXTVAL catches up to one of those
     * IDs, inserts start failing with ORA-00001 on REF_VERIF_MSG_PK.
     */
    private void resyncVerifMsgSequence() {
        try {
            Long maxId = db.queryForObject(
                "SELECT NVL(MAX(ID),0) FROM SYSTEM.REF_VERIF_MESSAGES", Long.class);
            Long nextVal = db.queryForObject("SELECT ref_verif_msg_seq.NEXTVAL FROM DUAL", Long.class);
            if (maxId != null && nextVal != null && maxId >= nextVal) {
                long diff = maxId - nextVal + 1;
                db.execute("ALTER SEQUENCE ref_verif_msg_seq INCREMENT BY " + diff);
                db.queryForObject("SELECT ref_verif_msg_seq.NEXTVAL FROM DUAL", Long.class);
                db.execute("ALTER SEQUENCE ref_verif_msg_seq INCREMENT BY 1");
                log.warn("Resynced ref_verif_msg_seq: was behind MAX(ID)={} (advanced by {})", maxId, diff);
            }
        } catch (Exception e) {
            log.warn("Could not resync ref_verif_msg_seq: {}", e.getMessage());
        }
    }

    public List<String> getRefVerifMessages(String project, String pdef) {
        try {
            return db.queryForList(
                "SELECT MESSAGE FROM SYSTEM.REF_VERIF_MESSAGES WHERE PROJECT_NAME=? AND PDEF=? AND MESSAGE IS NOT NULL ORDER BY DISPLAY_ORDER,ID",
                String.class, project.toUpperCase(), pdef);
        } catch (Exception e) {
            log.warn("getRefVerifMessages failed: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    public List<Map<String, Object>> getAllRefVerifMessages() {
        return db.queryForList(
            "SELECT ID,PROJECT_NAME,PDEF,MESSAGE,DISPLAY_ORDER FROM SYSTEM.REF_VERIF_MESSAGES " +
                "WHERE MESSAGE IS NOT NULL ORDER BY PROJECT_NAME,PDEF,DISPLAY_ORDER,ID");
    }

    public void setRefVerifMessages(String project, String pdef, List<String> messages) {
        String pn = project.toUpperCase();
        db.update("DELETE FROM SYSTEM.REF_VERIF_MESSAGES WHERE PROJECT_NAME=? AND PDEF=?", pn, pdef);
        if (messages != null) {
            int order = 0;
            for (String msg : messages) {
                if (msg != null && !msg.isBlank()) {
                    insertVerifMessage(pn, pdef, msg.trim(), order++);
                }
            }
        }
    }

    private void insertVerifMessage(String project, String pdef, String message, int order) {
        try {
            db.update("INSERT INTO SYSTEM.REF_VERIF_MESSAGES (ID,PROJECT_NAME,PDEF,MESSAGE,DISPLAY_ORDER) " +
                "VALUES (ref_verif_msg_seq.NEXTVAL,?,?,?,?)",
                project, pdef, message, order);
        } catch (DataIntegrityViolationException e) {
            // ref_verif_msg_seq is behind MAX(ID) (e.g. rows imported since startup) — resync once and retry.
            resyncVerifMsgSequence();
            db.update("INSERT INTO SYSTEM.REF_VERIF_MESSAGES (ID,PROJECT_NAME,PDEF,MESSAGE,DISPLAY_ORDER) " +
                "VALUES (ref_verif_msg_seq.NEXTVAL,?,?,?,?)",
                project, pdef, message, order);
        }
    }

    // ─── Checkpoints (1 Ref → N Checkpoints) ──────────────────────────────────

    @PostConstruct
    public void initCheckpointsTable() {
        try {
            Integer cnt = db.queryForObject(
                "SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME='REF_CHECKPOINTS'", Integer.class);
            if (cnt == null || cnt == 0) {
                db.execute("CREATE TABLE SYSTEM.REF_CHECKPOINTS (" +
                    "ID NUMBER NOT NULL," +
                    "PROJECT_NAME VARCHAR2(50) NOT NULL," +
                    "PDEF VARCHAR2(26) NOT NULL," +
                    "CHECKPOINT VARCHAR2(500) NOT NULL," +
                    "DISPLAY_ORDER NUMBER DEFAULT 0," +
                    "CONSTRAINT REF_CHECKPOINT_PK PRIMARY KEY (ID)) TABLESPACE SYSTEM");
                db.execute("CREATE SEQUENCE ref_checkpoint_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE");
                log.info("Created REF_CHECKPOINTS table and sequence");
            } else {
                ensureProjectNameColumn("REF_CHECKPOINTS");
                ensureRefMetadataSchema("REF_CHECKPOINTS", "CHECKPOINT", "REF_CHECKPOINT_SEQ");
            }
        } catch (Exception e) {
            log.warn("Could not init REF_CHECKPOINTS: {}", e.getMessage());
        }
    }

    private void ensureProjectNameColumn(String tableName) {
        Integer count = db.queryForObject(
            "SELECT COUNT(*) FROM USER_TAB_COLUMNS WHERE TABLE_NAME=? AND COLUMN_NAME='PROJECT_NAME'",
            Integer.class, tableName);
        if (count != null && count == 0) {
            db.execute("ALTER TABLE SYSTEM." + tableName + " ADD (PROJECT_NAME VARCHAR2(50))");
            log.info("Added PROJECT_NAME column to SYSTEM.{}", tableName);
        }

    }

    private void ensureRefMetadataSchema(String table, String textColumn, String sequence) {
        Map<String, String> required = Map.of("ID", "NUMBER", textColumn, "VARCHAR2(500)", "DISPLAY_ORDER", "NUMBER DEFAULT 0");
        for (var column : required.entrySet()) {
            Integer count = db.queryForObject(
                    "SELECT COUNT(*) FROM USER_TAB_COLUMNS WHERE TABLE_NAME=? AND COLUMN_NAME=?",
                    Integer.class, table, column.getKey());
            if (count != null && count == 0) {
                db.execute("ALTER TABLE SYSTEM." + table + " ADD (" + column.getKey() + " " + column.getValue() + ")");
                log.warn("Restored missing metadata column {}.{}; legacy reference columns and rows preserved", table, column.getKey());
            }
        }
        Long max = db.queryForObject("SELECT NVL(MAX(ID),0) FROM SYSTEM." + table, Long.class);
        Integer exists = db.queryForObject("SELECT COUNT(*) FROM USER_SEQUENCES WHERE SEQUENCE_NAME=?", Integer.class, sequence);
        if (exists != null && exists == 0) {
            db.execute("CREATE SEQUENCE " + sequence + " START WITH " + (max + 1) + " NOCACHE NOCYCLE");
        } else {
            Long next = db.queryForObject("SELECT " + sequence + ".NEXTVAL FROM DUAL", Long.class);
            if (next != null && max != null && max >= next) {
                db.execute("ALTER SEQUENCE " + sequence + " INCREMENT BY " + (max - next + 1));
                db.queryForObject("SELECT " + sequence + ".NEXTVAL FROM DUAL", Long.class);
                db.execute("ALTER SEQUENCE " + sequence + " INCREMENT BY 1");
            }
        }
        db.update("UPDATE SYSTEM." + table + " SET ID=" + sequence + ".NEXTVAL WHERE ID IS NULL");
    }

    public List<String> getRefCheckpoints(String project, String pdef) {
        try {
            return db.queryForList(
                "SELECT CHECKPOINT FROM SYSTEM.REF_CHECKPOINTS WHERE PROJECT_NAME=? AND PDEF=? AND CHECKPOINT IS NOT NULL ORDER BY DISPLAY_ORDER,ID",
                String.class, project.toUpperCase(), pdef);
        } catch (Exception e) {
            log.warn("getRefCheckpoints failed: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    public List<Map<String, Object>> getAllRefCheckpoints() {
        return db.queryForList(
            "SELECT ID,PROJECT_NAME,PDEF,CHECKPOINT,DISPLAY_ORDER FROM SYSTEM.REF_CHECKPOINTS " +
                "WHERE CHECKPOINT IS NOT NULL ORDER BY PROJECT_NAME,PDEF,DISPLAY_ORDER,ID");
    }

    public void setRefCheckpoints(String project, String pdef, List<String> checkpoints) {
        db.update("DELETE FROM SYSTEM.REF_CHECKPOINTS WHERE PROJECT_NAME=? AND PDEF=?",
            project.toUpperCase(), pdef);
        if (checkpoints != null) {
            int order = 0;
            for (String cp : checkpoints) {
                if (cp != null && !cp.isBlank()) {
                    db.update("INSERT INTO SYSTEM.REF_CHECKPOINTS (ID,PROJECT_NAME,PDEF,CHECKPOINT,DISPLAY_ORDER) " +
                        "VALUES (ref_checkpoint_seq.NEXTVAL,?,?,?,?)",
                        project.toUpperCase(), pdef, cp.trim(), order++);
                }
            }
        }
    }
}