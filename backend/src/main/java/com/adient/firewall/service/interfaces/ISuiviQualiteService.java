package com.adient.firewall.service.interfaces;

import com.adient.firewall.dto.RapportDto;
import com.adient.firewall.dto.StatsProjetResponseDto;
import com.adient.firewall.dto.StatsResponseDto;
import com.adient.firewall.dto.SuiviQualiteDashboardDto;

public interface ISuiviQualiteService {

    /**
     * Construit le dashboard Suivi Qualité pour un projet : limite (target) vs quantité de coiffes
     * avec défaut, par ligne et par créneau horaire, sur le shift/date demandés. Déclenche
     * également les notifications admin pour tout créneau horaire en dépassement (idempotent).
     *
     * @param projet obligatoire
     * @param ligne  optionnel — filtre sur une seule ligne de projet
     * @param shift  optionnel — MATIN | APRES_MIDI, défaut = shift courant (heure Africa/Tunis)
     * @param date   optionnel — défaut = aujourd'hui (Africa/Tunis)
     */
    SuiviQualiteDashboardDto getDashboard(String projet, String ligne, String shift, String date);

    /** Évolution de la quantité de coiffes avec défaut dans le temps, une série par projet (volume brut, sans Limite). */
    StatsResponseDto getStatsGlobal(String dateDebut, String dateFin, String granularite);

    /**
     * Évolution de la quantité de coiffes avec défaut par ligne, croisée avec la Limite applicable
     * (statut VERT/ORANGE/ROUGE par bucket) — grain HEURE ou SHIFT (occurrence de shift 8h), la
     * Limite n'ayant de sens qu'à l'intérieur d'un shift.
     */
    StatsProjetResponseDto getStatsProjet(String projet, String ligne, String dateDebut, String dateFin,
                                           String granularite, String shift);

    /** KPI + série d'évolution + liste des dépassements de Limite (alertes), triée par criticité. */
    RapportDto getRapport(String projet, String dateDebut, String dateFin, String shift);

    /** Export Excel (classeur multi-feuilles KPI/Séries/Alertes) du rapport. */
    byte[] exportRapportExcel(String projet, String dateDebut, String dateFin, String shift) throws Exception;

    /** Export PDF (KPI + graphiques JFreeChart + tableau des alertes) du rapport. */
    byte[] exportRapportPdf(String projet, String dateDebut, String dateFin, String shift) throws Exception;
}
