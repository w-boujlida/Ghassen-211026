package com.adient.firewall.repository;

import com.adient.firewall.dto.TriFicheInput;
import com.adient.firewall.dto.TriZoneInput;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Repository
@RequiredArgsConstructor
@Slf4j
public class TriRepository {

    private final JdbcTemplate db;

    // ─── Init ─────────────────────────────────────────────────────────────────

    @PostConstruct
    public void init() {
        try {
            ensureTriTablesExist();
        } catch (Exception e) {
            log.warn("TRI tables init warning: {}", e.getMessage());
        }
    }

    private void ensureTriTablesExist() {
        // TRI_FICHE
        Integer fiche = db.queryForObject(
                "SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME='TRI_FICHE'", Integer.class);
        if (fiche == null || fiche == 0) {
            db.execute("CREATE TABLE SYSTEM.TRI_FICHE (" +
                    "ID NUMBER PRIMARY KEY," +
                    "NUM NUMBER NOT NULL," +
                    "DATE_TRI DATE DEFAULT SYSDATE," +
                    "PROJET VARCHAR2(50) NOT NULL," +
                    "COIFFE VARCHAR2(100)," +
                    "VERSION VARCHAR2(100)," +
                    "DEFAUT VARCHAR2(500)," +
                    "STATUS VARCHAR2(20) DEFAULT 'NON LANCEE'," +
                    "CREATED_AT DATE DEFAULT SYSDATE," +
                    "UPDATED_AT DATE DEFAULT SYSDATE" +
                    ") TABLESPACE SYSTEM");
            log.info("Created SYSTEM.TRI_FICHE");
        }
        // TRI_ZONE
        Integer zone = db.queryForObject(
                "SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME='TRI_ZONE'", Integer.class);
        if (zone == null || zone == 0) {
            db.execute("CREATE TABLE SYSTEM.TRI_ZONE (" +
                    "ID NUMBER PRIMARY KEY," +
                    "FICHE_ID NUMBER REFERENCES SYSTEM.TRI_FICHE(ID) ON DELETE CASCADE," +
                    "ZONE_NAME VARCHAR2(100) NOT NULL," +
                    "QTE_GLOBALE NUMBER DEFAULT 0," +
                    "QTE_TRIEE NUMBER DEFAULT 0," +
                    "QTE_NOK NUMBER DEFAULT 0," +
                    "QTE_OK NUMBER DEFAULT 0" +
                    ") TABLESPACE SYSTEM");
            log.info("Created SYSTEM.TRI_ZONE");
        } else {
            // Migrate: add new columns if they don't exist yet
            ensureZoneColumn("QTE_GLOBALE", "NUMBER DEFAULT 0");
            ensureZoneColumn("QTE_OK",      "NUMBER DEFAULT 0");
        }
        // TRI_FICHE_SEQ
        Integer ficheSeq = db.queryForObject(
                "SELECT COUNT(*) FROM USER_SEQUENCES WHERE SEQUENCE_NAME='TRI_FICHE_SEQ'", Integer.class);
        if (ficheSeq == null || ficheSeq == 0) {
            db.execute("CREATE SEQUENCE SYSTEM.TRI_FICHE_SEQ START WITH 1 INCREMENT BY 1 NOCACHE");
            log.info("Created SYSTEM.TRI_FICHE_SEQ");
        }
        // TRI_ZONE_SEQ
        Integer zoneSeq = db.queryForObject(
                "SELECT COUNT(*) FROM USER_SEQUENCES WHERE SEQUENCE_NAME='TRI_ZONE_SEQ'", Integer.class);
        if (zoneSeq == null || zoneSeq == 0) {
            db.execute("CREATE SEQUENCE SYSTEM.TRI_ZONE_SEQ START WITH 1 INCREMENT BY 1 NOCACHE");
            log.info("Created SYSTEM.TRI_ZONE_SEQ");
        }
    }

