package com.adient.firewall.service.impl;

import com.adient.firewall.dto.AlerteDto;
import com.adient.firewall.dto.RapportDto;
import com.adient.firewall.dto.RapportKpiDto;
import com.adient.firewall.dto.StatsProjetResponseDto;
import com.adient.firewall.dto.StatsProjetSerieDto;
import com.adient.firewall.dto.StatsResponseDto;
import com.adient.firewall.dto.StatsSerieDto;
import com.adient.firewall.dto.SuiviQualiteCreneauDto;
import com.adient.firewall.dto.SuiviQualiteDashboardDto;
import com.adient.firewall.dto.SuiviQualiteLigneDto;
import com.adient.firewall.repository.DeliberaRepository;
import com.adient.firewall.repository.NotificationRepository;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.repository.TargetRepository;
import com.adient.firewall.service.interfaces.ISuiviQualiteService;
import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Image;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.jfree.chart.ChartFactory;
import org.jfree.chart.JFreeChart;
import org.jfree.data.category.DefaultCategoryDataset;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Dashboard "Suivi Qualité des Coiffes" — croise le module Target (objectif par projet/ligne/shift/
 * heure) et le comptage horaire Délibéra (quantité de coiffes scannées avec défaut) pour un
 * pilotage temps réel de la qualité, par ligne de projet.
 *
 * Contient également le module Statistiques &amp; Rapport : agrégation historique (tendances dans
 * le temps) et rapport exportable (Excel/PDF) réutilisant la même grille Limite et les mêmes
 * seuils de statut que le dashboard temps réel.
 */
@Service
@RequiredArgsConstructor
public class SuiviQualiteServiceImpl implements ISuiviQualiteService {

    private final DeliberaRepository deliberaRepo;
    private final TargetRepository targetRepo;
    private final QualityRepository qRepo;
    private final NotificationRepository notifRepo;

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final DateTimeFormatter TS_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Set<String> GRANULARITES_VALIDES = Set.of("HEURE", "JOUR", "SEMAINE");
    private static final Set<String> GRANULARITES_PROJET_VALIDES = Set.of("HEURE", "SHIFT");

    // Bornes horaires par shift — {heureDebut, heureFin}, fin exclue. heureFin <= heureDebut signifie
    // que le shift traverse minuit (ex. SHIFT_2). MATIN/APRES_MIDI restent cohérents avec
    // TargetServiceImpl.SHIFT_SLOTS et DeliberaController.MATIN_DEBUT/MATIN_FIN/APRES_MIDI_FIN — ne
    // pas les modifier. SHIFT_1/SHIFT_2 sont un second découpage de shift ajouté ultérieurement
    // (06h-16h / 20h-06h), sélectionnable explicitement via le paramètre shift, en plus de
    // MATIN/APRES_MIDI (jamais mélangés : cf. {@link #shiftDeLHeure}).
    private static final Map<String, int[]> SHIFT_HOURS = Map.of(
        "MATIN",      new int[]{6, 14},
        "APRES_MIDI", new int[]{14, 22},
        "SHIFT_1",    new int[]{6, 16},
        "SHIFT_2",    new int[]{20, 6}
    );

    // Shifts historiques utilisés pour l'agrégation "tous shifts confondus" (shift non précisé,
    // getStatsProjet/getRapport sans filtre) — comportement inchangé, ne couvre jamais SHIFT_1/SHIFT_2
    // pour ne pas les mélanger avec MATIN/APRES_MIDI (créneaux qui se chevauchent).
    private static final Set<String> LEGACY_SHIFTS = Set.of("MATIN", "APRES_MIDI");

    // ─── Seuils de couleur, paramétrables sans recompiler ─────────────────────
    // vert   : ratio défauts/target < seuilOrange   (situation saine)
    // orange : seuilOrange <= ratio <= seuilRouge    (zone d'alerte, on se rapproche de la target)
    // rouge  : ratio > seuilRouge                    (target dépassée)
    // Valeurs par défaut 0.8 / 1.0 — override possible via application.properties :
    //   suivi-qualite.seuil-orange=0.8
    //   suivi-qualite.seuil-rouge=1.0
    @Value("${suivi-qualite.seuil-orange:0.8}")
    private double seuilOrange;

    @Value("${suivi-qualite.seuil-rouge:1.0}")
    private double seuilRouge;

    @PostConstruct
    public void init() {
        // Dashboard de pilotage — lecture ouverte à tous les rôles, administration réservée à l'admin.
        qRepo.seedModulePermissions("suivi_qualite", "admin", "read", "read", "read");
    }

