package com.adient.firewall.dto;

import java.util.List;

/**
 * Réponse de GET /suivi-qualite/stats/projet : évolution de la quantité de coiffes avec défaut par
 * ligne, croisée avec la Limite applicable — grain HEURE (créneau horaire) ou SHIFT (occurrence de
 * shift de 8h, MATIN ou APRES_MIDI), jamais JOUR calendaire (16h, 2 shifts) ni SEMAINE : la Limite
 * n'a de sens qu'à l'intérieur d'un shift.
 */
public record StatsProjetResponseDto(
        String granulariteEffective,  // HEURE | SHIFT
        List<String> buckets,
        List<StatsProjetSerieDto> series
) {}
