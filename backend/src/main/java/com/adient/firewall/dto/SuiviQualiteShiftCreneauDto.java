package com.adient.firewall.dto;

/**
 * Comptage OK/NOK d'un créneau horaire (une heure) du dashboard "Suivi Qualité par Shift".
 */
public record SuiviQualiteShiftCreneauDto(
        String creneau,      // libellé, ex. "06:00-07:00"
        int    heure,        // heure de la journée (0-23)
        long   quantiteOK,
        long   quantiteNOK
) {}
