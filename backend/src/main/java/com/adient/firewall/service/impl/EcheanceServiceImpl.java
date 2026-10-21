package com.adient.firewall.service.impl;

import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.IEcheanceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class EcheanceServiceImpl implements IEcheanceService {

    private final QualityRepository repo;

    @Override
    public List<Map<String, Object>> getAllProjectsSummary() {
        List<String> projects = repo.getProjectNames().stream()
                .map(String::toUpperCase)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
        List<Map<String, Object>> result = new ArrayList<>();
        for (String proj : projects) {
            try {
                result.add(getProjectSummary(proj, null));
            } catch (Exception e) {
                log.warn("EcheanceService: skipping project {} — {}", proj, e.getMessage());
            }
        }
        return result;
    }

    @Override
    public Map<String, Object> getProjectSummary(String projetCode, String module) {
        List<Map<String, Object>> rows = collectRows(projetCode, module);
        return buildSummary(projetCode, rows);
    }

    @Override
    public List<Map<String, Object>> getRetardRecords(String projetCode, String module) {
        return collectRows(projetCode, module).stream()
                .filter(r -> toDouble(r.get("HEURES_ECOULES")) > toDouble(r.get("DELAI_ECHEANCE_HEURES")))
                .sorted(Comparator.comparingDouble(r ->
                        -(toDouble(r.get("HEURES_ECOULES")) - toDouble(r.get("DELAI_ECHEANCE_HEURES")))))
                .collect(Collectors.toList());
    }

    @Override
    public List<Map<String, Object>> getProcheRecords(String projetCode, String module, int heures) {
        return collectRows(projetCode, module).stream()
                .filter(r -> {
                    double elapsed = toDouble(r.get("HEURES_ECOULES"));
                    double delai   = toDouble(r.get("DELAI_ECHEANCE_HEURES"));
                    return elapsed <= delai && (delai - elapsed) <= heures;
                })
                .sorted(Comparator.comparingDouble(r ->
                        toDouble(r.get("DELAI_ECHEANCE_HEURES")) - toDouble(r.get("HEURES_ECOULES"))))
                .collect(Collectors.toList());
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private List<Map<String, Object>> collectRows(String projetCode, String module) {
        String proj = QualityRepository.safe(projetCode);
        List<Map<String, Object>> all = new ArrayList<>();

        if (module == null || "firewall".equalsIgnoreCase(module)) {
            String tbl = "FIREWALL_" + proj;
            if (repo.tableExists(tbl)) {
                List<Map<String, Object>> rows = repo.fetchNotReturnedWithDelay(tbl);
                rows.forEach(r -> r.put("MODULE", "FIREWALL"));
                all.addAll(rows);
            }
        }
        if (module == null || "csl".equalsIgnoreCase(module)) {
            String tbl = "CSL_" + proj;
            if (repo.tableExists(tbl)) {
                List<Map<String, Object>> rows = repo.fetchNotReturnedWithDelay(tbl);
                rows.forEach(r -> r.put("MODULE", "CSL"));
                all.addAll(rows);
            }
        }
        return all;
    }

    private Map<String, Object> buildSummary(String projetCode, List<Map<String, Object>> rows) {
        Set<String> retardBarcodes = new HashSet<>();
        Set<String> procheBarcodes = new HashSet<>();
        Set<String> totalBarcodes  = new HashSet<>();

        for (Map<String, Object> row : rows) {
            String barcode = str(row.get("BARCODE"));
            if (barcode.isBlank()) continue;
            double elapsed = toDouble(row.get("HEURES_ECOULES"));
            double delai   = toDouble(row.get("DELAI_ECHEANCE_HEURES"));
            totalBarcodes.add(barcode);
            if (elapsed > delai) {
                retardBarcodes.add(barcode);
            } else if ((delai - elapsed) <= 48) {
                procheBarcodes.add(barcode);
            }
        }

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("projetCode", projetCode);
        res.put("nbRetard",   retardBarcodes.size());
        res.put("nbProches",  procheBarcodes.size());
        res.put("nbTotal",    totalBarcodes.size());
        return res;
    }

    @Override
    @org.springframework.transaction.annotation.Transactional
    public void updateStatut(String barcode, String reprise, String module, String projet) {
        if (reprise == null || (!reprise.equals("Returned") && !reprise.equals("Scrapped"))) {
            throw new IllegalArgumentException("Statut invalide: " + reprise + ". Valeurs acceptées: Returned, Scrapped");
        }
        String tableName = module.toUpperCase() + "_" + QualityRepository.safe(projet);
        if (!repo.tableExists(tableName)) {
            throw new IllegalArgumentException("Table introuvable: " + tableName);
        }
        int rows = repo.updateReprise(tableName, barcode, reprise);
        if (rows == 0) {
            throw new java.util.NoSuchElementException("Barcode introuvable: " + barcode);
        }
    }

    private double toDouble(Object o) { return o instanceof Number n ? n.doubleValue() : 0.0; }
    private String str(Object o)      { return o != null ? o.toString() : ""; }
}
