package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.dto.ComptageHoraireDto;
import com.adient.firewall.dto.CouturiereDto;
import com.adient.firewall.dto.DeliberaRecordDto;
import com.adient.firewall.dto.DeliberaReturnRequest;
import com.adient.firewall.repository.DeliberaRepository;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.IDefautCouturiereService;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/delibera")
@RequiredArgsConstructor
@Slf4j
public class DeliberaController {

    private final DeliberaRepository repo;
    private final QualityRepository  qRepo;
    private final IDefautCouturiereService defautCouturiereSvc;

    // ─── KPIs ────────────────────────────────────────────────────────────────

    @GetMapping("/kpis")
    public ResponseEntity<ApiResponse<Map<String, Object>>> kpis(
            @RequestParam(required = false) String projet) {
        return ResponseEntity.ok(ApiResponse.ok(repo.getKpis(projet)));
    }

    @GetMapping("/dashboard/overview")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getDashboardOverview(
            @RequestParam(required = false) String projet,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        List<Map<String, Object>> rows = repo.countRecordsByDay(projet, dateFrom, dateTo);
        Map<String, Long> trend = new LinkedHashMap<>();
        long total = 0;
        for (Map<String, Object> row : rows) {
            String day = String.valueOf(row.get("JOUR"));
            long count = ((Number) row.get("CNT")).longValue();
            trend.put(day, count);
            total += count;
        }
        return ResponseEntity.ok(ApiResponse.ok(Map.of("total", total, "trend", trend)));
    }

    @GetMapping("/dashboard/hourly")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getHourlyDashboard(
            @RequestParam(required = false) String date) {
        LocalDate selectedDate = parseDate(date);
        String dateValue = selectedDate.toString();
        Map<String, Map<String, Object>> rowsByKey = new TreeMap<>();
        for (Map<String, Object> row : repo.getHourlyOkNok(dateValue)) {
            String key = row.get("PROJET") + "|" + row.get("LIGNE") + "|" + row.get("HEURE");
            Map<String, Object> result = new LinkedHashMap<>(row);
            result.put("TARGET", 0);
            rowsByKey.put(key, result);
        }
        for (Map<String, Object> target : repo.getHourlyTargets(dateValue)) {
            String key = target.get("PROJET") + "|" + target.get("LIGNE") + "|" + target.get("HEURE");
            Map<String, Object> result = rowsByKey.computeIfAbsent(key, ignored -> {
                Map<String, Object> empty = new LinkedHashMap<>();
                empty.put("PROJET", target.get("PROJET"));
                empty.put("LIGNE", target.get("LIGNE"));
                empty.put("HEURE", target.get("HEURE"));
                empty.put("OK", 0);
                empty.put("NOK", 0);
                return empty;
            });
            result.put("TARGET", target.get("TARGET"));
        }
        return ResponseEntity.ok(ApiResponse.ok(Map.of("date", dateValue, "rows", rowsByKey.values())));
    }

