package com.adient.firewall.service.impl;

import com.adient.firewall.repository.ProductionRepository;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.IProductionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@Service
@RequiredArgsConstructor
public class ProductionServiceImpl implements IProductionService {

    private final ProductionRepository prodRepo;
    private final QualityRepository    qualRepo;

    @Override
    @Transactional
    public Map<String, Object> createQte(String projet, String module, String dateProd,
                                          long qteGlobale, String saisiePar) {
        validateModule(module);
        Long id = prodRepo.insert(projet, module, dateProd, qteGlobale, saisiePar);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", id);
        r.put("projet", projet.toUpperCase());
        r.put("module", module.toUpperCase());
        r.put("dateProd", dateProd);
        r.put("qteGlobale", qteGlobale);
        return r;
    }

    @Override
    public List<Map<String, Object>> getQte(String projet, String module, String dateFrom, String dateTo) {
        return prodRepo.find(projet, module, dateFrom, dateTo);
    }

    @Override
    @Transactional
    public Map<String, Object> updateQte(Long id, long qteGlobale) {
        int rows = prodRepo.update(id, qteGlobale);
        if (rows == 0) throw new NoSuchElementException("Production QTE introuvable: " + id);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", id);
        r.put("qteGlobale", qteGlobale);
        return r;
    }

    @Override
    @Transactional
    public void deleteQte(Long id) {
        int rows = prodRepo.delete(id);
        if (rows == 0) throw new NoSuchElementException("Production QTE introuvable: " + id);
    }

    @Override
    public Map<String, Object> getAnalyse(String projet, String module,
                                           String period, String dateFrom, String dateTo) {
        validateModule(module);
        String[] range = resolveDateRange(period, dateFrom, dateTo);
        String from = range[0];
        String to   = range[1];

        long qteGlobale = prodRepo.sumQteGlobale(projet, module, from, to);

        // Build quality table name: e.g. FIREWALL_P6, CSL_CR3A
        String tableName = module.toUpperCase() + "_" + projet.toUpperCase();
        long qtePiecesControlees = 0;
        long qteRetournees       = 0;
        long qteScrappees        = 0;

        if (qualRepo.tableExists(tableName)) {
            Map<String, Object> stats = qualRepo.fetchStatsByPeriod(tableName, from, to);
            qtePiecesControlees = toLong(stats.get("TOTAL"));
            qteRetournees       = toLong(stats.get("RETURNED"));
            qteScrappees        = toLong(stats.get("SCRAPPED"));
        }

        long qteNonControlees = Math.max(0L, qteGlobale - qtePiecesControlees);
        double tauxControle   = qteGlobale > 0 ? round1(qtePiecesControlees * 100.0 / qteGlobale) : 0.0;
        double tauxRetour     = qtePiecesControlees > 0 ? round1(qteRetournees * 100.0 / qtePiecesControlees) : 0.0;

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("qteGlobale",           qteGlobale);
        res.put("qtePiecesControlees",  qtePiecesControlees);
        res.put("tauxControle",         tauxControle);
        res.put("qteNonControlees",     qteNonControlees);
        res.put("qteRetournees",        qteRetournees);
        res.put("qteScrappees",         qteScrappees);
        res.put("tauxRetour",           tauxRetour);
        res.put("dateFrom",             from);
        res.put("dateTo",               to);
        return res;
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private void validateModule(String module) {
        if (module == null || (!module.equalsIgnoreCase("FIREWALL") && !module.equalsIgnoreCase("CSL"))) {
            throw new IllegalArgumentException("Module invalide: " + module + ". Valeurs acceptées: FIREWALL, CSL");
        }
    }

    private String[] resolveDateRange(String period, String dateFrom, String dateTo) {
        LocalDate today = LocalDate.now();
        DateTimeFormatter fmt = DateTimeFormatter.ISO_LOCAL_DATE;
        return switch (period == null ? "today" : period.toLowerCase()) {
            case "month"  -> new String[]{ today.withDayOfMonth(1).format(fmt), today.format(fmt) };
            case "custom" -> new String[]{ dateFrom != null ? dateFrom : today.format(fmt),
                                           dateTo   != null ? dateTo   : today.format(fmt) };
            default        -> new String[]{ today.format(fmt), today.format(fmt) }; // today
        };
    }

    private long toLong(Object o) { return o instanceof Number n ? n.longValue() : 0L; }
    private double round1(double v) { return Math.round(v * 10.0) / 10.0; }
}
