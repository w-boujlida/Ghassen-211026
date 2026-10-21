package com.adient.firewall.service.impl;

import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.ILookupService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
@RequiredArgsConstructor
public class LookupServiceImpl implements ILookupService {

    private final QualityRepository repo;

    @Override
    public Map<String, Object> lookupBarcode(String barcode) {
        List<String> projects = repo.getProjectNames();

        // 1. Try full barcode (LIKE match or exact FAS)
        Optional<Map<String, Object>> hit = repo.lookupBarcode(projects, barcode);

        // 2. Try substrings from start (length 8 to 15)
        if (hit.isEmpty()) {
            for (int len = 8; len <= Math.min(barcode.length(), 15); len++) {
                String sub = barcode.substring(0, len);
                hit = repo.lookupBarcode(projects, sub);
                if (hit.isPresent()) break;
            }
        }

        // 3. Try extracting only digits from barcode and matching prefixes
        if (hit.isEmpty()) {
            String digitsOnly = barcode.replaceAll("[^0-9]", "");
            for (int len : new int[]{12, 11, 10, 9, 8}) {
                if (digitsOnly.length() < len) continue;
                hit = repo.lookupBarcode(projects, digitsOnly.substring(0, len));
                if (hit.isPresent()) break;
            }
        }

        // 4. Legacy prefix extraction (12, 10, 14 chars) for backward compat
        if (hit.isEmpty()) {
            for (int len : new int[]{12, 10, 14}) {
                if (barcode.length() < len) continue;
                String pdef = barcode.substring(0, len);
                hit = repo.lookupBarcode(projects, pdef);
                if (hit.isPresent()) break;
            }
        }

        return hit.map(row -> {
            String pdef        = str(row.get("PDEF"));
            String refDetail   = str(row.get("REF_DETAIL"));
            String version     = str(row.get("VERSION"));
            String designation = str(row.get("DESIGNATION"));
            String tableName   = str(row.get("TABLE_NAME"));
            if (refDetail.isBlank()) refDetail = designation;
            if (version.isBlank())   version   = !designation.isBlank() ? designation : tableName;
            Map<String, Object> result = new HashMap<>();
            result.put("pdef",        pdef);
            result.put("version",     version);
            result.put("refDetail",   refDetail);
            result.put("tableName",   tableName);
            result.put("designation", designation);
            return result;
        }).orElseThrow(() -> new NoSuchElementException("No matching product for barcode: " + barcode));
    }

    @Override
    public Map<String, Object> lookupPoly(String tampon) {
        Optional<Map<String, Object>> hit = repo.findSupervisorByTampon(tampon);
        return hit.map(r -> {
            Map<String, Object> m = new HashMap<>();
            m.put("equipe",      str(r.get("EQUIPE")));
            m.put("equipe2",     str(r.get("EQUIPE2")));
            m.put("superviseur", str(r.get("SUPERVISOR")));
            return m;
        }).orElseThrow(() -> new NoSuchElementException("No poly record for tampon: " + tampon));
    }