    @PutMapping("/dashboard/hourly/target")
    @PreAuthorize("@permSvc.hasAccess(authentication.details['role'], 'delibera', 'write')")
    public ResponseEntity<ApiResponse<Void>> saveHourlyTarget(@RequestBody Map<String, Object> body) {
        String projet = body.get("projet") instanceof String value ? value.trim().toUpperCase() : "";
        String ligne = body.get("ligne") instanceof String value ? value.trim().toUpperCase() : "";
        String date = body.get("date") instanceof String value ? value : "";
        Integer heure = body.get("heure") instanceof Number value ? value.intValue() : null;
        Integer target = body.get("target") instanceof Number value ? value.intValue() : null;

        if (projet.isBlank() || ligne.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Projet et ligne sont requis"));
        if (heure == null || heure < 0 || heure > 23)
            return ResponseEntity.badRequest().body(ApiResponse.error("L'heure doit être comprise entre 0 et 23"));
        if (target == null || target < 0)
            return ResponseEntity.badRequest().body(ApiResponse.error("Le target doit être un nombre positif ou nul"));

        LocalDate selectedDate = parseDate(date);
        repo.upsertHourlyTarget(selectedDate.toString(), projet, ligne, heure, target, currentUser());
        return ResponseEntity.ok(ApiResponse.ok(null, "Target horaire enregistré"));
    }

    private LocalDate parseDate(String date) {
        if (date == null || date.isBlank()) return LocalDate.now(TUNIS);
        try {
            return LocalDate.parse(date);
        } catch (java.time.format.DateTimeParseException e) {
            throw new IllegalArgumentException("Date invalide : format attendu YYYY-MM-DD");
        }
    }

    // ─── Couturières ─────────────────────────────────────────────────────────

    @GetMapping("/couturieres")
    public ResponseEntity<ApiResponse<List<CouturiereDto>>> getCouturieres(
            @RequestParam(required = false) String projet,
            @RequestParam(required = false) String equipe) {
        return ResponseEntity.ok(ApiResponse.ok(repo.findCouturieres(projet, equipe)));
    }

    @PostMapping("/couturieres")
    public ResponseEntity<ApiResponse<Map<String, Long>>> createCouturiere(
            @RequestBody CouturiereDto dto) {
        if (dto.matricule() == null || dto.matricule().isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Matricule requis"));
        if (dto.nom() == null || dto.nom().isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Nom requis"));
        long id = repo.insertCouturiere(dto);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("id", id), "Couturière ajoutée"));
    }

    @PutMapping("/couturieres/{id}")
    public ResponseEntity<ApiResponse<Void>> updateCouturiere(
            @PathVariable Long id,
            @RequestBody CouturiereDto dto) {
        CouturiereDto merged = new CouturiereDto(id, dto.matricule(), dto.nom(),
                dto.projet(), dto.equipe(), dto.actif());
        repo.updateCouturiere(merged);
        return ResponseEntity.ok(ApiResponse.ok(null, "Couturière mise à jour"));
    }

    @DeleteMapping("/couturieres/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteCouturiere(@PathVariable Long id) {
        repo.deleteCouturiere(id);
        return ResponseEntity.ok(ApiResponse.ok(null, "Couturière supprimée"));
    }

    @PostMapping("/couturieres/import")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> importCouturieres(
            @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) body.get("rows");
        if (rows == null || rows.isEmpty())
            return ResponseEntity.badRequest().body(ApiResponse.error("Aucune donnée à importer"));

        List<CouturiereDto> list = rows.stream()
            .filter(r -> r.get("MATRICULE") != null && r.get("NOM") != null)
            .map(r -> new CouturiereDto(
                null,
                String.valueOf(r.get("MATRICULE")),
                String.valueOf(r.get("NOM")),
                r.get("PROJET") != null ? String.valueOf(r.get("PROJET")) : null,
                r.get("EQUIPE")  != null ? String.valueOf(r.get("EQUIPE"))  : null,
                parseActif(r.get("ACTIF"))))
            .collect(Collectors.toList());

        if (list.isEmpty())
            return ResponseEntity.badRequest().body(ApiResponse.error("Aucune ligne valide à importer"));
        Map<String, Integer> result = repo.importCouturieres(list);
        return ResponseEntity.ok(ApiResponse.ok(result,
                result.get("inserted") + " couturière(s) importée(s), " + result.get("skipped") + " ignorée(s)"));
    }

    private int parseActif(Object value) {
        if (value == null || value.toString().isBlank()) return 1;
        String actif = value.toString().trim();
        if (actif.equalsIgnoreCase("0") || actif.equalsIgnoreCase("false")
                || actif.equalsIgnoreCase("non") || actif.equalsIgnoreCase("inactif")) return 0;
        return 1;
    }

    // ─── Barcode lookup ───────────────────────────────────────────────────────

    @GetMapping("/barcode/{code}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> lookupBarcode(
            @PathVariable String code) {
        // 1. Check for an existing open (NOT_RETURNED) record for this barcode
        Optional<Map<String, Object>> existingRecord = repo.findActiveRecordByBarcode(code);
        if (existingRecord.isPresent()) {
            Map<String, Object> r = existingRecord.get();
            Map<String, Object> result = new HashMap<>();
            result.put("found",         true);
            result.put("hasOpenRecord", true);
            result.put("recordId",  r.get("ID"));
            result.put("projet",    r.get("PROJET"));
            result.put("reference", r.get("REFERENCE"));
            result.put("version",   r.get("VERSION"));
            result.put("ligne",     r.get("LIGNE"));
            return ResponseEntity.ok(ApiResponse.ok(result));
        }

        // 2. Check if piece was already returned — block rescan permanently
        if (repo.hasReturnedRecord(code)) {
            Map<String, Object> blocked = new HashMap<>();
            blocked.put("found",             true);
            blocked.put("hasOpenRecord",     false);
            blocked.put("wasReturnedBefore", true);
            return ResponseEntity.ok(ApiResponse.ok(blocked));
        }

        // 3. Look up the barcode in project reference tables (same logic as Firewall/CSL)
        List<String> projectNames = qRepo.getProjectNames();
        Optional<Map<String, Object>> barcodeInfo = qRepo.lookupBarcode(projectNames, code);
        if (barcodeInfo.isPresent()) {
            Map<String, Object> info = barcodeInfo.get();
            Map<String, Object> result = new HashMap<>();
            result.put("found",         true);
            result.put("hasOpenRecord", false);
            result.put("projet",      info.get("TABLE_NAME"));
            result.put("reference",   info.getOrDefault("REF_DETAIL", ""));
            result.put("version",     info.get("VERSION"));
            result.put("designation", info.get("DESIGNATION"));
            result.put("ligne",       info.get("LIGNE"));
            result.put("pdef",        info.get("PDEF"));
            return ResponseEntity.ok(ApiResponse.ok(result));
        }

        return ResponseEntity.ok(ApiResponse.ok(Map.of("found", false)));
    }

