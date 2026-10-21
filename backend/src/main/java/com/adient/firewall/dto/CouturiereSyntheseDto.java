package com.adient.firewall.dto;

import java.util.Map;

/** Synthèse d'une couturière sur la période du rapport : total + répartition par poste. */
public record CouturiereSyntheseDto(
        Long   couturiereId,
        String matricule,
        String nom,
        long   total,
        Map<String, Long> parPoste
) {}
