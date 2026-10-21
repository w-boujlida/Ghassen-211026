package com.adient.firewall.dto;

import java.util.List;

/**
 * Série temporelle d'une ligne de projet, croisée avec sa Limite : quantité de coiffes avec défaut,
 * Limite applicable et statut VERT/ORANGE/ROUGE, un triplet par bucket (aligné sur
 * StatsProjetResponseDto.buckets()).
 */
public record StatsProjetSerieDto(
        String cle,             // nom de la ligne de projet
        List<Long> valeurs,     // quantité de coiffes avec défaut par bucket
        List<Double> limites,   // Limite applicable par bucket (0 si non définie)
        List<String> statuts    // VERT | ORANGE | ROUGE par bucket
) {}
