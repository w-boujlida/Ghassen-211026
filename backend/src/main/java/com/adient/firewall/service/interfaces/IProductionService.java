package com.adient.firewall.service.interfaces;

import java.util.List;
import java.util.Map;

public interface IProductionService {

    Map<String, Object> createQte(String projet, String module, String dateProd, long qteGlobale, String saisiePar);

    List<Map<String, Object>> getQte(String projet, String module, String dateFrom, String dateTo);

    Map<String, Object> updateQte(Long id, long qteGlobale);

    void deleteQte(Long id);

    Map<String, Object> getAnalyse(String projet, String module, String period, String dateFrom, String dateTo);
}
