package com.adient.firewall.dto;

import java.util.Map;

/** Une ligne du tableau "Suivi des Défauts par Couturière" : totaux par poste + total + statut alerte. */
public record DefautCouturiereLigneDto(
        Long   couturiereId,
        String matricule,
        String nom,
        Map<String, Long> parPoste,
        long   total,
        boolean enAlerte
) {}
