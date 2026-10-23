package com.adient.firewall.service.interfaces;

import java.util.Map;
import java.util.List;

public interface ILookupService {

    Map<String, Object> lookupBarcode(String barcode);
    Map<String, Object> lookupBarcode(String barcode, String project);

    Map<String, Object> lookupPoly(String tampon);

    Map<String, Object> lookupDef(String cod);

    Map<String, Object> getPolyTampons();

    Map<String, Object> getTamponCodes();

    Map<String, Object> getDefCodes();

    Map<String, Object> getDefCodesList();

    Map<String, Object> getSupervisors();

    Map<String, Object> getSupervisorsList();

    void addSupervisor(String name);

    Map<String, Integer> importSupervisors(List<String> names);

    void deleteSupervisor(String name);

    void addDefCode(String cod, String description, int demerite, Integer delaiEcheanceHeures);

    void updateDefCode(String cod, String description, int demerite, Integer delaiEcheanceHeures);

    Map<String, Object> importDefCodes(List<Map<String, Object>> codes);

    void deleteDefCode(String cod);
}
