package com.adient.firewall.dto;

import java.util.List;

/**
 * DTO du dashboard "Suivi Qualité par Shift" — quantités OK/NOK de coiffes par ligne de production,
 * ventilées par créneau horaire, sur un shift complet.
 * <p>
 * Shift 1 : 06h00-16h00 (même jour). Shift 2 : 20h00-06h00 (traverse minuit, {@code dateFin} =
 * lendemain de {@code date}).
 */
public record SuiviQualiteShiftDto(
        String projet,
        int    shift,                // 1 ou 2
        String date,                  // jour de début du shift (YYYY-MM-DD)
        String dateFin,               // jour de fin du shift (= date pour shift 1, date+1 pour shift 2)
        List<String> creneaux,        // libellés des créneaux horaires du shift, dans l'ordre chronologique
        List<SuiviQualiteShiftLigneDto> lignes,
        long totalOKGlobal,
        long totalNOKGlobal,
        String generatedAt
) {}
