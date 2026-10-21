package com.adient.firewall.dto;

import java.util.List;

/**
 * Une série temporelle du module Statistiques : quantité de coiffes avec défaut par bucket
 * (heure/jour/semaine), pour un projet (vue globale) ou une ligne (vue projet).
 */
public record StatsSerieDto(
        String cle,           // nom du projet (vue globale) ou de la ligne (vue projet)
        List<Long> valeurs    // une valeur par bucket, alignée sur StatsResponseDto.buckets()
) {}
