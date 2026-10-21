package com.adient.firewall.repository;

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
public class ProductionRepository {

    private final JdbcTemplate db;

    @PostConstruct
    public void init() {
        try {
            ensureTable();
        } catch (Exception e) {
            log.warn("PRODUCTION_QTE init warning: {}", e.getMessage());
        }
    }

    private void ensureTable() {
        Integer cnt = db.queryForObject(
                "SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME='PRODUCTION_QTE'", Integer.class);
        if (cnt == null || cnt == 0) {
            db.execute("CREATE TABLE SYSTEM.PRODUCTION_QTE (" +
                    "ID         NUMBER PRIMARY KEY," +
                    "PROJET     VARCHAR2(50)  NOT NULL," +
                    "MODULE     VARCHAR2(20)  NOT NULL," +
                    "DATE_PROD  DATE          NOT NULL," +
                    "QTE_GLOBALE NUMBER       NOT NULL," +
                    "SAISIE_PAR VARCHAR2(100)," +
                    "CREATED_AT DATE DEFAULT SYSDATE" +
                    ") TABLESPACE SYSTEM");
            log.info("Created SYSTEM.PRODUCTION_QTE");
        }
        Integer seqCnt = db.queryForObject(
                "SELECT COUNT(*) FROM USER_SEQUENCES WHERE SEQUENCE_NAME='PROD_QTE_SEQ'", Integer.class);
        if (seqCnt == null || seqCnt == 0) {
            db.execute("CREATE SEQUENCE SYSTEM.PROD_QTE_SEQ START WITH 1 INCREMENT BY 1 NOCACHE");
            log.info("Created SYSTEM.PROD_QTE_SEQ");
        }
    }

    public Long insert(String projet, String module, String dateProd, long qteGlobale, String saisiePar) {
        Long id = db.queryForObject("SELECT SYSTEM.PROD_QTE_SEQ.NEXTVAL FROM DUAL", Long.class);
        db.update("INSERT INTO SYSTEM.PRODUCTION_QTE (ID,PROJET,MODULE,DATE_PROD,QTE_GLOBALE,SAISIE_PAR,CREATED_AT) " +
                "VALUES (?,?,?,TO_DATE(?,'YYYY-MM-DD'),?,?,SYSDATE)",
                id, projet.toUpperCase(), module.toUpperCase(), dateProd, qteGlobale, saisiePar);
        return id;
    }

    public int update(Long id, long qteGlobale) {
        return db.update("UPDATE SYSTEM.PRODUCTION_QTE SET QTE_GLOBALE=? WHERE ID=?", qteGlobale, id);
    }

    public int delete(Long id) {
        return db.update("DELETE FROM SYSTEM.PRODUCTION_QTE WHERE ID=?", id);
    }

    public List<Map<String, Object>> find(String projet, String module, String dateFrom, String dateTo) {
        StringBuilder sql = new StringBuilder(
                "SELECT ID,PROJET,MODULE,TO_CHAR(DATE_PROD,'YYYY-MM-DD') AS DATE_PROD," +
                "QTE_GLOBALE,SAISIE_PAR,TO_CHAR(CREATED_AT,'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT " +
                "FROM SYSTEM.PRODUCTION_QTE WHERE 1=1");
        List<Object> params = new ArrayList<>();
        if (projet != null && !projet.isBlank()) { sql.append(" AND PROJET=?"); params.add(projet.toUpperCase()); }
        if (module != null && !module.isBlank()) { sql.append(" AND MODULE=?"); params.add(module.toUpperCase()); }
        if (dateFrom != null && !dateFrom.isBlank()) { sql.append(" AND DATE_PROD >= TO_DATE(?,'YYYY-MM-DD')"); params.add(dateFrom); }
        if (dateTo   != null && !dateTo.isBlank())   { sql.append(" AND DATE_PROD <= TO_DATE(?,'YYYY-MM-DD')"); params.add(dateTo); }
        sql.append(" ORDER BY DATE_PROD DESC, ID DESC");
        return db.queryForList(sql.toString(), params.toArray());
    }

    /** Sum QTE_GLOBALE for a given period. */
    public long sumQteGlobale(String projet, String module, String dateFrom, String dateTo) {
        StringBuilder sql = new StringBuilder(
                "SELECT NVL(SUM(QTE_GLOBALE),0) FROM SYSTEM.PRODUCTION_QTE WHERE 1=1");
        List<Object> params = new ArrayList<>();
        if (projet   != null && !projet.isBlank())   { sql.append(" AND PROJET=?"); params.add(projet.toUpperCase()); }
        if (module   != null && !module.isBlank())   { sql.append(" AND MODULE=?"); params.add(module.toUpperCase()); }
        if (dateFrom != null && !dateFrom.isBlank()) { sql.append(" AND DATE_PROD >= TO_DATE(?,'YYYY-MM-DD')"); params.add(dateFrom); }
        if (dateTo   != null && !dateTo.isBlank())   { sql.append(" AND DATE_PROD <= TO_DATE(?,'YYYY-MM-DD')"); params.add(dateTo); }
        Long res = db.queryForObject(sql.toString(), Long.class, params.toArray());
        return res != null ? res : 0L;
    }
}