    @Override
    public Map<String, Object> lookupDef(String cod) {
        return repo.lookupDef(cod)
                .map(r -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("descDef",  str(r.get("DESCRIPTION_DEFAUT")));
                    m.put("demirite", r.get("DEMERITE") instanceof Number n ? n.intValue() : 0);
                    return m;
                })
                .orElseThrow(() -> new NoSuchElementException("No defect code: " + cod));
    }

    @Override
    public Map<String, Object> getPolyTampons() {
        return Map.of("tampons", repo.getPolyTampons());
    }

    @Override
    public Map<String, Object> getTamponCodes() {
        return Map.of("codes", repo.getTamponCodes());
    }

    @Override
    public Map<String, Object> getDefCodes() {
        return Map.of("codes", repo.getDefCodes());
    }

    @Override
    public Map<String, Object> getDefCodesList() {
        List<Map<String, Object>> result = repo.getDefCodesList().stream().map(r -> {
            Map<String, Object> m = new HashMap<>();
            m.put("cod",                  str(r.get("COD")));
            m.put("description",          str(r.get("DESCRIPTION_DEFAUT")));
            m.put("demerite",             r.get("DEMERITE") instanceof Number n ? n.intValue() : 0);
            m.put("delaiEcheanceHeures",  r.get("DELAI_ECHEANCE_HEURES") instanceof Number n ? n.intValue() : null);
            return m;
        }).toList();
        return Map.of("defCodes", result);
    }

    @Override
    public Map<String, Object> getSupervisors() {
        return Map.of("supervisors", repo.getSupervisors());
    }

    @Override
    public Map<String, Object> getSupervisorsList() {
        List<Map<String, Object>> result = repo.getSupervisorsList().stream().map(r -> {
            Map<String, Object> m = new HashMap<>();
            m.put("name",   str(r.get("NAME")));
            m.put("source", str(r.get("SOURCE")));
            return m;
        }).toList();
        return Map.of("supervisors", result);
    }

    @Override
    @Transactional
    public void addSupervisor(String name) {
        repo.insertSupervisor(name != null ? name.toUpperCase().trim() : "");
    }

    @Override
    @Transactional
    public Map<String, Integer> importSupervisors(List<String> names) {
        if (names == null || names.isEmpty()) {
            throw new IllegalArgumentException("Aucune ligne à importer");
        }
        Set<String> existing = new HashSet<>();
        for (Map<String, Object> row : repo.getSupervisorsList()) {
            Object name = row.get("NAME");
            if (name != null) existing.add(name.toString().trim().toUpperCase(Locale.ROOT));
        }
        Set<String> seen = new HashSet<>();
        int inserted = 0;
        int skipped = 0;
        for (int i = 0; i < names.size(); i++) {
            String name = names.get(i);
            if (name == null || name.isBlank()) {
                throw new IllegalArgumentException("Ligne " + (i + 2) + " : nom de superviseur obligatoire");
            }
            String normalized = name.trim().toUpperCase(Locale.ROOT);
            if (!seen.add(normalized) || existing.contains(normalized)) {
                skipped++;
                continue;
            }
            repo.insertSupervisor(normalized);
            existing.add(normalized);
            inserted++;
        }
        return Map.of("inserted", inserted, "skipped", skipped);
    }

    @Override
    @Transactional
    public void deleteSupervisor(String name) {
        repo.deleteSupervisor(name);
    }

    @Override
    @Transactional
    public void addDefCode(String cod, String description, int demerite, Integer delaiEcheanceHeures) {
        repo.insertDefCode(cod != null ? cod.toUpperCase().trim() : "", description, demerite, delaiEcheanceHeures);
    }

    @Override
    @Transactional
    public void updateDefCode(String cod, String description, int demerite, Integer delaiEcheanceHeures) {
        repo.updateDefCode(cod != null ? cod.toUpperCase().trim() : "", description, demerite, delaiEcheanceHeures);
    }

    @Override
    @Transactional
    public Map<String, Object> importDefCodes(List<Map<String, Object>> codes) {
        int inserted = 0;
        int updated = 0;
        int errors = 0;
        List<String> errorRows = new ArrayList<>();

        if (codes == null) {
            return Map.of("inserted", 0, "updated", 0, "errors", 0);
        }

        for (int index = 0; index < codes.size(); index++) {
            Map<String, Object> row = codes.get(index);
            String cod = row.get("cod") == null ? "" : row.get("cod").toString().trim().toUpperCase();
            if (cod.isBlank()) {
                errors++;
                errorRows.add("Ligne " + (index + 2) + " : code manquant");
                continue;
            }

            try {
                String description = row.get("description") == null ? "" : row.get("description").toString().trim();
                int demerite = parseInteger(row.get("demerite"), 0);
                Integer delai = row.get("delaiEcheanceHeures") == null ||
                        row.get("delaiEcheanceHeures").toString().isBlank()
                        ? null : parseInteger(row.get("delaiEcheanceHeures"), -1);
                if (demerite < 0 || (delai != null && delai < 1)) {
                    throw new IllegalArgumentException("Démérite invalide ou délai inférieur à 1 heure");
                }

                if (repo.defCodeExists(cod)) {
                    repo.updateDefCode(cod, description, demerite, delai);
                    updated++;
                } else {
                    repo.insertDefCode(cod, description, demerite, delai);
                    inserted++;
                }
            } catch (Exception e) {
                errors++;
                errorRows.add("Ligne " + (index + 2) + " (" + cod + ") : " + e.getMessage());
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("inserted", inserted);
        result.put("updated", updated);
        result.put("errors", errors);
        result.put("errorRows", errorRows);
        return result;
    }

    @Override
    @Transactional
    public void deleteDefCode(String cod) {
        repo.deleteDefCode(cod != null ? cod.toUpperCase().trim() : cod);
    }

    private int parseInteger(Object value, int defaultValue) {
        if (value == null || value.toString().isBlank()) return defaultValue;
        if (value instanceof Number number) return number.intValue();
        return Integer.parseInt(value.toString().trim());
    }

    private String str(Object o) { return o != null ? o.toString() : ""; }
}