package com.adient.firewall.dto;

/**
 * Alerte "3 défauts / heure calendaire" pour une couturière donnée — persistée, idempotente sur
 * (couturiereId, heureDebut).
 */
public record AlerteCouturiereDto(
        Long   id,
        Long   couturiereId,
        String matricule,
        String nom,
        String projet,
        String ligne,
        String shift,
        String heureDebut, // "yyyy-MM-dd HH:mm:ss", début de l'heure calendaire concernée
        long   nbDefauts,
        String createdAt,
        String updatedAt
) {}
