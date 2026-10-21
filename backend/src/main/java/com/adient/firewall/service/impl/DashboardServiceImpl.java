package com.adient.firewall.service.impl;

import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.IDashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
@RequiredArgsConstructor
public class DashboardServiceImpl implements IDashboardService {

    private final QualityRepository repo;

    @Override
    public Map<String, Object> getDashboard() {
        String today     = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        String thisMonth = LocalDate.now().withDayOfMonth(1).format(DateTimeFormatter.ISO_LOCAL_DATE);

        List<String> fwTables  = repo.getFirewallTables();
        List<String> cslTables = repo.getCslTables();
        List<String> allTables = new ArrayList<>();
        allTables.addAll(fwTables);
        allTables.addAll(cslTables);

        if (allTables.isEmpty()) {
            return Map.of("kpi", Map.of(), "byProject", Map.of(), "reprise", Map.of(),
                    "defects", Map.of(), "trend", Map.of(), "byRef", Map.of(), "fwVsCsl", Map.of());
        }

        // 1. KPI (today)
        Map<String, Long> kpi = new LinkedHashMap<>();
        kpi.put("fw_today", 0L); kpi.put("csl_today", 0L);
        kpi.put("returned", 0L); kpi.put("not_returned", 0L); kpi.put("scrap", 0L);

        for (String t : fwTables) {
            Map<String, Object> r = repo.fetchKpiRow(t, today);
            kpi.merge("fw_today",     toLong(r.get("TOTAL")),  Long::sum);
            kpi.merge("returned",     toLong(r.get("RET")),    Long::sum);
            kpi.merge("not_returned", toLong(r.get("NOTRET")), Long::sum);
            kpi.merge("scrap",        toLong(r.get("SCR")),    Long::sum);
        }
        for (String t : cslTables) {
            Map<String, Object> r = repo.fetchKpiRow(t, today);
            kpi.merge("csl_today",    toLong(r.get("TOTAL")),  Long::sum);
            kpi.merge("returned",     toLong(r.get("RET")),    Long::sum);
            kpi.merge("not_returned", toLong(r.get("NOTRET")), Long::sum);
            kpi.merge("scrap",        toLong(r.get("SCR")),    Long::sum);
        }

        // 2. By project (this month)
        Map<String, Map<String, Integer>> byProject = new LinkedHashMap<>();
        for (String t : fwTables) {
            String proj = t.substring("FIREWALL_".length());
            byProject.computeIfAbsent(proj, k -> new LinkedHashMap<>(Map.of("fw", 0, "csl", 0)));
            byProject.get(proj).merge("fw", repo.fetchMonthCount(t, thisMonth), Integer::sum);
        }
        for (String t : cslTables) {
            String proj = t.substring("CSL_".length());
            byProject.computeIfAbsent(proj, k -> new LinkedHashMap<>(Map.of("fw", 0, "csl", 0)));
            byProject.get(proj).merge("csl", repo.fetchMonthCount(t, thisMonth), Integer::sum);
        }

        // 3. Reprise distribution (this month)
        Map<String, Long> reprise = new LinkedHashMap<>(Map.of("Returned", 0L, "Not Returned", 0L, "Scrap", 0L));
        for (String t : allTables)
            for (Map<String, Object> r : repo.fetchReprise(t, thisMonth))
                reprise.merge(str(r.get("STATUS")), toLong(r.get("CNT")), Long::sum);

        // 4. Top 8 defects (this month)
        Map<String, Long> defectsRaw = new LinkedHashMap<>();
        for (String t : allTables)
            for (Map<String, Object> r : repo.fetchDefects(t, thisMonth))
                defectsRaw.merge(str(r.get("CODDEF")), toLong(r.get("CNT")), Long::sum);
        Map<String, Long> defects = defectsRaw.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed()).limit(8)
                .collect(LinkedHashMap::new, (m, e) -> m.put(e.getKey(), e.getValue()), Map::putAll);

        // 5. 7-day trend
        Map<String, Map<String, Long>> trend = new LinkedHashMap<>();
        for (int i = 6; i >= 0; i--) {
            String day = LocalDate.now().minusDays(i).format(DateTimeFormatter.ISO_LOCAL_DATE);
            trend.put(day, new LinkedHashMap<>(Map.of("fw", 0L, "csl", 0L)));
        }
        for (String t : fwTables)
            for (Map<String, Object> r : repo.fetchTrend(t, true))
                trend.computeIfPresent(str(r.get("DAY")), (k, v) -> { v.merge("fw",  toLong(r.get("CNT")), Long::sum); return v; });
        for (String t : cslTables)
            for (Map<String, Object> r : repo.fetchTrend(t, false))
                trend.computeIfPresent(str(r.get("DAY")), (k, v) -> { v.merge("csl", toLong(r.get("CNT")), Long::sum); return v; });

        // 6. By REF (this month)
        Map<String, Long> byRefRaw = new LinkedHashMap<>();
        for (String t : allTables)
            for (Map<String, Object> r : repo.fetchByRef(t, thisMonth))
                byRefRaw.merge(str(r.get("REF")), toLong(r.get("CNT")), Long::sum);
        Map<String, Long> byRef = byRefRaw.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .collect(LinkedHashMap::new, (m, e) -> m.put(e.getKey(), e.getValue()), Map::putAll);

