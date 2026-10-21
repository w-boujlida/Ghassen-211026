package com.adient.firewall.dto;

import java.util.List;

/** Rapport consolidé Suivi des Défauts par Couturière sur une période. */
public record DefautCouturiereRapportDto(
        String projet,
        String ligne,
        String dateDebut,
        String dateFin,
        DefautCouturiereKpiDto kpis,
        List<CouturiereSyntheseDto> synthese,
        List<AlerteCouturiereDto> alertes,
        String generatedAt
) {}
