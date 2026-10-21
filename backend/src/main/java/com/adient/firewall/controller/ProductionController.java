package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.service.interfaces.IProductionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Production quantity endpoints.
 *
 * POST   /api/production/qte
 * GET    /api/production/qte?projet=X&module=FIREWALL&dateFrom=&dateTo=
 * PUT    /api/production/qte/{id}
 * DELETE /api/production/qte/{id}
 * GET    /api/production/analyse?projet=X&module=FIREWALL&period=today|month|custom&dateFrom=&dateTo=
 */
@RestController
@RequestMapping("/api/production")
@RequiredArgsConstructor
public class ProductionController {

    private final IProductionService svc;

    @PostMapping("/qte")
    public ResponseEntity<ApiResponse<Map<String, Object>>> create(
            @RequestBody Map<String, Object> body,
            Authentication auth) {
        String projet     = str(body.get("projet"));
        String module     = str(body.get("module"));
        String dateProd   = str(body.get("dateProd"));
        long   qteGlobale = toLong(body.get("qteGlobale"));
        String saisiePar  = auth != null ? auth.getName() : null;
        return ResponseEntity.ok(ApiResponse.ok(svc.createQte(projet, module, dateProd, qteGlobale, saisiePar)));
    }

    @GetMapping("/qte")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> list(
            @RequestParam(required = false) String projet,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getQte(projet, module, dateFrom, dateTo)));
    }

    @PutMapping("/qte/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> update(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        long qteGlobale = toLong(body.get("qteGlobale"));
        return ResponseEntity.ok(ApiResponse.ok(svc.updateQte(id, qteGlobale)));
    }

    @DeleteMapping("/qte/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        svc.deleteQte(id);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @GetMapping("/analyse")
    public ResponseEntity<ApiResponse<Map<String, Object>>> analyse(
            @RequestParam String projet,
            @RequestParam String module,
            @RequestParam(defaultValue = "today") String period,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getAnalyse(projet, module, period, dateFrom, dateTo)));
    }

    private String str(Object o) { return o != null ? o.toString().trim() : ""; }
    private long   toLong(Object o) {
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(o.toString()); } catch (Exception e) { return 0L; }
    }
}
