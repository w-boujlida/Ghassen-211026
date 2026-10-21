package com.adient.firewall.service;

import com.adient.firewall.dto.CoiffeDetailDTO;
import com.adient.firewall.dto.ProductionHoraireDTO;
import com.adient.firewall.dto.ProductionTempsReelDTO;
import com.adient.firewall.dto.ProductionTempsReelLigneDTO;
import com.adient.firewall.repository.DeliberaRepository;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.repository.TargetRepository;
import com.adient.firewall.repository.sqlserver.ErpProductionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ErpProductionService {

    private final ErpProductionRepository erpProductionRepository;
    private final QualityRepository qualityRepository;
    private final DeliberaRepository deliberaRepository;
    private final TargetRepository targetRepository;

    public List<ProductionHoraireDTO> getProductionParProjetLigneHeure(LocalDate date) {
        List<Object[]> rows = erpProductionRepository.getProductionParProjetLigneHeure(date.toString());

        return rows.stream()
                .map(row -> new ProductionHoraireDTO(
                        (String) row[0],
                        (String) row[1],
                        ((Number) row[2]).intValue(),
                        ((BigDecimal) row[3]).intValue(),
                        row[4].toString().substring(0, 10)
                ))
                .sorted(Comparator.comparing(ProductionHoraireDTO::projet)
                        .thenComparing(ProductionHoraireDTO::ligne)
                        .thenComparingInt(ProductionHoraireDTO::heure))
                .toList();
    }

    public ProductionTempsReelDTO getTableauTempsReel(LocalDate date) {
        LocalDate jour = date != null ? date : LocalDate.now(ZoneId.of("Africa/Tunis"));
        Map<HourlyKey, HourlyValues> values = new HashMap<>();

        for (ProductionHoraireDTO row : getProductionParProjetLigneHeure(jour)) {
            HourlyValues cell = cell(values, row.projet(), row.ligne(), row.heure());
            cell.produitConforme = row.quantite();
        }

        for (Map<String, Object> row : targetRepository.findLatestDetailsForAllTargets()) {
            String shift = stringValue(row.get("SHIFT"));
            int hour = parseHour(stringValue(row.get("HEURE")));
            if (hour < 0 || !hourInShift(hour, shift)) continue;
            HourlyValues cell = cell(values, stringValue(row.get("PROJET")),
                    stringValue(row.get("LIGNE_PROJET")), hour);
            cell.target = numberValue(row.get("VALEUR")).doubleValue();
        }

        addQualityCounts(values, qualityRepository.getFirewallTables(), true, jour);
        addQualityCounts(values, qualityRepository.getCslTables(), false, jour);

        for (Map<String, Object> row : deliberaRepository.countScansParHeureGlobal(jour.toString())) {
            HourlyValues cell = cell(values, stringValue(row.get("PROJET")),
                    stringValue(row.get("LIGNE")), numberValue(row.get("HEURE")).intValue());
            cell.delibera = numberValue(row.get("CNT")).longValue();
        }

        List<ProductionTempsReelLigneDTO> lignes = values.entrySet().stream()
                .map(entry -> new ProductionTempsReelLigneDTO(
                        entry.getValue().projet,
                        entry.getValue().ligne,
                        entry.getKey().heure(),
                        entry.getValue().target,
                        entry.getValue().produitConforme,
                        entry.getValue().firewall,
                        entry.getValue().csl,
                        entry.getValue().delibera))
                .sorted(Comparator.comparing(ProductionTempsReelLigneDTO::projet)
                        .thenComparing(ProductionTempsReelLigneDTO::ligne)
                        .thenComparingInt(ProductionTempsReelLigneDTO::heure))
                .toList();

        return new ProductionTempsReelDTO(jour.toString(),
                LocalDateTime.now(ZoneId.of("Africa/Tunis")).toString(), lignes);
    }

    private void addQualityCounts(Map<HourlyKey, HourlyValues> values, List<String> tables,
                                  boolean firewall, LocalDate date) {
        for (String table : tables) {
            String project = table.substring(firewall ? "FIREWALL_".length() : "CSL_".length());
            for (Map<String, Object> row : qualityRepository.countScansParHeure(table, date.toString())) {
                HourlyValues cell = cell(values, project, stringValue(row.get("LIGNE")),
                        numberValue(row.get("HEURE")).intValue());
                long count = numberValue(row.get("CNT")).longValue();
                if (firewall) cell.firewall = count;
                else cell.csl = count;
            }
        }
    }

    private HourlyValues cell(Map<HourlyKey, HourlyValues> values, String project, String line, int hour) {
        HourlyKey key = new HourlyKey(normalize(project), normalize(line), hour);
        return values.computeIfAbsent(key, ignored -> new HourlyValues(
                displayValue(project), displayValue(line)));
    }

    private boolean hourInShift(int hour, String shift) {
        return ("MATIN".equalsIgnoreCase(shift) && hour >= 6 && hour < 14)
                || ("APRES_MIDI".equalsIgnoreCase(shift) && hour >= 14 && hour < 22);
    }

    private int parseHour(String slot) {
        try {
            return Integer.parseInt(slot.substring(0, 2));
        } catch (RuntimeException e) {
            return -1;
        }
    }

    private String normalize(String value) {
        return displayValue(value).toUpperCase(Locale.ROOT);
    }

    private String displayValue(String value) {
        return value == null || value.isBlank() ? "SANS LIGNE" : value.trim();
    }

    private String stringValue(Object value) {
        return value == null ? "" : value.toString();
    }

    private Number numberValue(Object value) {
        if (value instanceof Number number) return number;
        if (value == null) return 0;
        return new BigDecimal(value.toString());
    }

    private record HourlyKey(String projet, String ligne, int heure) {}

    private static final class HourlyValues {
        private final String projet;
        private final String ligne;
        private double target;
        private long produitConforme;
        private long firewall;
        private long csl;
        private long delibera;

        private HourlyValues(String projet, String ligne) {
            this.projet = projet;
            this.ligne = ligne;
        }
    }

    public List<CoiffeDetailDTO> getCoiffesDetail(LocalDate date, String projet, String ligne, Integer heure) {
        List<Object[]> rows = erpProductionRepository.getCoiffesDetail(date.toString(), projet, ligne, heure);

        return rows.stream()
                .map(row -> new CoiffeDetailDTO(
                        (BigDecimal) row[0],
                        (String) row[1],
                        (String) row[2],
                        (String) row[3],
                        ((Number) row[4]).intValue(),
                        (String) row[5],
                        (BigDecimal) row[6],
                        ((Number) row[7]).intValue() == 1,
                        row[8].toString().substring(0, 10)
                ))
                .toList();
    }
}
