package com.adient.firewall.service.impl;

import com.adient.firewall.dto.SuiviQualiteShiftCreneauDto;
import com.adient.firewall.dto.SuiviQualiteShiftDto;
import com.adient.firewall.dto.SuiviQualiteShiftLigneDto;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.ISuiviQualiteShiftService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * Dashboard "Suivi Qualité par Shift" — quantités OK/NOK de coiffes par ligne de production,
 * ventilées par créneau horaire, à partir de la table de scan FIREWALL_&lt;projet&gt; (colonne
 * RECORD_STATUS : 'OK' = coiffe OK, toute autre valeur, ex. 'Open' = coiffe NOK).
 * <p>
 * Modèle de shift propre à ce dashboard (distinct du MATIN/APRES_MIDI de
 * {@link SuiviQualiteServiceImpl}) : Shift 1 = 06h-16h, Shift 2 = 20h-06h (traverse minuit).
 */
@Service
@RequiredArgsConstructor
public class SuiviQualiteShiftServiceImpl implements ISuiviQualiteShiftService {

    private final QualityRepository qRepo;

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final DateTimeFormatter TS_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    // Bornes horaires par shift : {heureDebut, heureFin}. heureFin <= heureDebut => traverse minuit.
    private static final Map<Integer, int[]> SHIFT_BOUNDS = Map.of(
            1, new int[]{6, 16},
            2, new int[]{20, 6}
    );

    // Longueurs de préfixe BARCODE testées pour retrouver le PDEF, dans le même ordre que
    // QualityRepository.lookupBarcode (le format PDEF varie selon le projet).
    private static final int[] PDEF_PREFIX_LENGTHS = {12, 10, 14};
    private static final String SANS_LIGNE = "(Sans ligne)";

    @Override
    public SuiviQualiteShiftDto getShiftReport(String projet, Integer shift, String date, String ligneFiltre) {
        if (projet == null || projet.isBlank())
            throw new IllegalArgumentException("Projet requis");

        String pn = QualityRepository.safe(projet);
        String tableName = "FIREWALL_" + pn;
        if (!qRepo.tableExists(tableName))
            throw new NoSuchElementException("Projet introuvable: " + pn);

        int resolvedShift = (shift != null) ? shift : 1;
        int[] bounds = SHIFT_BOUNDS.get(resolvedShift);
        if (bounds == null)
            throw new IllegalArgumentException("Shift invalide: " + shift + ". Valeurs acceptées: 1, 2");

        LocalDate resolvedDate = (date != null && !date.isBlank()) ? LocalDate.parse(date) : LocalDate.now(TUNIS);
        boolean wraps = bounds[1] <= bounds[0];
        LocalDateTime debut = resolvedDate.atTime(bounds[0], 0);
        LocalDateTime fin = wraps ? resolvedDate.plusDays(1).atTime(bounds[1], 0) : resolvedDate.atTime(bounds[1], 0);

        String ligneFiltreClean = (ligneFiltre != null && !ligneFiltre.isBlank()) ? ligneFiltre.trim() : null;

        // Créneaux horaires du shift, dans l'ordre chronologique (traverse minuit pour le shift 2).
        List<Integer> heures = new ArrayList<>();
        int h = bounds[0];
        do {
            heures.add(h);
            h = (h + 1) % 24;
        } while (h != bounds[1]);

        // FIREWALL_<projet> n'a pas de colonne LIGNE : on résout la ligne de chaque BARCODE scanné
        // par correspondance de préfixe sur le PDEF de la table de référence projet (même logique
        // que QualityRepository.lookupBarcode), à partir d'une map préchargée en une requête
        // (évite le N+1 par barcode scanné).
        Map<String, String> pdefLigneMap = qRepo.getPdefLigneMap(pn);

        Map<String, Map<Integer, long[]>> countsByLigneHeure = new LinkedHashMap<>();
        for (Map<String, Object> row : qRepo.findBarcodeStatusParHeure(tableName,
                debut.format(TS_FMT), fin.format(TS_FMT))) {
            String barcode = row.get("BARCODE") != null ? String.valueOf(row.get("BARCODE")).trim() : "";
            if (barcode.isBlank()) continue;
            String ligne = resolveLigne(barcode, pdefLigneMap);
            if (ligneFiltreClean != null && !ligneFiltreClean.equalsIgnoreCase(ligne)) continue;

            int heure = LocalDateTime.parse(String.valueOf(row.get("DATEFW")), TS_FMT).getHour();
            long isOk = ((Number) row.get("IS_OK")).longValue();

            long[] c = countsByLigneHeure
                    .computeIfAbsent(ligne != null ? ligne : SANS_LIGNE, k -> new HashMap<>())
                    .computeIfAbsent(heure, k -> new long[2]);
            if (isOk == 1) c[0]++; else c[1]++;
        }

        List<String> lignes = new ArrayList<>(ligneFiltreClean != null
                ? List.of(ligneFiltreClean)
                : qRepo.getDistinctLignes(pn));
        // Scans dont le barcode ne correspond à aucune référence connue — affichés à part plutôt
        // que silencieusement exclus des totaux.
        if (ligneFiltreClean == null && countsByLigneHeure.containsKey(SANS_LIGNE)) {
            lignes.add(SANS_LIGNE);
        }

        List<String> creneaux = new ArrayList<>();
        for (int heure : heures) creneaux.add(creneauLabel(heure));

        List<SuiviQualiteShiftLigneDto> lignesResult = new ArrayList<>();
        long totalOkGlobal = 0, totalNokGlobal = 0;
        for (String ligne : lignes) {
            Map<Integer, long[]> hourCounts = countsByLigneHeure.getOrDefault(ligne, Map.of());
            List<SuiviQualiteShiftCreneauDto> creneauxLigne = new ArrayList<>();
            long totalOk = 0, totalNok = 0;
            for (int heure : heures) {
                long[] c = hourCounts.getOrDefault(heure, new long[]{0L, 0L});
                totalOk += c[0];
                totalNok += c[1];
                creneauxLigne.add(new SuiviQualiteShiftCreneauDto(creneauLabel(heure), heure, c[0], c[1]));
            }
            totalOkGlobal += totalOk;
            totalNokGlobal += totalNok;
            lignesResult.add(new SuiviQualiteShiftLigneDto(ligne, creneauxLigne, totalOk, totalNok));
        }

        return new SuiviQualiteShiftDto(
                pn, resolvedShift, resolvedDate.toString(),
                wraps ? resolvedDate.plusDays(1).toString() : resolvedDate.toString(),
                creneaux, lignesResult, totalOkGlobal, totalNokGlobal,
                LocalDateTime.now(TUNIS).format(TS_FMT));
    }

    private String creneauLabel(int heure) {
        return String.format("%02d:00-%02d:00", heure, (heure + 1) % 24);
    }

    /** Résout la ligne de production d'un barcode scanné par préfixe PDEF, null si aucune correspondance. */
    private String resolveLigne(String barcode, Map<String, String> pdefLigneMap) {
        for (int len : PDEF_PREFIX_LENGTHS) {
            if (barcode.length() < len) continue;
            String ligne = pdefLigneMap.get(barcode.substring(0, len));
            if (ligne != null) return ligne;
        }
        return null;
    }
}
