package com.adient.firewall.service.impl;

import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.IPosteService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class PosteServiceImpl implements IPosteService {

    private final QualityRepository repo;

    @Override
    public List<Map<String, Object>> getPostes() {
        return repo.getPostes();
    }

    @Override
    public void createPoste(String nom, String code) {
        repo.insertPoste(nom, code);
    }

    @Override
    public void updatePoste(Long id, String nom, String code) {
        repo.updatePoste(id, nom, code);
    }

    @Override
    public void deletePoste(Long id) {
        repo.deletePoste(id);
    }

    @Override
    public int bulkCreatePostes(java.util.List<String> noms) {
        int count = 0;
        for (String nom : noms) {
            if (nom != null && !nom.isBlank()) {
                repo.insertPoste(nom.trim(), null);
                count++;
            }
        }
        return count;
    }
}
