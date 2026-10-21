package com.adient.firewall.dto;

/**
 * Un dépassement de Limite détecté sur un créneau horaire précis, pour le rapport Suivi Qualité.
 */
public record AlerteDto(
        String projet,
        String ligne,
        String jour,       // "yyyy-MM-dd"
        String creneau,    // "06:00-07:00"
        long   quantite,
        double limite,
        double ecart,      // limite - quantite (négatif = dépassement)
        String statut      // VERT | ORANGE | ROUGE
) {}
