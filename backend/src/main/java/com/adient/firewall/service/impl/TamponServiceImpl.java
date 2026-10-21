package com.adient.firewall.service.impl;

import com.adient.firewall.dto.TamponImportDto;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.ITamponService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class TamponServiceImpl implements ITamponService {

    private final QualityRepository repo;

    @Override
    public List<Map<String, Object>> getAllTampons() {
        return repo.getAllTampons().stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",           toLong(r.get("ID")));
            m.put("code",         str(r.get("CODE")));
            m.put("description",  str(r.get("DESCRIPTION")));
            m.put("mat",          r.get("MAT") != null ? str(r.get("MAT")) : null);
            m.put("employeeName", r.get("EMPLOYEE_NAME") != null ? str(r.get("EMPLOYEE_NAME")) : null);
            return m;
        }).toList();
    }

    @Override
    @Transactional
    public Map<String, Integer> importTampons(List<TamponImportDto> tampons) {
        if (tampons == null || tampons.isEmpty()) {
            throw new IllegalArgumentException("Aucune ligne à importer");
        }
        Set<String> seen = new HashSet<>();
        int inserted = 0;
        int skipped = 0;
        for (int i = 0; i < tampons.size(); i++) {
            int rowNumber = i + 2;
            TamponImportDto row = tampons.get(i);
            if (row == null || row.code() == null || row.code().isBlank()) {
                throw new IllegalArgumentException("Ligne " + rowNumber + " : code tampon obligatoire");
            }
            String code = row.code().trim();
            if (!seen.add(code.toUpperCase(Locale.ROOT)) || repo.findTamponByCode(code).isPresent()) {
                skipped++;
                continue;
            }
            String mat = row.mat() == null || row.mat().isBlank() ? null : row.mat().trim();
            if (mat != null && !repo.employeeExists(mat)) {
                throw new IllegalArgumentException("Ligne " + rowNumber + " : matricule employé introuvable " + mat);
            }
            Long id = repo.insertTampon(code, row.description() == null ? "" : row.description().trim());
            if (mat != null) {
                repo.assignTampon(id, mat);
            }
            inserted++;
        }
        return Map.of("inserted", inserted, "skipped", skipped);
    }

    @Override
    @Transactional
    public Map<String, Object> createTampon(String code, String description) {
        if (code == null || code.isBlank()) throw new IllegalArgumentException("Code tampon requis");
        Long id = repo.insertTampon(code.trim(), description != null ? description.trim() : "");
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("code", code.trim().toUpperCase());
        m.put("description", description);
        return m;
    }

    @Override
    @Transactional
    public void updateTampon(Long id, String code, String description) {
        if (code == null || code.isBlank()) throw new IllegalArgumentException("Code tampon requis");
        repo.updateTampon(id, code.trim(), description != null ? description.trim() : "");
    }

    @Override
    @Transactional
    public void deleteTampon(Long id) {
        if (repo.tamponHasEmployee(id))
            throw new IllegalStateException("Impossible de supprimer un tampon assigné à un employé");
        repo.deleteTampon(id);
    }

    @Override
    @Transactional
    public void assignTampon(Long id, String mat) {
        repo.assignTampon(id, mat);
    }

    @Override
    @Transactional
    public void unassignTampon(Long id) {
        repo.unassignTampon(id);
    }

    @Override
    public List<Map<String, Object>> getEmployeeTampons(String mat) {
        return repo.getEmployeeTampons(mat).stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",          toLong(r.get("ID")));
            m.put("code",        str(r.get("CODE")));
            m.put("description", str(r.get("DESCRIPTION")));
            return m;
        }).toList();
    }

    @Override
    public Map<String, Object> getSupervisorByTampon(String code) {
        return repo.findSupervisorByTampon(code)
                .map(r -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("tamponCode",    code);
                    m.put("employeeName",  str(r.get("NAME")));
                    m.put("superviseur",   str(r.get("SUPERVISOR")));
                    m.put("equipe",        str(r.get("EQUIPE")));
                    m.put("equipe2",       str(r.get("EQUIPE2")));
                    return m;
                })
                .orElseThrow(() -> new NoSuchElementException("Tampon introuvable: " + code));
    }

    @Override
    public List<Map<String, Object>> getAvailableTampons() {
        return repo.getAvailableTampons().stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",          toLong(r.get("ID")));
            m.put("code",        str(r.get("CODE")));
            m.put("description", str(r.get("DESCRIPTION")));
            return m;
        }).toList();
    }

    @Override
    public List<Map<String, Object>> getAvailableTamponsForEmployee(String mat) {
        return repo.getAvailableTamponsForEmployee(mat).stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",          toLong(r.get("ID")));
            m.put("code",        str(r.get("CODE")));
            m.put("description", str(r.get("DESCRIPTION")));
            m.put("mat",         r.get("MAT") != null ? str(r.get("MAT")) : null);
            return m;
        }).toList();
    }

    private String str(Object o) { return o != null ? o.toString() : ""; }
    private long toLong(Object o) { return o instanceof Number n ? n.longValue() : 0L; }
}