        // 7. FW vs CSL total (this month)
        long fwTotal  = fwTables.stream().mapToLong(t  -> repo.fetchMonthCount(t,  thisMonth)).sum();
        long cslTotal = cslTables.stream().mapToLong(t -> repo.fetchMonthCount(t, thisMonth)).sum();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("kpi",       kpi);
        result.put("byProject", byProject);
        result.put("reprise",   reprise);
        result.put("defects",   defects);
        result.put("trend",     trend);
        result.put("byRef",     byRef);
        result.put("fwVsCsl",   Map.of("fw", fwTotal, "csl", cslTotal));
        return result;
    }

    @Override
    public Map<String, Object> getDashboardFiltered(String date1, String date2,
                                                     String projet, String coddef, String superviseur) {
        if (date1 == null || !date1.matches("\\d{4}-\\d{2}-\\d{2}")) date1 = LocalDate.now().toString();
        if (date2 == null || !date2.matches("\\d{4}-\\d{2}-\\d{2}")) date2 = LocalDate.now().toString();
        if (date1.compareTo(date2) > 0) { String tmp = date1; date1 = date2; date2 = tmp; }

        List<String> fwTables, cslTables;
        if (projet != null && !projet.isBlank()) {
            String pn = QualityRepository.safe(projet);
            fwTables  = repo.tableExists("FIREWALL_" + pn) ? List.of("FIREWALL_" + pn) : List.of();
            cslTables = repo.tableExists("CSL_" + pn)      ? List.of("CSL_" + pn)      : List.of();
        } else {
            fwTables  = repo.getFirewallTables();
            cslTables = repo.getCslTables();
        }
        List<String> allTables = new ArrayList<>();
        allTables.addAll(fwTables); allTables.addAll(cslTables);

        String filterBase = "TO_CHAR(DATEFW,'YYYY-MM-DD') BETWEEN ? AND ?";
        List<Object> filterParams = new ArrayList<>(List.of(date1, date2));
        if (coddef != null && !coddef.isBlank())         { filterBase += " AND CODDEF=?";      filterParams.add(coddef); }
        if (superviseur != null && !superviseur.isBlank()) { filterBase += " AND SUPERVISEUR=?"; filterParams.add(superviseur); }

        JdbcTemplate db = repo.getJdbcTemplate();
        Object[] fp = filterParams.toArray();

        long fwCount = 0, cslCount = 0;
        for (String t : fwTables)
            fwCount  += orZero(db.queryForObject("SELECT COUNT(DISTINCT BARCODE) FROM SYSTEM." + t + " WHERE " + filterBase, Long.class, fp));
        for (String t : cslTables)
            cslCount += orZero(db.queryForObject("SELECT COUNT(DISTINCT BARCODE) FROM SYSTEM." + t + " WHERE " + filterBase, Long.class, fp));

        Map<String, Long> reprise = new LinkedHashMap<>(Map.of("Returned", 0L, "Not Returned", 0L, "Scrap", 0L));
        for (String t : allTables)
            for (Map<String, Object> r : db.queryForList("SELECT NVL(REPRISE,'Not Returned') AS STATUS,COUNT(DISTINCT BARCODE) AS CNT FROM SYSTEM." + t + " WHERE " + filterBase + " GROUP BY NVL(REPRISE,'Not Returned')", fp))
                reprise.merge(str(r.get("STATUS")), toLong(r.get("CNT")), Long::sum);

        Map<String, Long> byDefCode = new LinkedHashMap<>();
        for (String t : allTables)
            for (Map<String, Object> r : db.queryForList("SELECT CODDEF,COUNT(*) AS CNT FROM SYSTEM." + t + " WHERE " + filterBase + " AND CODDEF IS NOT NULL GROUP BY CODDEF", fp))
                byDefCode.merge(str(r.get("CODDEF")), toLong(r.get("CNT")), Long::sum);
        byDefCode = byDefCode.entrySet().stream().sorted(Map.Entry.<String, Long>comparingByValue().reversed()).limit(10)
                .collect(LinkedHashMap::new, (m, e) -> m.put(e.getKey(), e.getValue()), Map::putAll);

        Map<String, Long> byRef = new LinkedHashMap<>();
        for (String t : allTables)
            for (Map<String, Object> r : db.queryForList("SELECT REF,COUNT(DISTINCT BARCODE) AS CNT FROM SYSTEM." + t + " WHERE " + filterBase + " AND REF IS NOT NULL GROUP BY REF", fp))
                byRef.merge(str(r.get("REF")), toLong(r.get("CNT")), Long::sum);

        Map<String, Long> bySV = new LinkedHashMap<>();
        for (String t : allTables)
            for (Map<String, Object> r : db.queryForList("SELECT SUPERVISEUR,COUNT(*) AS CNT FROM SYSTEM." + t + " WHERE " + filterBase + " AND SUPERVISEUR IS NOT NULL GROUP BY SUPERVISEUR", fp))
                bySV.merge(str(r.get("SUPERVISEUR")), toLong(r.get("CNT")), Long::sum);

        Map<String, Long> byPoste = new LinkedHashMap<>();
        for (String t : allTables)
            for (Map<String, Object> r : db.queryForList("SELECT POSTE,COUNT(*) AS CNT FROM SYSTEM." + t + " WHERE " + filterBase + " AND POSTE IS NOT NULL GROUP BY POSTE", fp))
                byPoste.merge(str(r.get("POSTE")), toLong(r.get("CNT")), Long::sum);

        Map<String, Map<String, Long>> trend = new LinkedHashMap<>();
        String trendSql = "SELECT TO_CHAR(DATEFW,'YYYY-MM-DD') AS DAY,COUNT(DISTINCT BARCODE) AS CNT FROM SYSTEM.%s WHERE " + filterBase + " GROUP BY TO_CHAR(DATEFW,'YYYY-MM-DD')";
        for (String t : fwTables)
            for (Map<String, Object> r : db.queryForList(String.format(trendSql, t), fp))
                trend.computeIfAbsent(str(r.get("DAY")), k -> new LinkedHashMap<>(Map.of("fw", 0L, "csl", 0L))).merge("fw", toLong(r.get("CNT")), Long::sum);
        for (String t : cslTables)
            for (Map<String, Object> r : db.queryForList(String.format(trendSql, t), fp))
                trend.computeIfAbsent(str(r.get("DAY")), k -> new LinkedHashMap<>(Map.of("fw", 0L, "csl", 0L))).merge("csl", toLong(r.get("CNT")), Long::sum);

        Map<String, Long> byDate = new LinkedHashMap<>();
        trend.entrySet().stream().sorted(Map.Entry.comparingByKey())
                .forEach(e -> byDate.put(e.getKey(), e.getValue().getOrDefault("fw",0L) + e.getValue().getOrDefault("csl",0L)));

        Map<String, Map<String, Long>> byProject = new LinkedHashMap<>();
        for (String t : fwTables) {
            String proj = t.substring("FIREWALL_".length());
            byProject.computeIfAbsent(proj, k -> new LinkedHashMap<>(Map.of("fw", 0L, "csl", 0L, "ret", 0L)));
            byProject.get(proj).merge("fw",  orZero(db.queryForObject("SELECT COUNT(DISTINCT BARCODE) FROM SYSTEM." + t + " WHERE " + filterBase, Long.class, fp)), Long::sum);
            byProject.get(proj).merge("ret", orZero(db.queryForObject("SELECT COUNT(DISTINCT BARCODE) FROM SYSTEM." + t + " WHERE " + filterBase + " AND NVL(REPRISE,'Not Returned')='Returned'", Long.class, fp)), Long::sum);
        }
        for (String t : cslTables) {
            String proj = t.substring("CSL_".length());
            byProject.computeIfAbsent(proj, k -> new LinkedHashMap<>(Map.of("fw", 0L, "csl", 0L, "ret", 0L)));
            byProject.get(proj).merge("csl", orZero(db.queryForObject("SELECT COUNT(DISTINCT BARCODE) FROM SYSTEM." + t + " WHERE " + filterBase, Long.class, fp)), Long::sum);
        }

        Map<String, Long> byDelibera = new LinkedHashMap<>();
        for (String t : allTables)
            for (Map<String, Object> r : db.queryForList("SELECT CQDELIBERA,COUNT(DISTINCT BARCODE) AS CNT FROM SYSTEM." + t + " WHERE " + filterBase + " AND CQDELIBERA IS NOT NULL GROUP BY CQDELIBERA", fp))
                byDelibera.merge(str(r.get("CQDELIBERA")), toLong(r.get("CNT")), Long::sum);
        byDelibera = byDelibera.entrySet().stream().sorted(Map.Entry.<String, Long>comparingByValue().reversed()).limit(10)
                .collect(LinkedHashMap::new, (m, e) -> m.put(e.getKey(), e.getValue()), Map::putAll);

        List<String> projects = repo.getFirewallTables().stream().map(t -> t.substring("FIREWALL_".length())).toList();
        long retCount   = reprise.getOrDefault("Returned", 0L);
        long scrapCount = reprise.getOrDefault("Scrap",    0L);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totals",    Map.of("fw", fwCount, "csl", cslCount, "returned", retCount, "scrap", scrapCount));
        result.put("reprise",   reprise);
        result.put("byDefCode", byDefCode);
        result.put("byRef",     byRef);
        result.put("bySV",      bySV);
        result.put("byPoste",   byPoste);
        result.put("byDate",    byDate);
        result.put("trend",     trend);
        result.put("byProject", byProject);
        result.put("byDelibera",byDelibera);
        result.put("projects",  projects);
        return result;
    }

    private long toLong(Object o) { return o instanceof Number n ? n.longValue() : 0L; }
    private long orZero(Long v)   { return v != null ? v : 0L; }
    private String str(Object o)  { return o != null ? o.toString() : ""; }
}
