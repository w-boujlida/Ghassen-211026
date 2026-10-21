package com.adient.firewall.dto;

public record ProductionHoraireDTO(
        String projet,
        String ligne,
        int    heure,
        int    quantite,
        String date
) {}
