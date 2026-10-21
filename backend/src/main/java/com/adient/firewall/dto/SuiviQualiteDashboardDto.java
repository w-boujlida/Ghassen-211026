package com.adient.firewall.dto;

import java.util.List;

/**
 * DTO du dashboard "Suivi Qualité des Coiffes" — croise la Limite (target du module Target) et la
 * quantité de coiffes scannées avec défaut (comptage horaire du module Délibéra) par ligne de
 * projet, avec le détail par créneau horaire du shift.
 */
public record SuiviQualiteDashboardDto(
        String projet,
        String shift,
        String date,
        String dateFin,               // jour de fin du shift (= date, sauf shift traversant minuit ex. SHIFT_2 : date+1)
        double seuilOrange,          // ratio défauts/limite à partir duquel le statut passe à ORANGE
        double seuilRouge,           // ratio défauts/limite à partir duquel le statut passe à ROUGE
        List<String> creneauxShift,  // libellés des créneaux horaires du shift, ex. ["06:00-07:00", ...]
        List<SuiviQualiteLigneDto> lignes,
        String generatedAt
) {}
