package com.adient.firewall.dto;

import java.util.List;

/**
 * Une ligne du tableau Suivi Qualité : limite (target) vs quantité de coiffes avec défaut, pour
 * une ligne de projet donnée sur le shift/date sélectionné, avec le détail par créneau horaire.
 */
public record SuiviQualiteLigneDto(
        String ligne,
        double limite,               // total de la limite (target) sur le shift
        long   quantiteDefauts,      // total des défauts sur le shift
        double ecart,                // limite - quantiteDefauts (négatif = dépassement)
        Double pourcentage,          // quantiteDefauts / limite * 100, null si limite = 0
        String statut,               // VERT | ORANGE | ROUGE, calculé sur les totaux du shift
        List<SuiviQualiteCreneauDto> creneaux
) {}
