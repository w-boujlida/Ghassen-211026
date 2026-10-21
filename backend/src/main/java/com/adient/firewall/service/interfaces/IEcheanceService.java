package com.adient.firewall.service.interfaces;

import java.util.List;
import java.util.Map;

public interface IEcheanceService {

    /** Résumé pour tous les projets détectés en base. */
    List<Map<String, Object>> getAllProjectsSummary();

    /**
     * Résumé pour un projet donné.
     * @param projetCode ex: "P6"
     * @param module     "firewall", "csl" ou null (= les deux)
     */
    Map<String, Object> getProjectSummary(String projetCode, String module);

    /** Records en retard pour un projet. */
    List<Map<String, Object>> getRetardRecords(String projetCode, String module);

    /** Records dont l'échéance expire dans les prochaines {@code heures} heures. */
    List<Map<String, Object>> getProcheRecords(String projetCode, String module, int heures);

    /**
     * Met à jour le statut REPRISE d'un barcode dans la table FIREWALL_{projet} ou CSL_{projet}.
     * @param barcode le code-barres
     * @param reprise "Returned" ou "Scrapped"
     * @param module  "FIREWALL" ou "CSL"
     * @param projet  ex: "CR3A"
     */
    void updateStatut(String barcode, String reprise, String module, String projet);
}
