package com.adient.firewall.service.interfaces;

import com.adient.firewall.dto.SuiviQualiteShiftDto;

public interface ISuiviQualiteShiftService {

    /**
     * Construit le dashboard "Suivi Qualité par Shift" pour un projet : quantités OK/NOK de coiffes
     * par ligne de production, ventilées par créneau horaire, sur un shift complet.
     *
     * @param projet obligatoire
     * @param shift  1 (06h-16h) ou 2 (20h-06h, traverse minuit) — défaut 1
     * @param date   optionnel — jour de début du shift, défaut = aujourd'hui (Africa/Tunis)
     * @param ligne  optionnel — filtre sur une seule ligne de production
     */
    SuiviQualiteShiftDto getShiftReport(String projet, Integer shift, String date, String ligne);
}
