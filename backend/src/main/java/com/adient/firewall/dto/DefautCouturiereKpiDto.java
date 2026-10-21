package com.adient.firewall.dto;

/** Indicateurs clés du rapport Suivi des Défauts par Couturière sur la période analysée. */
public record DefautCouturiereKpiDto(
        long   totalDefauts,
        String couturierePlusDefauts,     // nom, null si aucune donnée
        long   couturierePlusDefautsTotal,
        String posteProblematique,        // nom, null si aucune donnée
        long   posteProblematiqueTotal,
        int    nbAlertes
) {}
