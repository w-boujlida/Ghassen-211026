package com.adient.firewall.dto;

import java.util.List;

/**
 * Rapport consolidé Suivi Qualité sur une période : KPI, série d'évolution par ligne et
 * liste des dépassements de Limite (alertes), triée par criticité (écart le plus négatif en premier).
 */
public record RapportDto(
        String projet,
        String dateDebut,
        String dateFin,
        String shift,          // null = tous les shifts
        RapportKpiDto kpis,
        StatsProjetResponseDto series,
        List<AlerteDto> alertes,
        String generatedAt
) {}