    private void ensureZoneColumn(String col, String definition) {
        try {
            Integer cnt = db.queryForObject(
                    "SELECT COUNT(*) FROM USER_TAB_COLUMNS WHERE TABLE_NAME='TRI_ZONE' AND COLUMN_NAME=?",
                    Integer.class, col);
            if (cnt == null || cnt == 0) {
                db.execute("ALTER TABLE SYSTEM.TRI_ZONE ADD " + col + " " + definition);
                log.info("Added column {} to SYSTEM.TRI_ZONE", col);
            }
        } catch (Exception e) {
            log.warn("Could not ensure column {} on TRI_ZONE: {}", col, e.getMessage());
        }
    }

    // ─── Queries ──────────────────────────────────────────────────────────────

    public int countFiches(String projet, String status) {
        StringBuilder sql = new StringBuilder("SELECT COUNT(*) FROM SYSTEM.TRI_FICHE WHERE 1=1");
        List<Object> params = new ArrayList<>();
        if (projet != null && !projet.isBlank()) { sql.append(" AND PROJET=?"); params.add(projet.toUpperCase()); }
        if (status != null && !status.isBlank()) { sql.append(" AND STATUS=?"); params.add(status.toUpperCase()); }
        Integer cnt = db.queryForObject(sql.toString(), Integer.class, params.toArray());
        return cnt != null ? cnt : 0;
    }

    public List<Map<String, Object>> fetchFiches(String projet, String status, int page, int limit) {
        int startRow = (page - 1) * limit + 1;
        int endRow   = page * limit;
        StringBuilder inner = new StringBuilder(
                "SELECT f.ID,f.NUM,TO_CHAR(f.DATE_TRI,'YYYY-MM-DD') AS DATE_TRI," +
                "f.PROJET,f.COIFFE,f.VERSION,f.DEFAUT,f.STATUS," +
                "ROW_NUMBER() OVER (ORDER BY f.DATE_TRI DESC, f.ID DESC) AS RN " +
                "FROM SYSTEM.TRI_FICHE f WHERE 1=1");
        List<Object> params = new ArrayList<>();
        if (projet != null && !projet.isBlank()) { inner.append(" AND f.PROJET=?"); params.add(projet.toUpperCase()); }
        if (status != null && !status.isBlank()) { inner.append(" AND f.STATUS=?"); params.add(status.toUpperCase()); }
        String sql = "SELECT * FROM (" + inner + ") WHERE RN BETWEEN ? AND ? ORDER BY DATE_TRI DESC, ID DESC";
        params.add(startRow);
        params.add(endRow);
        return db.queryForList(sql, params.toArray());
    }

    public Map<String, Object> fetchFicheById(Long id) {
        return db.queryForMap(
                "SELECT f.ID,f.NUM,TO_CHAR(f.DATE_TRI,'YYYY-MM-DD') AS DATE_TRI," +
                "f.PROJET,f.COIFFE,f.VERSION,f.DEFAUT,f.STATUS FROM SYSTEM.TRI_FICHE f WHERE f.ID=?", id);
    }

    public List<Map<String, Object>> fetchZonesByFiche(Long ficheId) {
        return db.queryForList(
                "SELECT ID,ZONE_NAME,QTE_GLOBALE,QTE_TRIEE,QTE_NOK,QTE_OK FROM SYSTEM.TRI_ZONE WHERE FICHE_ID=? ORDER BY ID",
                ficheId);
    }

    public Long insertFiche(String projet, Integer num, String dateTri, String coiffe,
                             String version, String defaut, String status) {
        Long id = db.queryForObject("SELECT SYSTEM.TRI_FICHE_SEQ.NEXTVAL FROM DUAL", Long.class);
        db.update("INSERT INTO SYSTEM.TRI_FICHE (ID,NUM,DATE_TRI,PROJET,COIFFE,VERSION,DEFAUT,STATUS,CREATED_AT,UPDATED_AT) " +
                "VALUES (?,?,TO_DATE(?,'YYYY-MM-DD'),?,?,?,?,?,SYSDATE,SYSDATE)",
                id, num, dateTri, projet.toUpperCase(), coiffe, version, defaut, status.toUpperCase());
        return id;
    }

    public int updateFiche(Long id, String dateTri, String coiffe, String version,
                            String defaut, String status) {
        return db.update("UPDATE SYSTEM.TRI_FICHE SET DATE_TRI=TO_DATE(?,'YYYY-MM-DD')," +
                "COIFFE=?,VERSION=?,DEFAUT=?,STATUS=?,UPDATED_AT=SYSDATE WHERE ID=?",
                dateTri, coiffe, version, defaut, status.toUpperCase(), id);
    }

