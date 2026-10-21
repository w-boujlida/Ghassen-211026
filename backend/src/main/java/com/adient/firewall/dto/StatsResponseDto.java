package com.adient.firewall.dto;

import java.util.List;

/**
 * Réponse des endpoints d'agrégation historique (stats/global, stats/projet) : une série
 * temporelle par clé (projet ou ligne), alignée sur une liste commune de buckets.
 */
public record StatsResponseDto(
        String granulariteEffective,  // HEURE | JOUR | SEMAINE — peut différer de la granularité demandée (auto/bornée)
        List<String> buckets,         // libellés de créneaux temporels, ordre chronologique
        List<StatsSerieDto> series
) {}