    @Override
    public SuiviQualiteDashboardDto getDashboard(String projet, String ligneFiltre, String shift, String date) {
        if (projet == null || projet.isBlank())
            throw new IllegalArgumentException("Projet requis");

        String pn = QualityRepository.safe(projet);
        if (!qRepo.tableExists(pn))
            throw new NoSuchElementException("Projet introuvable: " + pn);

        String resolvedShift = (shift != null && !shift.isBlank()) ? shift.trim().toUpperCase() : currentShift();
        int[] hours = SHIFT_HOURS.get(resolvedShift);
        if (hours == null)
            throw new IllegalArgumentException("Shift invalide: " + shift + ". Valeurs acceptées: MATIN, APRES_MIDI, SHIFT_1, SHIFT_2");

        String resolvedDate = (date != null && !date.isBlank()) ? date : LocalDate.now(TUNIS).toString();
        String ligneFiltreClean = (ligneFiltre != null && !ligneFiltre.isBlank()) ? ligneFiltre : null;

        List<String> lignes = ligneFiltreClean != null
                ? List.of(ligneFiltreClean)
                : qRepo.getDistinctLignes(pn);

        // ── Targets : dernier target enregistré pour ce projet+shift (grille ligne × heure) ────
        Map<String, Map<String, Double>> targetByLigneHeure = loadTargetGrid(pn, resolvedShift);

        // ── Défauts : comptage horaire groupé par ligne, une seule requête (pas de N+1) ─────────
        // Shift traversant minuit (ex. SHIFT_2, 20h-06h) : les créneaux 00h-06h appartiennent au
        // lendemain de resolvedDate — countScansParHeure ne couvre qu'un seul jour calendaire, donc
        // on bascule sur countScansParHeureRange (2 jours) et on ne garde que les heures du shift.
        boolean wraps = hours[1] <= hours[0];
        Map<String, Map<Integer, Long>> countsByLigneHeure = new HashMap<>();
        if (!wraps) {
            for (Map<String, Object> row : deliberaRepo.countScansParHeure(pn, ligneFiltreClean, resolvedDate)) {
                String ligne = String.valueOf(row.get("LIGNE"));
                int heure = ((Number) row.get("HEURE")).intValue();
                long cnt = ((Number) row.get("CNT")).longValue();
                countsByLigneHeure.computeIfAbsent(ligne, k -> new HashMap<>()).put(heure, cnt);
            }
        } else {
            String lendemain = LocalDate.parse(resolvedDate).plusDays(1).toString();
            for (Map<String, Object> row : deliberaRepo.countScansParHeureRange(
                    pn, resolvedDate, LocalDate.parse(resolvedDate).plusDays(2).toString())) {
                String ligne = String.valueOf(row.get("LIGNE"));
                if (ligneFiltreClean != null && !ligneFiltreClean.equalsIgnoreCase(ligne)) continue;
                String jour = String.valueOf(row.get("JOUR"));
                int heure = ((Number) row.get("HEURE")).intValue();
                boolean dansShift = (jour.equals(resolvedDate) && heure >= hours[0])
                        || (jour.equals(lendemain) && heure < hours[1]);
                if (!dansShift) continue;
                long cnt = ((Number) row.get("CNT")).longValue();
                countsByLigneHeure.computeIfAbsent(ligne, k -> new HashMap<>()).merge(heure, cnt, Long::sum);
            }
        }

        List<String> creneauxShift = new ArrayList<>();
        for (int h : heuresDuShift(hours)) creneauxShift.add(creneauLabel(h));

        List<SuiviQualiteLigneDto> result = new ArrayList<>();
        for (String ligne : lignes) {
            Map<String, Double> hourTargets = targetByLigneHeure.getOrDefault(ligne, Map.of());
            Map<Integer, Long> hourCounts = countsByLigneHeure.getOrDefault(ligne, Map.of());

            double limiteTotal = 0;
            long defautsTotal = 0;
            List<SuiviQualiteCreneauDto> creneaux = new ArrayList<>();
            for (int h : heuresDuShift(hours)) {
                String label = creneauLabel(h);
                double hourLimite = hourTargets.getOrDefault(label, 0d);
                long hourCount = hourCounts.getOrDefault(h, 0L);
                limiteTotal += hourLimite;
                defautsTotal += hourCount;
                creneaux.add(new SuiviQualiteCreneauDto(label, hourLimite, hourCount, computeStatut(hourCount, hourLimite)));

                // Notification admin — dépassement sur CE créneau horaire précis (idempotent,
                // une seule notification par projet/ligne/date/créneau).
                if (hourLimite > 0 && hourCount > hourLimite) {
                    notifyDepassement(pn, ligne, resolvedDate, label, hourCount, hourLimite);
                }
            }

            result.add(buildLigneDto(ligne, limiteTotal, defautsTotal, creneaux));
        }

        String dateFin = wraps ? LocalDate.parse(resolvedDate).plusDays(1).toString() : resolvedDate;
        return new SuiviQualiteDashboardDto(pn, resolvedShift, resolvedDate, dateFin, seuilOrange, seuilRouge,
                creneauxShift, result, LocalDateTime.now(TUNIS).format(TS_FMT));
    }

    // ─── Statistiques (tendances dans le temps) ───────────────────────────────

