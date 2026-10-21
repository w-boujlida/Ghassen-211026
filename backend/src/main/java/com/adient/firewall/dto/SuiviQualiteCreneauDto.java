package com.adient.firewall.dto;

/**
 * Détail d'un créneau horaire (1h) pour une ligne du tableau Suivi Qualité : limite (target du
 * module Target) vs quantité de coiffes avec défaut sur ce créneau précis.
 */
public record SuiviQualiteCreneauDto(
        String creneau,          // "06:00-07:00"
        double limite,
        long   quantiteDefauts,
        String statut            // VERT | ORANGE | ROUGE
) {}
