package com.adient.firewall.repository;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Persistance des alertes "3 codes défauts / heure calendaire" par couturière — une ligne par
 * (couturiereId, heureDebut), idempotente via un index unique (mêmes principes que
 * NotificationRepository.DEDUPE_KEY).
 */
@Repository
@RequiredArgsConstructor
@Slf4j
public class AlerteCouturiereRepository {

    private final JdbcTemplate db;

    @PostConstruct
    public void init() {
        try {
            db.queryForObject("SELECT COUNT(*) FROM SYSTEM.DELIBERA_ALERTES_COUTURIERE WHERE ROWNUM=1", Integer.class);
        } catch (Exception e) {
            try {
                db.execute(
                    "CREATE TABLE SYSTEM.DELIBERA_ALERTES_COUTURIERE (" +
                    "  ID            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY," +
                    "  COUTURIERE_ID NUMBER NOT NULL," +
                    "  MATRICULE     VARCHAR2(50)," +
                    "  NOM           VARCHAR2(150)," +
                    "  PROJET        VARCHAR2(50)," +
                    "  LIGNE         VARCHAR2(26 BYTE)," +
                    "  SHIFT         VARCHAR2(20)," +
                    "  HEURE_DEBUT   TIMESTAMP NOT NULL," +
                    "  NB_DEFAUTS    NUMBER DEFAULT 0," +
                    "  CREATED_AT    TIMESTAMP DEFAULT CURRENT_TIMESTAMP," +
                    "  UPDATED_AT    TIMESTAMP DEFAULT CURRENT_TIMESTAMP" +
                    ")"
                );
                log.info("Created SYSTEM.DELIBERA_ALERTES_COUTURIERE table");
            } catch (Exception ex) {
                log.error("Could not create DELIBERA_ALERTES_COUTURIERE table: {}", ex.getMessage());
            }
        }
        // Idempotence stricte : une seule alerte par couturière + heure calendaire.
        try {
            db.execute("CREATE UNIQUE INDEX SYSTEM.UX_ALERTE_COUTURIERE_HEURE ON SYSTEM.DELIBERA_ALERTES_COUTURIERE (COUTURIERE_ID, HEURE_DEBUT)");
        } catch (Exception ignored) {}
    }

    /**
     * Crée l'alerte si elle n'existe pas encore pour (couturiereId, heureDebut), sinon met à jour
     * NB_DEFAUTS (4e, 5e code de la même heure : pas de nouvelle alerte, compteur mis à jour).
     * Retourne true seulement si une NOUVELLE alerte a été créée (pour ne notifier qu'une fois).
     */
    public boolean upsertAlerte(long couturiereId, String matricule, String nom, String projet, String ligne,
                                String shift, LocalDateTime heureDebut, long nbDefauts) {
        Timestamp heureDebutTs = Timestamp.valueOf(heureDebut);
        int updated = db.update(
            "UPDATE SYSTEM.DELIBERA_ALERTES_COUTURIERE SET NB_DEFAUTS=?, MATRICULE=?, NOM=?, PROJET=?, LIGNE=?, SHIFT=?, " +
            "UPDATED_AT=CURRENT_TIMESTAMP WHERE COUTURIERE_ID=? AND HEURE_DEBUT=?",
            nbDefauts, matricule, nom, projet, ligne, shift, couturiereId, heureDebutTs);
        if (updated > 0) return false;

        try {
            db.update(
                "INSERT INTO SYSTEM.DELIBERA_ALERTES_COUTURIERE " +
                "(COUTURIERE_ID,MATRICULE,NOM,PROJET,LIGNE,SHIFT,HEURE_DEBUT,NB_DEFAUTS) VALUES (?,?,?,?,?,?,?,?)",
                couturiereId, matricule, nom, projet, ligne, shift, heureDebutTs, nbDefauts);
            return true;
        } catch (DuplicateKeyException e) {
            // Appels concurrents : l'un a créé la ligne entre notre UPDATE (0 ligne) et notre INSERT.
            db.update(
                "UPDATE SYSTEM.DELIBERA_ALERTES_COUTURIERE SET NB_DEFAUTS=?, UPDATED_AT=CURRENT_TIMESTAMP " +
                "WHERE COUTURIERE_ID=? AND HEURE_DEBUT=?",
                nbDefauts, couturiereId, heureDebutTs);
            return false;
        }
    }

    public List<Map<String, Object>> listAlertes(String projet, String ligne, LocalDateTime debut, LocalDateTime fin) {
        StringBuilder sql = new StringBuilder(
            "SELECT ID, COUTURIERE_ID, MATRICULE, NOM, PROJET, LIGNE, SHIFT, " +
            "TO_CHAR(HEURE_DEBUT,'YYYY-MM-DD HH24:MI:SS') AS HEURE_DEBUT, NB_DEFAUTS, " +
            "TO_CHAR(CREATED_AT,'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT, " +
            "TO_CHAR(UPDATED_AT,'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT " +
            "FROM SYSTEM.DELIBERA_ALERTES_COUTURIERE WHERE 1=1 ");
        List<Object> params = new ArrayList<>();
        if (projet != null && !projet.isBlank()) { sql.append("AND UPPER(PROJET)=UPPER(?) "); params.add(projet); }
        if (ligne  != null && !ligne.isBlank())  { sql.append("AND UPPER(LIGNE)=UPPER(?) ");  params.add(ligne); }
        if (debut  != null) { sql.append("AND HEURE_DEBUT >= ? "); params.add(Timestamp.valueOf(debut)); }
        if (fin    != null) { sql.append("AND HEURE_DEBUT < ? ");  params.add(Timestamp.valueOf(fin)); }
        sql.append("ORDER BY NB_DEFAUTS DESC, HEURE_DEBUT DESC");
        return db.queryForList(sql.toString(), params.toArray());
    }
}