    @Override
    public StatsResponseDto getStatsGlobal(String dateDebut, String dateFin, String granularite) {
        LocalDate d1 = parseDate(dateDebut, "dateDebut");
        LocalDate d2 = parseDate(dateFin, "dateFin");
        if (d2.isBefore(d1)) throw new IllegalArgumentException("dateFin doit être postérieure ou égale à dateDebut");

        String g = resolveGranularite(granularite, d1, d2);
        List<Map<String, Object>> rows = deliberaRepo.countScansParBucketProjet(
                d1.toString(), d2.plusDays(1).toString(), unitTruncFor(g));
        return pivotStats(rows, g);
    }

    @Override
    public StatsProjetResponseDto getStatsProjet(String projet, String ligne, String dateDebut, String dateFin,
                                                  String granularite, String shift) {
        if (projet == null || projet.isBlank())
            throw new IllegalArgumentException("Projet requis");
        String pn = QualityRepository.safe(projet);
        if (!qRepo.tableExists(pn))
            throw new NoSuchElementException("Projet introuvable: " + pn);

        LocalDate d1 = parseDate(dateDebut, "dateDebut");
        LocalDate d2 = parseDate(dateFin, "dateFin");
        if (d2.isBefore(d1)) throw new IllegalArgumentException("dateFin doit être postérieure ou égale à dateDebut");

        String shiftFiltre = (shift != null && !shift.isBlank()) ? shift.trim().toUpperCase() : null;
        if (shiftFiltre != null && !SHIFT_HOURS.containsKey(shiftFiltre))
            throw new IllegalArgumentException("Shift invalide: " + shift + ". Valeurs acceptées: MATIN, APRES_MIDI, SHIFT_1, SHIFT_2");

        String g = resolveGranulariteProjet(granularite, d1, d2);
        String ligneFiltreClean = (ligne != null && !ligne.isBlank()) ? ligne : null;

        // Grille(s) Limite — même simplification que le dashboard temps réel et le rapport : dernier
        // target enregistré pour le projet+shift (la Limite n'est pas versionnée dans le temps).
        Map<String, Map<String, Map<String, Double>>> targetGridParShift = new HashMap<>();
        for (String s : SHIFT_HOURS.keySet()) targetGridParShift.put(s, loadTargetGrid(pn, s));

        // Limite totale d'un shift par ligne (somme des 8 créneaux horaires) — constante sur toute
        // la période, précalculée une seule fois pour la granularité SHIFT.
        Map<String, Map<String, Double>> shiftTotalLimiteParLigne = new HashMap<>();
        for (String s : SHIFT_HOURS.keySet()) {
            Map<String, Double> totals = new HashMap<>();
            for (Map.Entry<String, Map<String, Double>> e : targetGridParShift.get(s).entrySet()) {
                totals.put(e.getKey(), e.getValue().values().stream().mapToDouble(Double::doubleValue).sum());
            }
            shiftTotalLimiteParLigne.put(s, totals);
        }

        // Une seule requête pour toute la période — même méthode que la détection d'alertes du
        // rapport (grain HEURE), agrégée ensuite en Java au grain HEURE ou SHIFT selon la demande.
        List<Map<String, Object>> rows = deliberaRepo.countScansParHeureRange(pn, d1.toString(), d2.plusDays(1).toString());

        Map<String, Map<String, Long>> quantiteParBucketLigne = new TreeMap<>();
        Map<String, Map<String, Double>> limiteParBucketLigne = new HashMap<>();

        for (Map<String, Object> row : rows) {
            String ligneRow = String.valueOf(row.get("LIGNE"));
            if (ligneFiltreClean != null && !ligneFiltreClean.equalsIgnoreCase(ligneRow)) continue;

            String jour = String.valueOf(row.get("JOUR"));
            int heure = ((Number) row.get("HEURE")).intValue();
            long cnt = ((Number) row.get("CNT")).longValue();

            String shiftDeLHeure = shiftDeLHeure(heure, shiftFiltre);
            if (shiftDeLHeure == null) continue;

            String bucket;
            double limite;
            if (g.equals("HEURE")) {
                bucket = jour + " " + String.format("%02d:00:00", heure);
                limite = targetGridParShift.get(shiftDeLHeure).getOrDefault(ligneRow, Map.of())
                        .getOrDefault(creneauLabel(heure), 0d);
            } else { // SHIFT
                int[] shiftBounds = SHIFT_HOURS.get(shiftDeLHeure);
                // Shift traversant minuit (ex. SHIFT_2) : les heures 00h-06h appartiennent au même
                // shift que le 20h-23h de la veille — on les rattache au jour de DÉBUT du shift pour
                // ne pas éclater une occurrence de shift en deux buckets.
                String shiftJour = shiftBounds[1] > shiftBounds[0] ? jour
                        : (heure >= shiftBounds[0] ? jour : LocalDate.parse(jour).minusDays(1).toString());
                bucket = shiftJour + " " + String.format("%02d:00:00", shiftBounds[0]);
                limite = shiftTotalLimiteParLigne.get(shiftDeLHeure).getOrDefault(ligneRow, 0d);
            }

            quantiteParBucketLigne.computeIfAbsent(bucket, k -> new HashMap<>()).merge(ligneRow, cnt, Long::sum);
            limiteParBucketLigne.computeIfAbsent(bucket, k -> new HashMap<>()).put(ligneRow, limite);
        }

        List<String> buckets = new ArrayList<>(quantiteParBucketLigne.keySet());
        Set<String> lignes = new TreeSet<>();
        quantiteParBucketLigne.values().forEach(m -> lignes.addAll(m.keySet()));

        List<StatsProjetSerieDto> series = new ArrayList<>();
        for (String l : lignes) {
            List<Long> valeurs = new ArrayList<>();
            List<Double> limites = new ArrayList<>();
            List<String> statuts = new ArrayList<>();
            for (String b : buckets) {
                long q = quantiteParBucketLigne.getOrDefault(b, Map.of()).getOrDefault(l, 0L);
                double lim = limiteParBucketLigne.getOrDefault(b, Map.of()).getOrDefault(l, 0d);
                valeurs.add(q);
                limites.add(lim);
                statuts.add(computeStatut(q, lim));
            }
            series.add(new StatsProjetSerieDto(l, valeurs, limites, statuts));
        }

        return new StatsProjetResponseDto(g, buckets, series);
    }

