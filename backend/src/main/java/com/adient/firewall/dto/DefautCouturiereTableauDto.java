package com.adient.firewall.dto;

import java.util.List;

/** Tableau agrégé couturières x défauts par poste, pour un projet/ligne/shift/date donné. */
public record DefautCouturiereTableauDto(
        String projet,
        String ligne,
        String shift,
        String date,
        List<String> postes,
        List<DefautCouturiereLigneDto> lignes
) {}