    // ─── Records ─────────────────────────────────────────────────────────────

    @GetMapping("/records/users")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listUsers(
            @RequestParam(required = false) String projet) {
        return ResponseEntity.ok(ApiResponse.ok(repo.listCreatedByUsers(projet)));
    }

    @GetMapping("/records")
    public ResponseEntity<ApiResponse<Map<String, Object>>> listRecords(
            @RequestParam(required = false) String projet,
            @RequestParam(required = false) String statut,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String refDetail,
            @RequestParam(required = false) String shift,
            @RequestParam(required = false) String createdBy,
            @RequestParam(defaultValue = "1")   int page,
            @RequestParam(defaultValue = "50")  int limit) {

        int total  = repo.countRecordsDelibera(projet, statut, dateFrom, dateTo, refDetail, shift, createdBy);
        List<Map<String, Object>> rows = repo.listRecords(projet, statut, dateFrom, dateTo, refDetail, shift, createdBy, page, limit);

        List<Map<String, Object>> enriched = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> rec = new LinkedHashMap<>(row);
            long recId = toLong(row.get("ID"));
            rec.put("defauts", mapDefauts(repo.findDefautsByRecordId(recId)));
            enriched.add(rec);
        }

        int totalPages = (int) Math.ceil((double) total / limit);
        Map<String, Object> pagination = Map.of(
            "currentPage", page, "totalPages", Math.max(1, totalPages),
            "totalRecords", total, "recordsPerPage", limit);

