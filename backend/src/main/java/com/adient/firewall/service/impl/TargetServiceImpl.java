package com.adient.firewall.service.impl;

import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.repository.TargetRepository;
import com.adient.firewall.service.interfaces.ITargetService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@Service
@RequiredArgsConstructor
public class TargetServiceImpl implements ITargetService {

    private final TargetRepository targetRepo;
    private final QualityRepository qRepo;

    private static final Map<String, List<String>> SHIFT_SLOTS = Map.of(
        "MATIN", List.of(
            "06:00-07:00", "07:00-08:00", "08:00-09:00", "09:00-10:00",
            "10:00-11:00", "11:00-12:00", "12:00-13:00", "13:00-14:00"),
        "APRES_MIDI", List.of(
            "14:00-15:00", "15:00-16:00", "16:00-17:00", "17:00-18:00",
            "18:00-19:00", "19:00-20:00", "20:00-21:00", "21:00-22:00")
    );

    @Override
    public List<Map<String, Object>> listTargets() {
        return targetRepo.listHeaders();
    }

    @Override
    public Map<String, Object> getTargetDetail(long id) {
        Map<String, Object> header = targetRepo.findHeaderById(id)
                .orElseThrow(() -> new NoSuchElementException("Target introuvable: " + id));
        Map<String, Object> result = new LinkedHashMap<>(header);
        result.put("details", targetRepo.findDetailsByTargetId(id));
        return result;
    }

    @Override
    @Transactional
    public long createTarget(String projet, String shift, List<Map<String, Object>> cells, String createdBy) {
        String pn = QualityRepository.safe(projet);
        if (!qRepo.tableExists(pn)) throw new NoSuchElementException("Project not found: " + pn);

        String sh = shift == null ? "" : shift.trim().toUpperCase();
        List<String> slots = SHIFT_SLOTS.get(sh);
        if (slots == null) throw new IllegalArgumentException("Shift invalide: " + shift + ". Valeurs acceptées: MATIN, APRES_MIDI");

        List<String> lignes = qRepo.getDistinctLignes(pn);
        if (lignes.isEmpty()) throw new IllegalStateException("Aucune ligne de projet (LIGNE) pour le projet " + pn);

        Map<String, Double> values = new HashMap<>();
        for (Map<String, Object> c : cells) {
            Object ligne = c.get("ligneProjet");
            Object heure = c.get("heure");
            Object v = c.get("valeur");
            if (ligne == null || heure == null) continue;
            double d;
            try {
                d = (v == null || v.toString().isBlank()) ? 0d : Double.parseDouble(v.toString());
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("Valeur invalide pour " + ligne + "/" + heure + ": " + v);
            }
            values.put(ligne + "|" + heure, d);
        }

        long targetId = targetRepo.insertHeader(pn, sh, createdBy);
        for (String ligne : lignes) {
            for (String heure : slots) {
                double v = values.getOrDefault(ligne + "|" + heure, 0d);
                targetRepo.insertDetail(targetId, ligne, heure, v);
            }
        }
        return targetId;
    }

    @Override
    @Transactional
    public void updateTarget(long id, List<Map<String, Object>> cells) {
        targetRepo.findHeaderById(id)
                .orElseThrow(() -> new NoSuchElementException("Target introuvable: " + id));

        for (Map<String, Object> c : cells) {
            Object ligne = c.get("ligneProjet");
            Object heure = c.get("heure");
            Object v = c.get("valeur");
            if (ligne == null || heure == null) continue;
            double d;
            try {
                d = (v == null || v.toString().isBlank()) ? 0d : Double.parseDouble(v.toString());
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("Valeur invalide pour " + ligne + "/" + heure + ": " + v);
            }
            targetRepo.updateDetailValue(id, ligne.toString(), heure.toString(), d);
        }
    }

    @Override
    @Transactional
    public void deleteTarget(long id) {
        targetRepo.findHeaderById(id)
                .orElseThrow(() -> new NoSuchElementException("Target introuvable: " + id));
        targetRepo.deleteTarget(id);
    }
}
