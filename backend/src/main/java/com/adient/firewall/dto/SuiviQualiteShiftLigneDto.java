package com.adient.firewall.dto;

import java.util.List;

/**
 * Une ligne du tableau "Suivi Qualité par Shift" : quantités OK/NOK par créneau horaire pour une
 * ligne de production donnée, sur le shift/date sélectionné.
 */
public record SuiviQualiteShiftLigneDto(
        String ligne,
        List<SuiviQualiteShiftCreneauDto> creneaux,
        long totalOK,
        long totalNOK
) {}
