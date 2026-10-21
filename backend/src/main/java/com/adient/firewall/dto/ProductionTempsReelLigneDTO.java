package com.adient.firewall.dto;

public record ProductionTempsReelLigneDTO(
        String projet,
        String ligne,
        int heure,
        double target,
        long produitConforme,
        long firewall,
        long csl,
        long delibera
) {}
