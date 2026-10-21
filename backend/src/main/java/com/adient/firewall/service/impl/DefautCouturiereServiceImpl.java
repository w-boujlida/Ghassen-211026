package com.adient.firewall.service.impl;

import com.adient.firewall.dto.AlerteCouturiereDto;
import com.adient.firewall.dto.CouturiereSyntheseDto;
import com.adient.firewall.dto.DefautCouturiereDetailDto;
import com.adient.firewall.dto.DefautCouturiereKpiDto;
import com.adient.firewall.dto.DefautCouturiereLigneDto;
import com.adient.firewall.dto.DefautCouturiereRapportDto;
import com.adient.firewall.dto.DefautCouturiereTableauDto;
import com.adient.firewall.dto.DefautDetailItemDto;
import com.adient.firewall.dto.PosteDetailDto;
import com.adient.firewall.repository.AlerteCouturiereRepository;
import com.adient.firewall.repository.DefautCouturiereRepository;
import com.adient.firewall.repository.NotificationRepository;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.IDefautCouturiereService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * Suivi des Défauts par Couturière : tableau agrégé (couturières x postes), détail par couturière,
 * alertes "3 codes défauts / heure calendaire" (temps réel, idempotentes) et rapport exportable,
 * au-dessus des tables Délibéra existantes. Voir {@link IDefautCouturiereService} pour le contrat.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DefautCouturiereServiceImpl implements IDefautCouturiereService {

    private final DefautCouturiereRepository defautRepo;
    private final AlerteCouturiereRepository alerteRepo;
    private final NotificationRepository notifRepo;
    private final QualityRepository qRepo;

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final DateTimeFormatter TS_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final long SEUIL_ALERTE = 3;

    // Bornes horaires par shift — cohérentes avec SuiviQualiteServiceImpl.SHIFT_HOURS et
    // DeliberaController.MATIN_DEBUT/MATIN_FIN/APRES_MIDI_FIN (fin exclue).
    private static final Map<String, int[]> SHIFT_HOURS = Map.of(
        "MATIN",      new int[]{6, 14},
        "APRES_MIDI", new int[]{14, 22}
    );

    @PostConstruct
    public void init() {
        qRepo.seedModulePermissions("defauts_couturiere", "admin", "read", "read", "read");
    }

    // ─── Tableau ────────────────────────────────────────────────────────────────

    @Override
    public DefautCouturiereTableauDto getTableau(String projet, String ligne, String shift, String date) {
        if (projet == null || projet.isBlank())
            throw new IllegalArgumentException("Projet requis");

        LocalDate d = parseDateOrToday(date);
        String shiftClean = normalizeShift(shift);
        LocalDateTime[] range = resolveRange(d, shiftClean);

        List<Map<String, Object>> rows = defautRepo.tableauParCouturiereEtPoste(projet, ligne, range[0], range[1]);
        PivotResult pivot = pivot(rows);

        Set<Long> enAlerteIds = alerteRepo.listAlertes(projet, ligne, range[0], range[1]).stream()
            .map(a -> ((Number) a.get("COUTURIERE_ID")).longValue())
            .collect(Collectors.toSet());

        List<DefautCouturiereLigneDto> lignes = new ArrayList<>();
        for (Long cid : pivot.matriculeById.keySet()) {
            Map<String, Long> parPoste = pivot.parPosteById.getOrDefault(cid, Map.of());
            long total = parPoste.values().stream().mapToLong(Long::longValue).sum();
            lignes.add(new DefautCouturiereLigneDto(cid, pivot.matriculeById.get(cid), pivot.nomById.get(cid),
                    parPoste, total, enAlerteIds.contains(cid)));
        }
        lignes.sort(Comparator.comparingLong(DefautCouturiereLigneDto::total).reversed());

        return new DefautCouturiereTableauDto(projet, ligne, shiftClean, d.toString(),
                new ArrayList<>(pivot.postes), lignes);
    }

    // ─── Détail ─────────────────────────────────────────────────────────────────

    @Override
    public DefautCouturiereDetailDto getDetail(String matricule, String projet, String ligne, String shift, String date) {
        if (matricule == null || matricule.isBlank())
            throw new IllegalArgumentException("Matricule requis");
        if (projet == null || projet.isBlank())
            throw new IllegalArgumentException("Projet requis");

        Map<String, Object> couturiere = defautRepo.findCouturiereByMatricule(matricule);
        if (couturiere == null)
            throw new NoSuchElementException("Couturière introuvable: " + matricule);
        long couturiereId = ((Number) couturiere.get("ID")).longValue();
        String nom = str(couturiere.get("NOM"));

        LocalDate d = parseDateOrToday(date);
        String shiftClean = normalizeShift(shift);
        LocalDateTime[] range = resolveRange(d, shiftClean);

        List<Map<String, Object>> rows = defautRepo.detailCouturiere(matricule, projet, ligne, range[0], range[1]);

        Map<String, List<DefautDetailItemDto>> byPoste = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String poste = String.valueOf(row.get("POSTE_NOM"));
            DefautDetailItemDto item = new DefautDetailItemDto(
                    ((Number) row.get("DEFAUT_ID")).longValue(),
                    ((Number) row.get("RECORD_ID")).longValue(),
                    str(row.get("CODE_DEFAUT")),
                    str(row.get("DESC_DEFAUT")),
                    row.get("VERIFIE") instanceof Number n && n.intValue() == 1,
                    str(row.get("CREATED_AT")));
            byPoste.computeIfAbsent(poste, k -> new ArrayList<>()).add(item);
        }

        List<PosteDetailDto> postes = byPoste.entrySet().stream()
                .map(e -> new PosteDetailDto(e.getKey(), e.getValue(), e.getValue().size()))
                .sorted(Comparator.comparing(PosteDetailDto::posteNom))
                .collect(Collectors.toList());
        long total = postes.stream().mapToLong(PosteDetailDto::total).sum();

        return new DefautCouturiereDetailDto(couturiereId, matricule, nom, projet, ligne, shiftClean, d.toString(), postes, total);
    }

    // ─── Alertes (consultation) ─────────────────────────────────────────────────

    @Override
    public List<AlerteCouturiereDto> getAlertes(String projet, String ligne, String date) {
        LocalDateTime debut = null, fin = null;
        if (date != null && !date.isBlank()) {
            LocalDate d = LocalDate.parse(date);
            debut = d.atStartOfDay();
            fin = debut.plusDays(1);
        }
        return alerteRepo.listAlertes(projet, ligne, debut, fin).stream()
                .map(this::toAlerteDto)
                .collect(Collectors.toList());
    }

    // ─── Alertes (déclenchement temps réel) ─────────────────────────────────────

    @Override
    public void checkAlerte(Map<String, Object> record) {
        try {
            Object couturiereIdObj = record.get("COUTURIERE_ID");
            if (!(couturiereIdObj instanceof Number)) return; // scan non affecté à une couturière
            long couturiereId = ((Number) couturiereIdObj).longValue();

            Object createdAtObj = record.get("CREATED_AT");
            if (createdAtObj == null) return;
            LocalDateTime scanAt = LocalDateTime.parse(String.valueOf(createdAtObj), TS_FMT);
            LocalDateTime heureDebut = scanAt.truncatedTo(ChronoUnit.HOURS);
            LocalDateTime heureFin = heureDebut.plusHours(1);

            long count = defautRepo.countCodesDefautsHeure(couturiereId, heureDebut, heureFin);
            if (count < SEUIL_ALERTE) return;

            String matricule = str(record.get("COUTURIERE_MATRICULE"));
            String nom = str(record.get("COUTURIERE_NOM"));
            String projet = str(record.get("PROJET"));
            String ligne = str(record.get("LIGNE"));
            String shift = shiftDeLHeure(heureDebut.getHour());

            boolean created = alerteRepo.upsertAlerte(couturiereId, matricule, nom, projet, ligne, shift, heureDebut, count);
            if (created) {
                String dedupeKey = "defaut_couturiere|" + couturiereId + "|" + heureDebut.format(TS_FMT);
                String message = String.format(
                        "Couturière %s (%s) : %d codes défauts entre %s et %s — Projet %s, Ligne %s",
                        nom, matricule, count, heureDebut.toLocalTime(), heureFin.toLocalTime(), projet, ligne);
                notifRepo.insertIfNotExists("defaut_couturiere_alerte", "defaut_couturiere", null, projet,
                        message, "system", "admin,supervisor", dedupeKey);
            }
        } catch (Exception e) {
            // Le calcul d'alerte est un effet de bord — un échec ici ne doit jamais faire échouer le scan.
            log.warn("checkAlerte failed for record {}: {}", record.get("ID"), e.getMessage());
        }
    }

    // ─── Rapport ────────────────────────────────────────────────────────────────

    @Override
    public DefautCouturiereRapportDto getRapport(String projet, String ligne, String dateDebut, String dateFin) {
        if (projet == null || projet.isBlank())
            throw new IllegalArgumentException("Projet requis");
        LocalDate d1 = LocalDate.parse(dateDebut);
        LocalDate d2 = LocalDate.parse(dateFin);
        if (d2.isBefore(d1))
            throw new IllegalArgumentException("dateFin doit être postérieure ou égale à dateDebut");

        LocalDateTime debut = d1.atStartOfDay();
        LocalDateTime fin = d2.plusDays(1).atStartOfDay();

        List<Map<String, Object>> rows = defautRepo.syntheseParCouturiereEtPoste(projet, ligne, debut, fin);
        PivotResult pivot = pivot(rows);

        List<CouturiereSyntheseDto> synthese = new ArrayList<>();
        for (Long cid : pivot.matriculeById.keySet()) {
            Map<String, Long> parPoste = pivot.parPosteById.getOrDefault(cid, Map.of());
            long total = parPoste.values().stream().mapToLong(Long::longValue).sum();
            synthese.add(new CouturiereSyntheseDto(cid, pivot.matriculeById.get(cid), pivot.nomById.get(cid), total, parPoste));
        }
        synthese.sort(Comparator.comparingLong(CouturiereSyntheseDto::total).reversed());

        List<AlerteCouturiereDto> alertes = alerteRepo.listAlertes(projet, ligne, debut, fin).stream()
                .map(this::toAlerteDto)
                .collect(Collectors.toList());

        long totalDefauts = synthese.stream().mapToLong(CouturiereSyntheseDto::total).sum();
        CouturiereSyntheseDto top = synthese.stream()
                .max(Comparator.comparingLong(CouturiereSyntheseDto::total)).orElse(null);

        Map<String, Long> totalParPoste = new LinkedHashMap<>();
        for (CouturiereSyntheseDto s : synthese)
            s.parPoste().forEach((k, v) -> totalParPoste.merge(k, v, Long::sum));
        Map.Entry<String, Long> topPoste = totalParPoste.entrySet().stream()
                .max(Map.Entry.comparingByValue()).orElse(null);

        DefautCouturiereKpiDto kpis = new DefautCouturiereKpiDto(
                totalDefauts,
                top != null ? top.nom() : null, top != null ? top.total() : 0,
                topPoste != null ? topPoste.getKey() : null, topPoste != null ? topPoste.getValue() : 0,
                alertes.size());

        return new DefautCouturiereRapportDto(projet, ligne, d1.toString(), d2.toString(), kpis, synthese, alertes,
                LocalDateTime.now(TUNIS).format(TS_FMT));
    }

    // ─── Exports ────────────────────────────────────────────────────────────────

    @Override
    public byte[] exportRapportExcel(String projet, String ligne, String dateDebut, String dateFin) throws Exception {
        DefautCouturiereRapportDto rapport = getRapport(projet, ligne, dateDebut, dateFin);

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
            writeKeyValueRow(kpiSheet, r++, boldStyle, "Rapport Défauts par Couturière", rapport.projet());
            writeKeyValueRow(kpiSheet, r++, null, "Ligne", rapport.ligne() != null ? rapport.ligne() : "Toutes");
            writeKeyValueRow(kpiSheet, r++, null, "Période", rapport.dateDebut() + " -> " + rapport.dateFin());
            writeKeyValueRow(kpiSheet, r++, null, "Total codes défauts", String.valueOf(rapport.kpis().totalDefauts()));
            writeKeyValueRow(kpiSheet, r++, null, "Couturière la plus en défaut",
                    rapport.kpis().couturierePlusDefauts() != null
                            ? rapport.kpis().couturierePlusDefauts() + " (" + rapport.kpis().couturierePlusDefautsTotal() + ")" : "—");
            writeKeyValueRow(kpiSheet, r++, null, "Poste le plus problématique",
                    rapport.kpis().posteProblematique() != null
                            ? rapport.kpis().posteProblematique() + " (" + rapport.kpis().posteProblematiqueTotal() + ")" : "—");
            writeKeyValueRow(kpiSheet, r++, null, "Nombre d'alertes", String.valueOf(rapport.kpis().nbAlertes()));
            kpiSheet.autoSizeColumn(0);
            kpiSheet.autoSizeColumn(1);

            // ── Feuille Synthèse ──
            Sheet synSheet = wb.createSheet("Synthèse");
            Row synHead = synSheet.createRow(0);
            String[] synCols = {"Matricule", "Nom", "Total"};
            for (int i = 0; i < synCols.length; i++) {
                Cell c = synHead.createCell(i);
                c.setCellValue(synCols[i]);
                c.setCellStyle(boldStyle);
            }
            int sr = 1;
            for (CouturiereSyntheseDto s : rapport.synthese()) {
                Row row = synSheet.createRow(sr++);
                row.createCell(0).setCellValue(s.matricule());
                row.createCell(1).setCellValue(s.nom());
                row.createCell(2).setCellValue(s.total());
            }
            for (int c = 0; c < synCols.length; c++) synSheet.autoSizeColumn(c);

            // ── Feuille Alertes ──
            Sheet alSheet = wb.createSheet("Alertes");
            String[] alCols = {"Matricule", "Nom", "Ligne", "Shift", "Heure", "Nb défauts"};
            Row alHead = alSheet.createRow(0);
            for (int i = 0; i < alCols.length; i++) {
                Cell c = alHead.createCell(i);
                c.setCellValue(alCols[i]);
                c.setCellStyle(boldStyle);
            }
            int ar = 1;
            for (AlerteCouturiereDto a : rapport.alertes()) {
                Row row = alSheet.createRow(ar++);
                row.createCell(0).setCellValue(a.matricule());
                row.createCell(1).setCellValue(a.nom());
                row.createCell(2).setCellValue(a.ligne());
                row.createCell(3).setCellValue(a.shift() != null ? a.shift() : "—");
                row.createCell(4).setCellValue(a.heureDebut());
                row.createCell(5).setCellValue(a.nbDefauts());
                for (int c = 0; c < alCols.length; c++) row.getCell(c).setCellStyle(rougeStyle);
            }
            for (int c = 0; c < alCols.length; c++) alSheet.autoSizeColumn(c);

            wb.write(out);
            return out.toByteArray();
        }
    }

    @Override
    public byte[] exportRapportPdf(String projet, String ligne, String dateDebut, String dateFin) throws Exception {
        DefautCouturiereRapportDto rapport = getRapport(projet, ligne, dateDebut, dateFin);

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A4, 36, 36, 54, 36);
        PdfWriter.getInstance(doc, out);
        doc.open();

        Font titleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 16);
        Font sectionFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 12);
        Font normalFont = FontFactory.getFont(FontFactory.HELVETICA, 10);

        doc.add(new Paragraph("Rapport Défauts par Couturière — " + rapport.projet()
                + (rapport.ligne() != null ? " / " + rapport.ligne() : ""), titleFont));
        doc.add(new Paragraph("Période : " + rapport.dateDebut() + " au " + rapport.dateFin(), normalFont));
        doc.add(new Paragraph("Généré le " + rapport.generatedAt(), normalFont));
        doc.add(Chunk.NEWLINE);

        doc.add(new Paragraph("Indicateurs clés", sectionFont));
        PdfPTable kpiTable = new PdfPTable(2);
        kpiTable.setWidthPercentage(100);
        addKpiRow(kpiTable, "Total codes défauts", String.valueOf(rapport.kpis().totalDefauts()));
        addKpiRow(kpiTable, "Couturière la plus en défaut",
                rapport.kpis().couturierePlusDefauts() != null
                        ? rapport.kpis().couturierePlusDefauts() + " (" + rapport.kpis().couturierePlusDefautsTotal() + ")" : "—");
        addKpiRow(kpiTable, "Poste le plus problématique",
                rapport.kpis().posteProblematique() != null
                        ? rapport.kpis().posteProblematique() + " (" + rapport.kpis().posteProblematiqueTotal() + ")" : "—");
        addKpiRow(kpiTable, "Nombre d'alertes", String.valueOf(rapport.kpis().nbAlertes()));
        doc.add(kpiTable);
        doc.add(Chunk.NEWLINE);

        doc.add(new Paragraph("Synthèse par couturière", sectionFont));
        if (rapport.synthese().isEmpty()) {
            doc.add(new Paragraph("Aucune donnée sur la période.", normalFont));
        } else {
            PdfPTable synTable = new PdfPTable(new float[]{1.3f, 2f, 1f});
            synTable.setWidthPercentage(100);
            for (String h : new String[]{"Matricule", "Nom", "Total"}) {
                PdfPCell hc = new PdfPCell(new Phrase(h, sectionFont));
                hc.setBackgroundColor(new Color(240, 240, 240));
                synTable.addCell(hc);
            }
            for (CouturiereSyntheseDto s : rapport.synthese()) {
                synTable.addCell(pdfCell(s.matricule(), normalFont, Color.WHITE));
                synTable.addCell(pdfCell(s.nom(), normalFont, Color.WHITE));
                synTable.addCell(pdfCell(String.valueOf(s.total()), normalFont, Color.WHITE));
            }
            doc.add(synTable);
        }
        doc.add(Chunk.NEWLINE);

        doc.add(new Paragraph("Alertes — 3 codes défauts / heure calendaire", sectionFont));
        if (rapport.alertes().isEmpty()) {
            doc.add(new Paragraph("Aucune alerte détectée sur la période.", normalFont));
        } else {
            PdfPTable alTable = new PdfPTable(new float[]{1.3f, 2f, 1f, 1.2f, 1.5f, 1f});
            alTable.setWidthPercentage(100);
            for (String h : new String[]{"Matricule", "Nom", "Ligne", "Shift", "Heure", "Nb défauts"}) {
                PdfPCell hc = new PdfPCell(new Phrase(h, sectionFont));
                hc.setBackgroundColor(new Color(240, 240, 240));
                alTable.addCell(hc);
            }
            Color bg = new Color(254, 226, 226);
            for (AlerteCouturiereDto a : rapport.alertes()) {
                alTable.addCell(pdfCell(a.matricule(), normalFont, bg));
                alTable.addCell(pdfCell(a.nom(), normalFont, bg));
                alTable.addCell(pdfCell(a.ligne(), normalFont, bg));
                alTable.addCell(pdfCell(a.shift() != null ? a.shift() : "—", normalFont, bg));
                alTable.addCell(pdfCell(a.heureDebut(), normalFont, bg));
                alTable.addCell(pdfCell(String.valueOf(a.nbDefauts()), normalFont, bg));
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
        PdfPCell cell = new PdfPCell(new Phrase(text != null ? text : "—", font));
        cell.setBackgroundColor(bg);
        return cell;
    }

    private void writeKeyValueRow(Sheet sheet, int rowIdx, CellStyle labelStyle, String label, String value) {
        Row row = sheet.createRow(rowIdx);
        Cell c0 = row.createCell(0);
        c0.setCellValue(label);
        if (labelStyle != null) c0.setCellStyle(labelStyle);
        row.createCell(1).setCellValue(value);
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    private record PivotResult(Map<Long, String> matriculeById, Map<Long, String> nomById,
                               Map<Long, Map<String, Long>> parPosteById, Set<String> postes) {}

    /** Pivote les lignes plates (COUTURIERE_ID, MATRICULE, NOM, POSTE_NOM, NB) en structures par couturière. */
    private PivotResult pivot(List<Map<String, Object>> rows) {
        Map<Long, String> matriculeById = new LinkedHashMap<>();
        Map<Long, String> nomById = new LinkedHashMap<>();
        Map<Long, Map<String, Long>> parPosteById = new LinkedHashMap<>();
        Set<String> postes = new TreeSet<>();

        for (Map<String, Object> row : rows) {
            long cid = ((Number) row.get("COUTURIERE_ID")).longValue();
            String poste = String.valueOf(row.get("POSTE_NOM"));
            long nb = ((Number) row.get("NB")).longValue();
            matriculeById.putIfAbsent(cid, str(row.get("MATRICULE")));
            nomById.putIfAbsent(cid, str(row.get("NOM")));
            parPosteById.computeIfAbsent(cid, k -> new LinkedHashMap<>()).merge(poste, nb, Long::sum);
            postes.add(poste);
        }
        return new PivotResult(matriculeById, nomById, parPosteById, postes);
    }

    private AlerteCouturiereDto toAlerteDto(Map<String, Object> row) {
        return new AlerteCouturiereDto(
                ((Number) row.get("ID")).longValue(),
                ((Number) row.get("COUTURIERE_ID")).longValue(),
                str(row.get("MATRICULE")), str(row.get("NOM")), str(row.get("PROJET")),
                str(row.get("LIGNE")), str(row.get("SHIFT")), str(row.get("HEURE_DEBUT")),
                ((Number) row.get("NB_DEFAUTS")).longValue(),
                str(row.get("CREATED_AT")), str(row.get("UPDATED_AT")));
    }

    private String normalizeShift(String shift) {
        if (shift == null || shift.isBlank()) return null;
        String s = shift.trim().toUpperCase();
        if (!SHIFT_HOURS.containsKey(s))
            throw new IllegalArgumentException("Shift invalide: " + shift + ". Valeurs acceptées: MATIN, APRES_MIDI");
        return s;
    }

    private String shiftDeLHeure(int heure) {
        for (Map.Entry<String, int[]> e : SHIFT_HOURS.entrySet())
            if (heure >= e.getValue()[0] && heure < e.getValue()[1]) return e.getKey();
        return null; // heures de nuit, hors MATIN/APRES_MIDI
    }

    /** [debut, fin[ : journée entière si shift non précisé, sinon bornée aux heures du shift. */
    private LocalDateTime[] resolveRange(LocalDate d, String shiftClean) {
        LocalDateTime dayStart = d.atStartOfDay();
        if (shiftClean != null) {
            int[] hours = SHIFT_HOURS.get(shiftClean);
            return new LocalDateTime[]{dayStart.plusHours(hours[0]), dayStart.plusHours(hours[1])};
        }
        return new LocalDateTime[]{dayStart, dayStart.plusDays(1)};
    }

    private LocalDate parseDateOrToday(String date) {
        return (date != null && !date.isBlank()) ? LocalDate.parse(date) : LocalDate.now(TUNIS);
    }

    private String str(Object o) {
        return o != null ? String.valueOf(o) : null;
    }
}