        return ResponseEntity.ok(ApiResponse.ok(Map.of("records", enriched, "pagination", pagination)));
    }

    @PostMapping("/records")
    public ResponseEntity<ApiResponse<Map<String, Long>>> createRecord(
            @RequestBody Map<String, Object> body) {

        String barcode       = (String) body.get("barcode");
        String projet        = (String) body.get("projet");
        String reference     = (String) body.get("reference");
        String version       = (String) body.get("version");
        String ligne         = (String) body.get("ligne");
        String checkpoint    = (String) body.get("checkpoint");
        Long   posteId       = body.get("posteId") instanceof Number n ? n.longValue() : null;
        Long   couturiereId  = body.get("couturiereId") instanceof Number n ? n.longValue() : null;
        String statutReprise = body.get("statutReprise") instanceof String s ? s : null;

        if (barcode == null || barcode.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Barcode requis"));
        if (statutReprise != null && !"RETURNED".equals(statutReprise) && !"NOT_RETURNED".equals(statutReprise))
            return ResponseEntity.badRequest().body(ApiResponse.error("Statut de reprise invalide"));

        long recId = repo.insertRecord(barcode, projet, reference, version, ligne, posteId, couturiereId, currentUser(), checkpoint, statutReprise);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> defauts = (List<Map<String, Object>>) body.getOrDefault("defauts", Collections.emptyList());
        for (Map<String, Object> d : defauts) {
            repo.insertRecordDefaut(recId,
                (String) d.get("codeDefaut"),
                (String) d.get("descDefaut"),
                "INITIAL");
        }
        if (!defauts.isEmpty()) defautCouturiereSvc.checkAlerte(repo.findRecordById(recId));

        return ResponseEntity.ok(ApiResponse.ok(Map.of("id", recId), "Enregistrement créé"));
    }

    @GetMapping("/records/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRecord(@PathVariable Long id) {
        Map<String, Object> rec = new LinkedHashMap<>(repo.findRecordById(id));
        rec.put("defauts", mapDefauts(repo.findDefautsByRecordId(id)));
        return ResponseEntity.ok(ApiResponse.ok(rec));
    }

    @PutMapping("/records/{id}/verify")
    @Transactional("oracleTransactionManager")
    public ResponseEntity<ApiResponse<Map<String, Object>>> verifyRecord(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {

        if (!"NOT_RETURNED".equals(repo.lockRecordStatus(id))) {
            throw new IllegalStateException("Cette coiffe est déjà OK. Vérification refusée.");
        }
        Set<Long> existingIds = repo.findDefautsByRecordId(id).stream()
                .map(d -> ((Number) d.get("ID")).longValue()).collect(Collectors.toSet());
        // Update existing defauts verifiés
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> defautsVerifies =
            (List<Map<String, Object>>) body.getOrDefault("defautsVerifies", Collections.emptyList());
        for (Map<String, Object> dv : defautsVerifies) {
            if (!(dv.get("id") instanceof Number n) || !existingIds.contains(n.longValue())) {
                throw new IllegalArgumentException("Un défaut sélectionné n'appartient pas à cette coiffe");
            }
        }
        for (Map<String, Object> dv : defautsVerifies) {
            Long defId    = dv.get("id") instanceof Number n ? n.longValue() : null;
            Boolean verif = Boolean.TRUE.equals(dv.get("verifie"));
            if (defId != null) repo.updateDefautVerifie(defId, verif);
        }

        // Add new defauts
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> newDefauts =
            (List<Map<String, Object>>) body.getOrDefault("newDefauts", Collections.emptyList());
        for (Map<String, Object> nd : newDefauts) {
            repo.insertRecordDefaut(id,
                (String) nd.get("codeDefaut"),
                (String) nd.get("descDefaut"),
                "VERIFY");
        }
        if (!newDefauts.isEmpty()) defautCouturiereSvc.checkAlerte(repo.findRecordById(id));

        // Recalculate status: RETURNED only if ALL defauts are verified
        List<Map<String, Object>> allDefauts = repo.findDefautsByRecordId(id);
        boolean allVerified = !allDefauts.isEmpty() &&
            allDefauts.stream().allMatch(d -> {
                Object v = d.get("VERIFIE");
                return v instanceof Number n && n.intValue() == 1;
            });

        String newStatut = allVerified ? "RETURNED" : "NOT_RETURNED";
        if (allVerified) repo.returnToOk(id, new DeliberaReturnRequest(null, List.of()), currentUser());
        else repo.updateRecordStatut(id, newStatut);

        Map<String, Object> result = new LinkedHashMap<>(repo.findRecordById(id));
        result.put("defauts", mapDefauts(repo.findDefautsByRecordId(id)));
        result.put("statut", newStatut);

        return ResponseEntity.ok(ApiResponse.ok(result, allVerified ? "Pièce retournée" : "Défauts restants"));
    }

    @PutMapping("/records/{id}/return-to-ok")
    public ResponseEntity<ApiResponse<Void>> returnToOk(
            @PathVariable Long id, @RequestBody DeliberaReturnRequest request) {
        repo.returnToOk(id, request, currentUser());
        return ResponseEntity.ok(ApiResponse.ok(null, "Coiffe passée de NOK à OK"));
    }

    // ─── Update record (poste, couturière, défauts) ──────────────────────────

    @PutMapping("/records/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateRecord(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        Long posteId      = body.get("posteId")      instanceof Number n ? n.longValue() : null;
        Long couturiereId = body.get("couturiereId") instanceof Number n ? n.longValue() : null;
        repo.updateRecord(id, posteId, couturiereId);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> defauts = (List<Map<String, Object>>) body.get("defauts");
        if (defauts != null) {
            repo.deleteRecordDefauts(id);
            for (Map<String, Object> d : defauts) {
                repo.insertRecordDefaut(id,
                    (String) d.get("codeDefaut"),
                    (String) d.get("descDefaut"),
                    "INITIAL");
            }
            if (!defauts.isEmpty()) defautCouturiereSvc.checkAlerte(repo.findRecordById(id));
        }
        Map<String, Object> result = new LinkedHashMap<>(repo.findRecordById(id));
        result.put("defauts", mapDefauts(repo.findDefautsByRecordId(id)));
        return ResponseEntity.ok(ApiResponse.ok(result, "Enregistrement mis à jour"));
    }

    // ─── Delete record ────────────────────────────────────────────────────────

    @DeleteMapping("/records/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteRecord(@PathVariable Long id) {
        repo.deleteRecord(id);
        return ResponseEntity.ok(ApiResponse.ok(null, "Enregistrement supprimé"));
    }

    // ─── Patch status (RETURNED / NOT_RETURNED) ───────────────────────────────

    @PatchMapping("/records/{id}/status")
    public ResponseEntity<ApiResponse<Map<String, Object>>> patchStatus(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        String statut = (String) body.get("statut");
        if (!"RETURNED".equals(statut) && !"NOT_RETURNED".equals(statut))
            return ResponseEntity.badRequest().body(ApiResponse.error("Statut invalide : " + statut));
        if ("RETURNED".equals(statut)) {
            throw new IllegalArgumentException("Confirmez le retour NOK vers OK avec un justificatif ou les défauts résolus");
        }
        repo.updateRecordStatut(id, statut);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("id", id, "statut", statut), "Statut mis à jour"));
    }

    // ─── Comptage horaire des scans ────────────────────────────────────────────

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final int MATIN_DEBUT = 6;   // 06:00
    private static final int MATIN_FIN = 14;    // exclu, dernier créneau 13:00-14:00
    private static final int APRES_MIDI_FIN = 22; // exclu, dernier créneau 21:00-22:00

    @GetMapping("/scans/comptage-horaire")
    public ResponseEntity<ApiResponse<ComptageHoraireDto>> comptageHoraire(
            @RequestParam String projet,
            @RequestParam String ligne,
            @RequestParam(required = false) String date) {

        if (projet == null || projet.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Projet requis"));
        if (ligne == null || ligne.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("Ligne requise"));

        String jour = (date != null && !date.isBlank()) ? date : LocalDate.now(TUNIS).toString();

        Map<Integer, Long> countsParHeure = new HashMap<>();
        for (Map<String, Object> row : repo.countScansParHeure(projet, ligne, jour)) {
            int heure = ((Number) row.get("HEURE")).intValue();
            long cnt = ((Number) row.get("CNT")).longValue();
            countsParHeure.put(heure, cnt);
        }

        List<ComptageHoraireDto.CreneauCountDto> matin = new ArrayList<>();
        long totalMatin = 0;
        for (int h = MATIN_DEBUT; h < MATIN_FIN; h++) {
            long cnt = countsParHeure.getOrDefault(h, 0L);
            matin.add(new ComptageHoraireDto.CreneauCountDto(creneauLabel(h), cnt));
            totalMatin += cnt;
        }

        List<ComptageHoraireDto.CreneauCountDto> apresMidi = new ArrayList<>();
        long totalApresMidi = 0;
        for (int h = MATIN_FIN; h < APRES_MIDI_FIN; h++) {
            long cnt = countsParHeure.getOrDefault(h, 0L);
            apresMidi.add(new ComptageHoraireDto.CreneauCountDto(creneauLabel(h), cnt));
            totalApresMidi += cnt;
        }

        ComptageHoraireDto result = new ComptageHoraireDto(
                projet, ligne, jour, matin, apresMidi, totalMatin, totalApresMidi, totalMatin + totalApresMidi);

        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    private String creneauLabel(int heure) {
        return String.format("%02d:00-%02d:00", heure, heure + 1);
    }

    // ─── Postes (proxy to existing postes table) ──────────────────────────────

    @GetMapping("/postes")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getPostes(
            @RequestParam(required = false) String projet) {
        return ResponseEntity.ok(ApiResponse.ok(repo.findPostes(projet)));
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getDetails() instanceof Claims claims) {
            return claims.getSubject();
        }
        return auth != null ? auth.getName() : "unknown";
    }

    private List<Map<String, Object>> mapDefauts(List<Map<String, Object>> rows) {
        return rows.stream().map(d -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",          d.get("ID"));
            m.put("recordId",    d.get("RECORD_ID"));
            m.put("codeDefaut",  d.get("CODE_DEFAUT"));
            m.put("descDefaut",  d.get("DESC_DEFAUT"));
            m.put("verifie",     d.get("VERIFIE") instanceof Number n && n.intValue() == 1);
            m.put("addedAt",     d.get("ADDED_AT"));
            return m;
        }).collect(Collectors.toList());
    }

    private long toLong(Object o) {
        return o instanceof Number n ? n.longValue() : 0L;
    }
}