    // ─── Rapport (KPI + série + alertes) ───────────────────────────────────────

    @Override
    public RapportDto getRapport(String projet, String dateDebut, String dateFin, String shift) {
        if (projet == null || projet.isBlank())
            throw new IllegalArgumentException("Projet requis");
        String pn = QualityRepository.safe(projet);
        if (!qRepo.tableExists(pn))
            throw new NoSuchElementException("Projet introuvable: " + pn);

        LocalDate d1 = parseDate(dateDebut, "dateDebut");
        LocalDate d2 = parseDate(dateFin, "dateFin");
        if (d2.isBefore(d1)) throw new IllegalArgumentException("dateFin doit être postérieure ou égale à dateDebut");

        String shiftFiltre = (shift != null && !shift.isBlank()) ? shift.trim().toUpperCase() : null;
        if (shiftFiltre != null && !SHIFT_HOURS.containsKey(shiftFiltre))
            throw new IllegalArgumentException("Shift invalide: " + shift + ". Valeurs acceptées: MATIN, APRES_MIDI, SHIFT_1, SHIFT_2");

        // Grille(s) Limite — même simplification que le dashboard temps réel : dernier target
        // enregistré pour le projet+shift, la Limite n'étant pas versionnée dans le temps.
        Map<String, Map<String, Map<String, Double>>> targetGridParShift = new HashMap<>();
        for (String s : SHIFT_HOURS.keySet()) targetGridParShift.put(s, loadTargetGrid(pn, s));

        List<Map<String, Object>> rows = deliberaRepo.countScansParHeureRange(pn, d1.toString(), d2.plusDays(1).toString());

        long totalControle = 0;
        int nbCreneauxEvalues = 0;
        List<AlerteDto> alertes = new ArrayList<>();
        Map<String, Double> ecartCumuleParLigne = new HashMap<>();

        for (Map<String, Object> row : rows) {
            String ligne = String.valueOf(row.get("LIGNE"));
            String jour = String.valueOf(row.get("JOUR"));
            int heure = ((Number) row.get("HEURE")).intValue();
            long cnt = ((Number) row.get("CNT")).longValue();

            // Filtre shift explicite : exclut du total contrôlé les heures hors de ce shift (bornes
            // propres au shift demandé, traverse minuit possible). Sans filtre : toutes les heures
            // comptent dans le total contrôlé (comportement historique inchangé), seule l'évaluation
            // de la Limite ci-dessous se limite à MATIN/APRES_MIDI (nuit non couverte par la Limite).
            if (shiftFiltre != null && !heureDansShift(heure, SHIFT_HOURS.get(shiftFiltre))) continue;

            totalControle += cnt;
            String shiftDeLHeure = shiftFiltre != null ? shiftFiltre : shiftDeLHeure(heure, null);
            if (shiftDeLHeure == null) continue; // pas de créneau Limite défini pour la nuit

            String creneau = creneauLabel(heure);
            Map<String, Double> hourTargets = targetGridParShift.get(shiftDeLHeure).getOrDefault(ligne, Map.of());
            double limite = hourTargets.getOrDefault(creneau, 0d);
            if (limite <= 0) continue; // pas de Limite définie pour ce créneau -> non évalué

            nbCreneauxEvalues++;
            if (cnt > limite) {
                double ecart = limite - cnt;
                alertes.add(new AlerteDto(pn, ligne, jour, creneau, cnt, limite, ecart, computeStatut(cnt, limite)));
                ecartCumuleParLigne.merge(ligne, ecart, Double::sum);
            }
        }

        alertes.sort(Comparator.comparingDouble(AlerteDto::ecart)); // écart le plus négatif (critique) en premier

        String ligneCritique = null;
        Double ligneCritiqueEcart = null;
        for (Map.Entry<String, Double> e : ecartCumuleParLigne.entrySet()) {
            if (ligneCritiqueEcart == null || e.getValue() < ligneCritiqueEcart) {
                ligneCritique = e.getKey();
                ligneCritiqueEcart = e.getValue();
            }
        }

        Double taux = nbCreneauxEvalues > 0
                ? Math.round((alertes.size() / (double) nbCreneauxEvalues) * 1000.0) / 10.0
                : null;
        RapportKpiDto kpis = new RapportKpiDto(totalControle, nbCreneauxEvalues, alertes.size(), taux,
                ligneCritique, ligneCritiqueEcart);

        StatsProjetResponseDto series = getStatsProjet(pn, null, dateDebut, dateFin, "SHIFT", shiftFiltre);

        return new RapportDto(pn, d1.toString(), d2.toString(), shiftFiltre, kpis, series, alertes,
                LocalDateTime.now(TUNIS).format(TS_FMT));
    }

