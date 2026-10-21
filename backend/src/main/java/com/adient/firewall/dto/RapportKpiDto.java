package com.adient.firewall.dto;

/**
 * Indicateurs clés du rapport Suivi Qualité sur la période analysée.
 */
public record RapportKpiDto(
        long totalControle,                 // total de coiffes avec défaut scannées sur la période
        int nbCreneauxEvalues,              // nb de créneaux horaires avec une Limite définie (>0)
        int nbDepassements,                 // nb de créneaux où la Limite a été dépassée
        Double tauxDepassement,             // nbDepassements / nbCreneauxEvalues, null si aucun créneau évalué
        String ligneCritique,               // ligne cumulant le plus grand dépassement, null si aucun
        Double ligneCritiqueEcartCumule     // somme des écarts négatifs pour ligneCritique
) {}