    public int deleteFiche(Long id) {
        return db.update("DELETE FROM SYSTEM.TRI_FICHE WHERE ID=?", id);
    }

    public void insertZones(Long ficheId, List<TriZoneInput> zones) {
        for (TriZoneInput z : zones) {
            Long zid = db.queryForObject("SELECT SYSTEM.TRI_ZONE_SEQ.NEXTVAL FROM DUAL", Long.class);
            int qteGlobale = z.qteGlobale() != null ? z.qteGlobale() : 0;
            int qteTriee   = z.qteTriee()   != null ? z.qteTriee()   : 0;
            int qteNok     = z.qteNok()     != null ? z.qteNok()     : 0;
            int qteOk      = z.qteOk()      != null ? z.qteOk()      : Math.max(0, qteTriee - qteNok);
            db.update("INSERT INTO SYSTEM.TRI_ZONE (ID,FICHE_ID,ZONE_NAME,QTE_GLOBALE,QTE_TRIEE,QTE_NOK,QTE_OK) VALUES (?,?,?,?,?,?,?)",
                    zid, ficheId, z.zoneName(), qteGlobale, qteTriee, qteNok, qteOk);
        }
    }

    public void deleteZonesByFiche(Long ficheId) {
        db.update("DELETE FROM SYSTEM.TRI_ZONE WHERE FICHE_ID=?", ficheId);
    }

    public int getNextNum(String projet) {
        Integer max = db.queryForObject(
                "SELECT NVL(MAX(NUM),0)+1 FROM SYSTEM.TRI_FICHE WHERE PROJET=?",
                Integer.class, projet.toUpperCase());
        return max != null ? max : 1;
    }

    public Map<String, Object> fetchStats(String projet) {
        StringBuilder sql = new StringBuilder(
                "SELECT STATUS, COUNT(*) AS CNT FROM SYSTEM.TRI_FICHE WHERE 1=1");
        List<Object> params = new ArrayList<>();
        if (projet != null && !projet.isBlank()) {
            sql.append(" AND PROJET=?");
            params.add(projet.toUpperCase());
        }
        sql.append(" GROUP BY STATUS");
        List<Map<String, Object>> rows = db.queryForList(sql.toString(), params.toArray());
        long total = 0, encours = 0, cloture = 0, nonLancee = 0;
        for (Map<String, Object> row : rows) {
            String status = String.valueOf(row.get("STATUS"));
            long cnt = ((Number) row.get("CNT")).longValue();
            total += cnt;
            if ("ENCOURS".equals(status))     encours  = cnt;
            else if ("CLOTURE".equals(status)) cloture  = cnt;
            else if ("NON LANCEE".equals(status)) nonLancee = cnt;
        }
        return Map.of("total", total, "encours", encours, "cloture", cloture, "nonLancee", nonLancee);
    }

    public List<Map<String, Object>> fetchAllForExport(String projet, String status) {
        StringBuilder sql = new StringBuilder(
                "SELECT f.ID,f.NUM,TO_CHAR(f.DATE_TRI,'YYYY-MM-DD') AS DATE_TRI," +
                "f.PROJET,f.COIFFE,f.VERSION,f.DEFAUT,f.STATUS " +
                "FROM SYSTEM.TRI_FICHE f WHERE 1=1");
        List<Object> params = new ArrayList<>();
        if (projet != null && !projet.isBlank()) { sql.append(" AND f.PROJET=?"); params.add(projet.toUpperCase()); }
        if (status  != null && !status.isBlank()) { sql.append(" AND f.STATUS=?");  params.add(status.toUpperCase()); }
        sql.append(" ORDER BY f.DATE_TRI DESC, f.ID DESC");
        return db.queryForList(sql.toString(), params.toArray());
    }

    public boolean ficheExistsByNumProjet(Integer num, String projet) {
        Integer cnt = db.queryForObject(
                "SELECT COUNT(*) FROM SYSTEM.TRI_FICHE WHERE NUM=? AND PROJET=?",
                Integer.class, num, projet.toUpperCase());
        return cnt != null && cnt > 0;
    }
}
