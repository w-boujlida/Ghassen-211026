package com.adient.firewall.service.interfaces;

import java.util.List;
import java.util.Map;

public interface IPosteService {
    List<Map<String, Object>> getPostes();
    void createPoste(String nom, String code);
    void updatePoste(Long id, String nom, String code);
    void deletePoste(Long id);
    int bulkCreatePostes(java.util.List<String> noms);
}
