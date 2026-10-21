package com.adient.firewall.repository;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Agrégations "défauts par couturière" au-dessus des tables Délibéra existantes
 * (DELIBERA_RECORDS / DELIBERA_RECORD_DEFAUTS / DELIBERA_COUTURIERES). Toujours GROUP BY en SQL,
 * jamais de comptage en Java sur toutes les lignes — même discipline que DeliberaRepository
 * (bornes [debut, fin[ sargables sur l'index composite).
 */
@Repository
@RequiredArgsConstructor
@Slf4j
public class DefautCouturiereRepository {

    private final JdbcTemplate db;

    @PostConstruct
    public void init() {
        // Index dédié aux agrégations par couturière (le seul index existant sur DELIBERA_RECORDS
        // est (PROJET, LIGNE, CREATED_AT), sans COUTURIERE_ID).
        try {
            db.execute("CREATE INDEX SYSTEM.IDX_DELIBERA_COUTURIERE_DT ON SYSTEM.DELIBERA_RECORDS (COUTURIERE_ID, CREATED_AT)");
        } catch (Exception ignored) {}
    }

    // ─── Tableau agrégé : couturières x postes ─────────────────────────────────

    /** GROUP BY couturière + poste, bornes [heureDebut, heureFin[ sur CREATED_AT (déjà en Africa/Tunis). */
    public List<Map<String, Object>> tableauParCouturiereEtPoste(String projet, String ligne,
                                                                  LocalDateTime debut, LocalDateTime fin) {
        StringBuilder sql = new StringBuilder(
            "SELECT r.COUTURIERE_ID AS COUTURIERE_ID, c.MATRICULE AS MATRICULE, c.NOM AS NOM, " +
            "NVL(p.NOM,'Sans poste') AS POSTE_NOM, COUNT(rd.ID) AS NB " +
            "FROM SYSTEM.DELIBERA_RECORDS r " +
            "JOIN SYSTEM.DELIBERA_RECORD_DEFAUTS rd ON rd.RECORD_ID = r.ID " +
            "LEFT JOIN SYSTEM.DELIBERA_COUTURIERES c ON c.ID = r.COUTURIERE_ID " +
            "LEFT JOIN SYSTEM.POSTES p ON p.ID = r.POSTE_ID " +
            "WHERE r.COUTURIERE_ID IS NOT NULL " +
            "AND UPPER(r.PROJET) = UPPER(?) " +
            "AND r.CREATED_AT >= ? AND r.CREATED_AT < ? ");
        List<Object> params = new ArrayList<>(List.of(projet, Timestamp.valueOf(debut), Timestamp.valueOf(fin)));
        if (ligne != null && !ligne.isBlank()) {
            sql.append("AND UPPER(r.LIGNE) = UPPER(?) ");
            params.add(ligne);
        }
        sql.append("GROUP BY r.COUTURIERE_ID, c.MATRICULE, c.NOM, NVL(p.NOM,'Sans poste') ORDER BY c.NOM");
        return db.queryForList(sql.toString(), params.toArray());
    }

    // ─── Identité couturière ────────────────────────────────────────────────────

    public Map<String, Object> findCouturiereByMatricule(String matricule) {
        try {
            return db.queryForMap(
                "SELECT ID, MATRICULE, NOM, PROJET FROM SYSTEM.DELIBERA_COUTURIERES WHERE MATRICULE = ?", matricule);
        } catch (Exception e) {
            return null;
        }
    }

    // ─── Détail d'une couturière ────────────────────────────────────────────────

    /** Défauts individuels (avec heure de scan) d'une couturière, groupés par poste côté Java. */
    public List<Map<String, Object>> detailCouturiere(String matricule, String projet, String ligne,
                                                       LocalDateTime debut, LocalDateTime fin) {
        StringBuilder sql = new StringBuilder(
            "SELECT r.ID AS RECORD_ID, NVL(p.NOM,'Sans poste') AS POSTE_NOM, " +
            "TO_CHAR(r.CREATED_AT,'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT, " +
            "rd.ID AS DEFAUT_ID, rd.CODE_DEFAUT, rd.DESC_DEFAUT, rd.VERIFIE " +
            "FROM SYSTEM.DELIBERA_RECORDS r " +
            "JOIN SYSTEM.DELIBERA_RECORD_DEFAUTS rd ON rd.RECORD_ID = r.ID " +
            "LEFT JOIN SYSTEM.POSTES p ON p.ID = r.POSTE_ID " +
            "WHERE r.COUTURIERE_ID = (SELECT ID FROM SYSTEM.DELIBERA_COUTURIERES WHERE MATRICULE = ?) " +
            "AND UPPER(r.PROJET) = UPPER(?) " +
            "AND r.CREATED_AT >= ? AND r.CREATED_AT < ? ");
        List<Object> params = new ArrayList<>(List.of(matricule, projet, Timestamp.valueOf(debut), Timestamp.valueOf(fin)));
        if (ligne != null && !ligne.isBlank()) {
            sql.append("AND UPPER(r.LIGNE) = UPPER(?) ");
            params.add(ligne);
        }
        sql.append("ORDER BY r.CREATED_AT, NVL(p.NOM,'Sans poste')");
        return db.queryForList(sql.toString(), params.toArray());
    }

    // ─── Synthèse rapport : couturières x postes sur une période ───────────────

    public List<Map<String, Object>> syntheseParCouturiereEtPoste(String projet, String ligne,
                                                                   LocalDateTime debut, LocalDateTime fin) {
        return tableauParCouturiereEtPoste(projet, ligne, debut, fin);
    }

    // ─── Comptage pour la règle d'alerte (codes défauts, une couturière, une heure calendaire) ──

    /** Nombre total de codes défauts pour une couturière sur [heureDebut, heureDebut+1[ — toutes lignes/postes confondus. */
    public long countCodesDefautsHeure(long couturiereId, LocalDateTime heureDebut, LocalDateTime heureFin) {
        Long cnt = db.queryForObject(
            "SELECT COUNT(rd.ID) FROM SYSTEM.DELIBERA_RECORD_DEFAUTS rd " +
            "JOIN SYSTEM.DELIBERA_RECORDS r ON r.ID = rd.RECORD_ID " +
            "WHERE r.COUTURIERE_ID = ? AND r.CREATED_AT >= ? AND r.CREATED_AT < ?",
            Long.class, couturiereId, Timestamp.valueOf(heureDebut), Timestamp.valueOf(heureFin));
        return cnt != null ? cnt : 0L;
    }
}