    // ─── Exports ────────────────────────────────────────────────────────────

    @Override
    public byte[] exportRapportExcel(String projet, String dateDebut, String dateFin, String shift) throws Exception {
        RapportDto rapport = getRapport(projet, dateDebut, dateFin, shift);

        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            CellStyle boldStyle = wb.createCellStyle();
            var boldFont = wb.createFont();
            boldFont.setBold(true);
            boldStyle.setFont(boldFont);

            CellStyle rougeStyle = wb.createCellStyle();
            rougeStyle.setFillForegroundColor(IndexedColors.ROSE.getIndex());
            rougeStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            // ── Feuille KPI ──
            Sheet kpiSheet = wb.createSheet("KPI");
            int r = 0;
            writeKeyValueRow(kpiSheet, r++, boldStyle, "Rapport Suivi Qualité", rapport.projet());
            writeKeyValueRow(kpiSheet, r++, null, "Période", rapport.dateDebut() + " -> " + rapport.dateFin());
            writeKeyValueRow(kpiSheet, r++, null, "Shift", rapport.shift() != null ? rapport.shift() : "Tous");
            writeKeyValueRow(kpiSheet, r++, null, "Total contrôlé", String.valueOf(rapport.kpis().totalControle()));
            writeKeyValueRow(kpiSheet, r++, null, "Créneaux évalués", String.valueOf(rapport.kpis().nbCreneauxEvalues()));
            writeKeyValueRow(kpiSheet, r++, null, "Dépassements", String.valueOf(rapport.kpis().nbDepassements()));
            writeKeyValueRow(kpiSheet, r++, null, "Taux de dépassement",
                    rapport.kpis().tauxDepassement() != null ? rapport.kpis().tauxDepassement() + "%" : "—");
            writeKeyValueRow(kpiSheet, r++, null, "Ligne la plus critique",
                    rapport.kpis().ligneCritique() != null ? rapport.kpis().ligneCritique() : "—");
            kpiSheet.autoSizeColumn(0);
            kpiSheet.autoSizeColumn(1);

            // ── Feuille Séries : Quantité et Limite par ligne, une paire de colonnes par ligne ──
            Sheet serieSheet = wb.createSheet("Séries");
            List<StatsProjetSerieDto> series = rapport.series().series();
            List<String> buckets = rapport.series().buckets();
            Row head = serieSheet.createRow(0);
            head.createCell(0).setCellValue("Bucket (" + rapport.series().granulariteEffective() + ")");
            for (int i = 0; i < series.size(); i++) {
                head.createCell(1 + i * 2).setCellValue(series.get(i).cle() + " (Qté)");
                head.createCell(2 + i * 2).setCellValue(series.get(i).cle() + " (Limite)");
            }
            for (int b = 0; b < buckets.size(); b++) {
                Row row = serieSheet.createRow(b + 1);
                row.createCell(0).setCellValue(buckets.get(b));
                for (int i = 0; i < series.size(); i++) {
                    row.createCell(1 + i * 2).setCellValue(series.get(i).valeurs().get(b));
                    row.createCell(2 + i * 2).setCellValue(series.get(i).limites().get(b));
                }
            }
            serieSheet.autoSizeColumn(0);

            // ── Feuille Alertes ──
            Sheet alSheet = wb.createSheet("Alertes");
            String[] cols = {"Ligne", "Jour", "Créneau", "Quantité", "Limite", "Écart", "Statut"};
            Row alHead = alSheet.createRow(0);
            for (int i = 0; i < cols.length; i++) {
                Cell c = alHead.createCell(i);
                c.setCellValue(cols[i]);
                c.setCellStyle(boldStyle);
            }
            int ar = 1;
            for (AlerteDto a : rapport.alertes()) {
                Row row = alSheet.createRow(ar++);
                row.createCell(0).setCellValue(a.ligne());
                row.createCell(1).setCellValue(a.jour());
                row.createCell(2).setCellValue(a.creneau());
                row.createCell(3).setCellValue(a.quantite());
                row.createCell(4).setCellValue(a.limite());
                row.createCell(5).setCellValue(a.ecart());
                row.createCell(6).setCellValue(a.statut());
                if ("ROUGE".equals(a.statut())) {
                    for (int c = 0; c < cols.length; c++) row.getCell(c).setCellStyle(rougeStyle);
                }
            }
            for (int c = 0; c < cols.length; c++) alSheet.autoSizeColumn(c);

            wb.write(out);
            return out.toByteArray();
        }
    }

    @Override
    public byte[] exportRapportPdf(String projet, String dateDebut, String dateFin, String shift) throws Exception {
        RapportDto rapport = getRapport(projet, dateDebut, dateFin, shift);

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A4, 36, 36, 54, 36);
        PdfWriter.getInstance(doc, out);
        doc.open();

        Font titleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 16);
        Font sectionFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 12);
        Font normalFont = FontFactory.getFont(FontFactory.HELVETICA, 10);

        doc.add(new Paragraph("Rapport Suivi Qualité — " + rapport.projet(), titleFont));
        doc.add(new Paragraph("Période : " + rapport.dateDebut() + " au " + rapport.dateFin()
                + (rapport.shift() != null ? " · Shift " + rapport.shift() : " · Tous shifts"), normalFont));
        doc.add(new Paragraph("Généré le " + rapport.generatedAt(), normalFont));
        doc.add(Chunk.NEWLINE);

        doc.add(new Paragraph("Indicateurs clés", sectionFont));
        PdfPTable kpiTable = new PdfPTable(2);
        kpiTable.setWidthPercentage(100);
        addKpiRow(kpiTable, "Total contrôlé", String.valueOf(rapport.kpis().totalControle()));
        addKpiRow(kpiTable, "Créneaux évalués", String.valueOf(rapport.kpis().nbCreneauxEvalues()));
        addKpiRow(kpiTable, "Dépassements", String.valueOf(rapport.kpis().nbDepassements()));
        addKpiRow(kpiTable, "Taux de dépassement",
                rapport.kpis().tauxDepassement() != null ? rapport.kpis().tauxDepassement() + "%" : "—");
        addKpiRow(kpiTable, "Ligne la plus critique",
                rapport.kpis().ligneCritique() != null ? rapport.kpis().ligneCritique() : "—");
        doc.add(kpiTable);
        doc.add(Chunk.NEWLINE);

        if (!rapport.series().series().isEmpty()) {
            doc.add(new Paragraph("Évolution — Quantité avec défauts par ligne", sectionFont));
            Image lineImg = Image.getInstance(renderLineChart(rapport.series()));
            lineImg.scaleToFit(500, 260);
            doc.add(lineImg);
            doc.add(Chunk.NEWLINE);

            doc.add(new Paragraph("Comparatif — Quantité avec défauts vs Limite, total par ligne sur la période", sectionFont));
            Image barImg = Image.getInstance(renderBarChart(rapport.series()));
            barImg.scaleToFit(500, 260);
            doc.add(barImg);
            doc.add(Chunk.NEWLINE);
        }

        doc.add(new Paragraph("Alertes — dépassements de Limite (triés par criticité)", sectionFont));
        if (rapport.alertes().isEmpty()) {
            doc.add(new Paragraph("Aucun dépassement détecté sur la période.", normalFont));
        } else {
            PdfPTable alTable = new PdfPTable(new float[]{2.2f, 1.3f, 1.3f, 1f, 1f, 1f, 1f});
            alTable.setWidthPercentage(100);
            for (String h : new String[]{"Ligne", "Jour", "Créneau", "Qté", "Limite", "Écart", "Statut"}) {
                PdfPCell hc = new PdfPCell(new Phrase(h, sectionFont));
                hc.setBackgroundColor(new Color(240, 240, 240));
                alTable.addCell(hc);
            }
            for (AlerteDto a : rapport.alertes()) {
                Color bg = "ROUGE".equals(a.statut()) ? new Color(254, 226, 226) : Color.WHITE;
                alTable.addCell(pdfCell(a.ligne(), normalFont, bg));
                alTable.addCell(pdfCell(a.jour(), normalFont, bg));
                alTable.addCell(pdfCell(a.creneau(), normalFont, bg));
                alTable.addCell(pdfCell(String.valueOf(a.quantite()), normalFont, bg));
                alTable.addCell(pdfCell(String.valueOf((long) a.limite()), normalFont, bg));
                alTable.addCell(pdfCell(String.valueOf((long) a.ecart()), normalFont, bg));
                alTable.addCell(pdfCell(a.statut(), normalFont, bg));
            }
            doc.add(alTable);
        }

        doc.close();
        return out.toByteArray();
    }

    private void addKpiRow(PdfPTable table, String label, String value) {
        Font labelFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10);
        Font valueFont = FontFactory.getFont(FontFactory.HELVETICA, 10);
        table.addCell(new PdfPCell(new Phrase(label, labelFont)));
        table.addCell(new PdfPCell(new Phrase(value, valueFont)));
    }

    private PdfPCell pdfCell(String text, Font font, Color bg) {
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        cell.setBackgroundColor(bg);
        return cell;
    }

    private byte[] renderLineChart(StatsProjetResponseDto series) throws java.io.IOException {
        DefaultCategoryDataset ds = new DefaultCategoryDataset();
        List<String> buckets = series.buckets();
        for (StatsProjetSerieDto s : series.series()) {
            for (int i = 0; i < buckets.size(); i++) {
                ds.addValue(s.valeurs().get(i), s.cle(), buckets.get(i));
            }
        }
        JFreeChart chart = ChartFactory.createLineChart(null, "Période", "Quantité", ds);
        BufferedImage img = chart.createBufferedImage(700, 360);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        ImageIO.write(img, "png", bos);
        return bos.toByteArray();
    }

    /** Quantité totale vs Limite totale par ligne sur la période — comparatif, pas une évolution temporelle. */
    private byte[] renderBarChart(StatsProjetResponseDto series) throws java.io.IOException {
        DefaultCategoryDataset ds = new DefaultCategoryDataset();
        for (StatsProjetSerieDto s : series.series()) {
            long totalQte = s.valeurs().stream().mapToLong(Long::longValue).sum();
            double totalLimite = s.limites().stream().mapToDouble(Double::doubleValue).sum();
            ds.addValue(totalQte, "Quantité", s.cle());
            ds.addValue(totalLimite, "Limite", s.cle());
        }
        JFreeChart chart = ChartFactory.createBarChart(null, "Ligne", "Total", ds);
        BufferedImage img = chart.createBufferedImage(700, 300);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        ImageIO.write(img, "png", bos);
        return bos.toByteArray();
    }

    private void writeKeyValueRow(Sheet sheet, int rowIdx, CellStyle labelStyle, String label, String value) {
        Row row = sheet.createRow(rowIdx);
        Cell c0 = row.createCell(0);
        c0.setCellValue(label);
        if (labelStyle != null) c0.setCellStyle(labelStyle);
        row.createCell(1).setCellValue(value);
    }

    // ─── Helpers partagés (dashboard temps réel + statistiques/rapport) ───────

    private Map<String, Map<String, Double>> loadTargetGrid(String pn, String shift) {
        Map<String, Map<String, Double>> targetByLigneHeure = new HashMap<>();
        targetRepo.findLatestHeaderId(pn, shift).ifPresent(targetId -> {
            for (Map<String, Object> row : targetRepo.findDetailsByTargetId(targetId)) {
                String ligne = String.valueOf(row.get("LIGNE_PROJET"));
                String heure = String.valueOf(row.get("HEURE"));
                double valeur = row.get("VALEUR") instanceof Number n ? n.doubleValue() : 0d;
                targetByLigneHeure.computeIfAbsent(ligne, k -> new HashMap<>()).put(heure, valeur);
            }
        });
        return targetByLigneHeure;
    }

    private SuiviQualiteLigneDto buildLigneDto(String ligne, double limite, long defauts, List<SuiviQualiteCreneauDto> creneaux) {
        Double pourcentage = limite > 0 ? Math.round((defauts / limite) * 1000.0) / 10.0 : null;
        return new SuiviQualiteLigneDto(ligne, limite, defauts, limite - defauts, pourcentage,
                computeStatut(defauts, limite), creneaux);
    }

    /** Statut vert/orange/rouge selon le ratio défauts/limite — seuils paramétrables ({@link #seuilOrange}, {@link #seuilRouge}). */
    private String computeStatut(long defauts, double limite) {
        double ratio = limite > 0 ? (defauts / limite) : (defauts > 0 ? Double.POSITIVE_INFINITY : 0d);
        if (ratio > seuilRouge) return "ROUGE";
        if (ratio >= seuilOrange) return "ORANGE";
        return "VERT";
    }

    private void notifyDepassement(String projet, String ligne, String date, String creneau,
                                   long defauts, double target) {
        String heureDebut = creneau.substring(0, 5);
        String dedupeKey = "suivi_qualite|" + projet + "|" + ligne + "|" + date + "|" + creneau;
        String message = String.format(
                "Projet '%s' — Ligne '%s' — Heure '%s' : la limite est dépassée (%d / %.0f).",
                projet, ligne, heureDebut, defauts, target);
        notifRepo.insertIfNotExists("suivi_qualite_depassement", "suivi_qualite", null, projet,
                message, "system", "admin", dedupeKey);
    }

    private String currentShift() {
        int h = LocalDateTime.now(TUNIS).getHour();
        return (h >= 6 && h < 14) ? "MATIN" : "APRES_MIDI";
    }

    private String creneauLabel(int heure) {
        return String.format("%02d:00-%02d:00", heure, heure + 1);
    }

    /**
     * Shift auquel appartient une heure donnée. Avec un filtre explicite, teste uniquement les
     * bornes de ce shift (nécessaire dès que plusieurs découpages de shift coexistent avec des
     * créneaux qui se chevauchent, ex. MATIN 06-14 et SHIFT_1 06-16). Sans filtre (agrégation "tous
     * shifts"), ne teste que MATIN/APRES_MIDI — comportement historique inchangé, SHIFT_1/SHIFT_2 ne
     * sont retenus que si explicitement demandés. Retourne null si l'heure n'appartient à aucun
     * shift évalué (nuit hors MATIN/APRES_MIDI, ou hors bornes du shift filtré).
     */
    private String shiftDeLHeure(int heure, String shiftFiltre) {
        if (shiftFiltre != null) {
            int[] bounds = SHIFT_HOURS.get(shiftFiltre);
            return (bounds != null && heureDansShift(heure, bounds)) ? shiftFiltre : null;
        }
        for (String s : LEGACY_SHIFTS) {
            if (heureDansShift(heure, SHIFT_HOURS.get(s))) return s;
        }
        return null;
    }

    private boolean heureDansShift(int heure, int[] bounds) {
        return bounds[1] > bounds[0]
                ? (heure >= bounds[0] && heure < bounds[1])
                : (heure >= bounds[0] || heure < bounds[1]);
    }

    /** Créneaux horaires d'un shift dans l'ordre chronologique, en traversant minuit si nécessaire. */
    private List<Integer> heuresDuShift(int[] bounds) {
        List<Integer> heures = new ArrayList<>();
        int h = bounds[0];
        do {
            heures.add(h);
            h = (h + 1) % 24;
        } while (h != bounds[1]);
        return heures;
    }

    private LocalDate parseDate(String s, String champ) {
        if (s == null || s.isBlank())
            throw new IllegalArgumentException(champ + " requis (format yyyy-MM-dd)");
        try {
            return LocalDate.parse(s.trim());
        } catch (Exception e) {
            throw new IllegalArgumentException(champ + " invalide: " + s + " (format attendu yyyy-MM-dd)");
        }
    }

    /**
     * Granularité effective : celle demandée si valide, sinon déduite automatiquement de l'étendue
     * de la période (≤3j → HEURE, ≤120j → JOUR, sinon SEMAINE). HEURE est bornée à 31 jours max
     * pour éviter des séries trop volumineuses ; au-delà, on bascule automatiquement sur JOUR.
     */
    private String resolveGranularite(String requested, LocalDate d1, LocalDate d2) {
        long jours = ChronoUnit.DAYS.between(d1, d2) + 1;
        String g = (requested != null && !requested.isBlank()) ? requested.trim().toUpperCase() : null;
        if (g == null) {
            if (jours <= 3) return "HEURE";
            if (jours <= 120) return "JOUR";
            return "SEMAINE";
        }
        if (!GRANULARITES_VALIDES.contains(g))
            throw new IllegalArgumentException("Granularité invalide: " + g + ". Valeurs acceptées: HEURE, JOUR, SEMAINE");
        if (g.equals("HEURE") && jours > 31) return "JOUR";
        return g;
    }

    /**
     * Granularité effective pour la vue projet (croisement avec la Limite) : HEURE (créneau
     * horaire) ou SHIFT (occurrence de shift de 8h, MATIN ou APRES_MIDI) — jamais JOUR/SEMAINE
     * calendaires, la Limite n'ayant de sens qu'à l'intérieur d'un shift. Auto : ≤3j → HEURE, sinon
     * SHIFT ; HEURE est bornée à 14 jours (au-delà, trop de points par ligne) et bascule sur SHIFT.
     */
    private String resolveGranulariteProjet(String requested, LocalDate d1, LocalDate d2) {
        long jours = ChronoUnit.DAYS.between(d1, d2) + 1;
        String g = (requested != null && !requested.isBlank()) ? requested.trim().toUpperCase() : null;
        if (g == null) return jours <= 3 ? "HEURE" : "SHIFT";
        if (!GRANULARITES_PROJET_VALIDES.contains(g))
            throw new IllegalArgumentException("Granularité invalide: " + g + ". Valeurs acceptées: HEURE, SHIFT");
        if (g.equals("HEURE") && jours > 14) return "SHIFT";
        return g;
    }

    private String unitTruncFor(String granularite) {
        return switch (granularite) {
            case "HEURE" -> "HH24";
            case "JOUR" -> "DD";
            case "SEMAINE" -> "IW";
            default -> throw new IllegalArgumentException("Granularité invalide: " + granularite);
        };
    }

    /** Pivote les lignes (CLE, BUCKET, CNT) en une série temporelle par CLE, alignée sur les buckets triés. */
    private StatsResponseDto pivotStats(List<Map<String, Object>> rows, String granulariteEffective) {
        TreeSet<String> bucketSet = new TreeSet<>();
        Map<String, Map<String, Long>> parCle = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String cle = String.valueOf(row.get("CLE"));
            String bucket = String.valueOf(row.get("BUCKET"));
            long cnt = ((Number) row.get("CNT")).longValue();
            bucketSet.add(bucket);
            parCle.computeIfAbsent(cle, k -> new HashMap<>()).put(bucket, cnt);
        }
        List<String> buckets = new ArrayList<>(bucketSet);
        List<StatsSerieDto> series = new ArrayList<>();
        for (Map.Entry<String, Map<String, Long>> e : parCle.entrySet()) {
            List<Long> valeurs = new ArrayList<>();
            for (String b : buckets) valeurs.add(e.getValue().getOrDefault(b, 0L));
            series.add(new StatsSerieDto(e.getKey(), valeurs));
        }
        return new StatsResponseDto(granulariteEffective, buckets, series);
    }
}
