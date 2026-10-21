package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.repository.AuditProduitRepository;
import com.adient.firewall.repository.NotificationRepository;
import com.adient.firewall.repository.QualityRepository;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Audit Produit (Check List SAGE-FOR-QUA-25 style)
 *
 * GET    /api/audit-produit              → list (paginé)
 * POST   /api/audit-produit              → create + notify
 * GET    /api/audit-produit/{id}         → get one
 * PUT    /api/audit-produit/{id}         → update + re-notify
 * DELETE /api/audit-produit/{id}         → delete
 * POST   /api/audit-produit/{id}/verify  → validate or reject
 */
@RestController
@RequestMapping("/api/audit-produit")
@RequiredArgsConstructor
@Slf4j
public class AuditProduitController {

    private final AuditProduitRepository repo;
    private final NotificationRepository notifRepo;
    private final QualityRepository      qRepo;

    // ─── Dedicated project list for audit forms ───────────────────────────────

    @GetMapping("/projets")
    public ResponseEntity<ApiResponse<List<String>>> projets() {
        List<String> names = repo.getDistinctProjets();
        if (names.isEmpty()) {
            names = qRepo.getProjectNames();
        }
        return ResponseEntity.ok(ApiResponse.ok(names));
    }

    // ─── List ─────────────────────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> list(
            @RequestParam(required = false) String projet,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String resultat,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1")  int page,
            @RequestParam(defaultValue = "10") int limit) {

        int total = repo.count(projet, dateFrom, dateTo, resultat, status);
        List<Map<String, Object>> rows = repo.list(projet, dateFrom, dateTo, resultat, status, page, limit);
        int totalPages = (int) Math.ceil((double) total / limit);

        Map<String, Object> pagination = Map.of(
            "currentPage", page, "totalPages", Math.max(1, totalPages),
            "totalRecords", total, "recordsPerPage", limit);

        return ResponseEntity.ok(ApiResponse.ok(Map.of("audits", rows, "pagination", pagination)));
    }

    // ─── Get one ──────────────────────────────────────────────────────────────

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getOne(@PathVariable Long id) {
        return repo.findById(id)
            .map(f -> ResponseEntity.ok(ApiResponse.ok(f)))
            .orElseGet(() -> ResponseEntity.status(404).body(ApiResponse.error("Audit introuvable")));
    }

    // ─── Create ───────────────────────────────────────────────────────────────

    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, Long>>> create(@RequestBody Map<String, Object> body) {
        String projet        = str(body, "projet");
        String semaine       = str(body, "semaine");
        String dateAudit     = str(body, "dateAudit");
        String auditeur      = str(body, "auditeur");
        String pn            = str(body, "pn");
        String dr            = str(body, "dr");
        String produitAudite = str(body, "produitAudite");
        String objet         = str(body, "objet");
        String formData      = str(body, "formData");
        String resultat      = str(body, "resultat");
        String filledBy      = currentUser();

        if (formData == null || formData.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.error("formData requis"));

        long id = repo.insert(projet, semaine, dateAudit, auditeur, pn, dr, produitAudite, objet,
                              formData, resultat, filledBy);

        sendNotification(id, projet, auditeur != null ? auditeur : filledBy, "Nouvel audit produit soumis");

        return ResponseEntity.ok(ApiResponse.ok(Map.of("id", id), "Audit produit enregistré"));
    }

    // ─── Update ───────────────────────────────────────────────────────────────

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> update(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {

        if (repo.findById(id).isEmpty())
            return ResponseEntity.status(404).body(ApiResponse.error("Audit introuvable"));

        String projet        = str(body, "projet");
        String semaine       = str(body, "semaine");
        String dateAudit     = str(body, "dateAudit");
        String auditeur      = str(body, "auditeur");
        String pn            = str(body, "pn");
        String dr            = str(body, "dr");
        String produitAudite = str(body, "produitAudite");
        String objet         = str(body, "objet");
        String formData      = str(body, "formData");
        String resultat      = str(body, "resultat");
        String filledBy      = currentUser();

        repo.update(id, projet, semaine, dateAudit, auditeur, pn, dr, produitAudite, objet, formData, resultat);
        sendNotification(id, projet, auditeur != null ? auditeur : filledBy, "Audit produit modifié et resoumis");

        return ResponseEntity.ok(ApiResponse.ok(null, "Audit mis à jour"));
    }

    // ─── Delete ───────────────────────────────────────────────────────────────

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        if (repo.findById(id).isEmpty())
            return ResponseEntity.status(404).body(ApiResponse.error("Audit introuvable"));
        repo.delete(id);
        return ResponseEntity.ok(ApiResponse.ok(null, "Audit supprimé"));
    }

    // ─── Verify ───────────────────────────────────────────────────────────────

    @PostMapping("/{id}/verify")
    public ResponseEntity<ApiResponse<Void>> verify(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {

        String status  = body.get("status");  // "VALIDATED" | "REJECTED"
        String comment = body.getOrDefault("comment", "");
        String verifiedBy = currentUser();

        if (!"VALIDATED".equals(status) && !"REJECTED".equals(status))
            return ResponseEntity.badRequest().body(ApiResponse.error("Status invalide (VALIDATED|REJECTED)"));

        if (repo.findById(id).isEmpty())
            return ResponseEntity.status(404).body(ApiResponse.error("Audit introuvable"));

        repo.verify(id, status, verifiedBy, comment);

        if ("REJECTED".equals(status)) {
            Map<String, Object> audit = repo.findById(id).get();
            String filledBy = (String) audit.get("FILLED_BY");
            String projet   = (String) audit.get("PROJET");
            String msg = "Votre audit produit (ID:" + id + ", Projet:" + projet +
                         ") a été rejeté. Motif: " + comment;
            notifRepo.insert("audit_produit_rejected", "audit_produit", id, projet,
                             msg, verifiedBy, filledBy != null ? filledBy : "");
        }

        return ResponseEntity.ok(ApiResponse.ok(null, "VALIDATED".equals(status) ? "Audit validé" : "Audit rejeté"));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private void sendNotification(Long formId, String projet, String auditeur, String action) {
        String msg = action + " — Projet: " + projet + " — Auditeur: " + auditeur;
        notifRepo.insert("audit_produit", "audit_produit", formId, projet, msg,
                         currentUser(), "admin,supervisor,ingenieur_qualite");
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return "unknown";
        if (auth.getDetails() instanceof Claims claims) {
            String mat = (String) claims.get("matricule");
            if (mat == null) mat = claims.getSubject();
            return mat != null ? mat : "unknown";
        }
        return auth.getName() != null ? auth.getName() : "unknown";
    }

    private String str(Map<String, Object> body, String key) {
        Object v = body.get(key);
        return v != null ? v.toString() : null;
    }
}
