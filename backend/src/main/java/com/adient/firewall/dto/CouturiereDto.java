package com.adient.firewall.dto;

public record CouturiereDto(
        Long   id,
        String matricule,
        String nom,
        String projet,
        String equipe,
        Integer actif
) {}
