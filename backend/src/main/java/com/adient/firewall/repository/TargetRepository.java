package com.adient.firewall.repository;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

@Repository
@RequiredArgsConstructor
@Slf4j
public class TargetRepository {

    private final JdbcTemplate db;
    private final QualityRepository qRepo;

    @PostConstruct
    public void ensureTables() {
        qRepo.seedModulePermissions("target", "admin", "read", "none", "read");

        if (!qRepo.tableExists("TARGETS")) {
            db.execute("""
                CREATE TABLE SYSTEM.TARGETS (
                    ID         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    PROJET     VARCHAR2(50)  NOT NULL,
                    SHIFT      VARCHAR2(20)  NOT NULL,
                    CREATED_BY VARCHAR2(100),
                    CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP
                )
            """);
            log.info("Created SYSTEM.TARGETS");
        }
        if (!qRepo.tableExists("TARGET_DETAILS")) {
            db.execute("""
                CREATE TABLE SYSTEM.TARGET_DETAILS (
                    ID           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    TARGET_ID    NUMBER NOT NULL,
                    LIGNE_PROJET VARCHAR2(200),
                    HEURE        VARCHAR2(20),
                    VALEUR       NUMBER
                )
            """);
            log.info("Created SYSTEM.TARGET_DETAILS");
        }
    }

    public long insertHeader(String projet, String shift, String createdBy) {
        KeyHolder kh = new GeneratedKeyHolder();
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                "INSERT INTO SYSTEM.TARGETS (PROJET, SHIFT, CREATED_BY) VALUES (?,?,?)",
                new String[]{"ID"});
            ps.setString(1, projet);
            ps.setString(2, shift);
            ps.setString(3, createdBy);
            return ps;
        }, kh);
        return Objects.requireNonNull(kh.getKey()).longValue();
    }

    public void insertDetail(long targetId, String ligneProjet, String heure, double valeur) {
        db.update("INSERT INTO SYSTEM.TARGET_DETAILS (TARGET_ID, LIGNE_PROJET, HEURE, VALEUR) VALUES (?,?,?,?)",
                targetId, ligneProjet, heure, valeur);
    }

    public List<Map<String, Object>> listHeaders() {
        return db.queryForList(
            "SELECT t.ID, t.PROJET, t.SHIFT, t.CREATED_BY, " +
            "TO_CHAR(t.CREATED_AT,'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT, " +
            "(SELECT COUNT(DISTINCT d.LIGNE_PROJET) FROM SYSTEM.TARGET_DETAILS d WHERE d.TARGET_ID = t.ID) AS NB_LIGNES " +
            "FROM SYSTEM.TARGETS t ORDER BY t.ID DESC");
    }

    /** Dernier target enregistré pour un projet+shift (le plus récent fait foi pour le dashboard temps réel). */
    public Optional<Long> findLatestHeaderId(String projet, String shift) {
        List<Long> ids = db.queryForList(
            "SELECT ID FROM SYSTEM.TARGETS WHERE UPPER(PROJET)=UPPER(?) AND SHIFT=? " +
            "ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY",
            Long.class, projet, shift);
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.get(0));
    }

    public Optional<Map<String, Object>> findHeaderById(long id) {
        List<Map<String, Object>> rows = db.queryForList(
            "SELECT ID, PROJET, SHIFT, CREATED_BY, " +
            "TO_CHAR(CREATED_AT,'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT " +
            "FROM SYSTEM.TARGETS WHERE ID = ?", id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<Map<String, Object>> findDetailsByTargetId(long id) {
        return db.queryForList(
            "SELECT LIGNE_PROJET, HEURE, VALEUR FROM SYSTEM.TARGET_DETAILS " +
            "WHERE TARGET_ID = ? ORDER BY LIGNE_PROJET, HEURE", id);
    }

    public List<Map<String, Object>> findLatestDetailsForAllTargets() {
        return db.queryForList(
            "SELECT t.PROJET, t.SHIFT, d.LIGNE_PROJET, d.HEURE, NVL(d.VALEUR,0) AS VALEUR " +
            "FROM SYSTEM.TARGETS t " +
            "JOIN (SELECT PROJET, SHIFT, MAX(ID) AS ID FROM SYSTEM.TARGETS GROUP BY PROJET, SHIFT) latest " +
            "ON latest.ID = t.ID " +
            "JOIN SYSTEM.TARGET_DETAILS d ON d.TARGET_ID = t.ID");
    }

    public void updateDetailValue(long targetId, String ligneProjet, String heure, double valeur) {
        db.update(
            "UPDATE SYSTEM.TARGET_DETAILS SET VALEUR = ? WHERE TARGET_ID = ? AND LIGNE_PROJET = ? AND HEURE = ?",
            valeur, targetId, ligneProjet, heure);
    }

    public void deleteTarget(long id) {
        db.update("DELETE FROM SYSTEM.TARGET_DETAILS WHERE TARGET_ID = ?", id);
        db.update("DELETE FROM SYSTEM.TARGETS WHERE ID = ?", id);
    }
}
