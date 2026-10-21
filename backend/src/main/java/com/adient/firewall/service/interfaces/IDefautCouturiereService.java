package com.adient.firewall.service.interfaces;

import com.adient.firewall.dto.AlerteCouturiereDto;
import com.adient.firewall.dto.DefautCouturiereDetailDto;
import com.adient.firewall.dto.DefautCouturiereRapportDto;
import com.adient.firewall.dto.DefautCouturiereTableauDto;

import java.util.List;
import java.util.Map;

public interface IDefautCouturiereService {

    /** Tableau agrégé couturières x défauts par poste, filtré projet/ligne/shift/date. */
    DefautCouturiereTableauDto getTableau(String projet, String ligne, String shift, String date);

    /** Détail d'une couturière : ses défauts groupés par poste (avec heure de scan). */
    DefautCouturiereDetailDto getDetail(String matricule, String projet, String ligne, String shift, String date);

    /** Alertes persistées (consultation seule, pas de recalcul) — filtrées projet/ligne/date. */
    List<AlerteCouturiereDto> getAlertes(String projet, String ligne, String date);

    /**
     * Déclenché en temps réel au moment du scan (création/vérification/édition d'un enregistrement
     * Délibéra) : recompte les codes défauts de la couturière sur l'heure calendaire du scan et
     * crée/majore l'alerte si le seuil de 3 est atteint. Ne lève jamais d'exception métier — un
     * échec de calcul d'alerte ne doit jamais faire échouer le scan lui-même.
     *
     * @param record ligne DELIBERA_RECORDS (telle que retournée par DeliberaRepository.findRecordById) :
     *               doit contenir COUTURIERE_ID, COUTURIERE_MATRICULE, COUTURIERE_NOM, PROJET, LIGNE, CREATED_AT.
     */
    void checkAlerte(Map<String, Object> record);

    /** Synthèse par couturière, liste des alertes et KPI sur une période. */
    DefautCouturiereRapportDto getRapport(String projet, String ligne, String dateDebut, String dateFin);

    byte[] exportRapportExcel(String projet, String ligne, String dateDebut, String dateFin) throws Exception;

    byte[] exportRapportPdf(String projet, String ligne, String dateDebut, String dateFin) throws Exception;
}
