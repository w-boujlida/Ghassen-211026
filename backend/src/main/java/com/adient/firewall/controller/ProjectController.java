package com.adient.firewall.controller;

import com.adient.firewall.dto.ApiResponse;
import com.adient.firewall.service.interfaces.IProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final IProjectService svc;

    /** All authenticated users can list projects. */
    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> getProjects() {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("projects", svc.getProjects())));
    }

    /** All authenticated users can view project refs. */
    @GetMapping("/{name}/refs")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRefs(
            @PathVariable String name,
            @RequestParam(defaultValue = "1")  int page,
            @RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(ApiResponse.ok(svc.getProjectRefs(name, page, limit)));
    }

    /** All authenticated users can view distinct "lignes de projet" (LIGNE). */
    @GetMapping("/{name}/lignes-projet")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getLignesProjet(@PathVariable String name) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("lignes", svc.getLignesProjet(name))));
    }

    /** Only ADMIN and SUPERVISEUR can create projects. */
    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR')")
    public ResponseEntity<ApiResponse<Void>> create(@RequestBody Map<String, String> body) {
        svc.createProject(body.get("name"));
        return ResponseEntity.ok(ApiResponse.ok(null,
                "Project '" + body.get("name").toUpperCase() + "' created successfully."));
    }

    /** Upsert refs: insert if PDEF not found, update if already exists. */
    @PostMapping("/{name}/refs/upsert")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> upsertRefs(
            @PathVariable String name,
            @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> refs = (List<Map<String, Object>>) body.get("refs");
        return ResponseEntity.ok(ApiResponse.ok(svc.upsertProjectRefs(name, refs)));
    }

    /** All non-RES_OPERATEUR can import refs (they can work inside projects). */
    @PostMapping("/{name}/refs/import")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> importRefs(
            @PathVariable String name,
            @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> refs = (List<Map<String, Object>>) body.get("refs");
        return ResponseEntity.ok(ApiResponse.ok(svc.importProjectRefs(name, refs)));
    }

    /** All non-RES_OPERATEUR can add refs. */
    @PostMapping("/{name}/refs")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Void>> addRef(
            @PathVariable String name,
            @RequestBody Map<String, Object> ref) {
        svc.addProjectRef(name, ref);
        return ResponseEntity.ok(ApiResponse.ok(null, "Reference added"));
    }

    /**
     * Update a single reference by ROWID. ROWID is passed as a query param, not a
     * path segment — Oracle's extended ROWID format can contain a literal '/',
     * which URL-encodes to '%2F' and gets blocked by Tomcat/Spring Security's
     * default path hardening when used as a path segment.
     */
    @PutMapping("/{name}/refs")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Void>> updateRef(
            @PathVariable String name,
            @RequestParam String rowid,
            @RequestBody Map<String, Object> ref) {
        svc.updateProjectRef(name, rowid, ref);
        return ResponseEntity.ok(ApiResponse.ok(null, "Référence mise à jour"));
    }

    /** Delete a single reference by ROWID (query param — see updateRef for why). */
    @DeleteMapping("/{name}/refs")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Void>> deleteRef(
            @PathVariable String name,
            @RequestParam String rowid) {
        svc.deleteProjectRef(name, rowid);
        return ResponseEntity.ok(ApiResponse.ok(null, "Référence supprimée"));
    }

    /** Only ADMIN can rename projects. */
    @PutMapping("/{name}/rename")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> rename(
            @PathVariable String name,
            @RequestBody Map<String, String> body) {
        svc.renameProject(name, body.get("new_name"));
        return ResponseEntity.ok(ApiResponse.ok(null,
                "Project renamed from '" + name + "' to '" + body.get("new_name") + "'."));
    }

    /** Only ADMIN can delete projects. */
    @DeleteMapping("/{name}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable String name) {
        svc.deleteProject(name);
        return ResponseEntity.ok(ApiResponse.ok(null, "Project '" + name + "' deleted."));
    }

    /**
     * Get verification messages for a reference. PDEF is a query param, not a path
     * segment — PDEF/reference codes can contain a literal '/', which URL-encodes
     * to '%2F' and gets blocked by Tomcat/Spring Security's default path hardening
     * when used as a path segment (see updateRef).
     */
    @GetMapping("/{name}/refs/messages")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRefMessages(
            @PathVariable String name,
            @RequestParam String pdef) {
        List<String> msgs = svc.getRefVerifMessages(name, pdef);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("messages", msgs)));
    }

    /** Set (replace) verification messages for a reference (PDEF query param — see getRefMessages). */
    @PutMapping("/{name}/refs/messages")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Void>> setRefMessages(
            @PathVariable String name,
            @RequestParam String pdef,
            @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<String> messages = (List<String>) body.getOrDefault("messages", List.of());
        svc.setRefVerifMessages(name, pdef, messages);
        return ResponseEntity.ok(ApiResponse.ok(null, "Messages de vérification mis à jour"));
    }

    /** Get checkpoints for a reference (PDEF query param — see getRefMessages). */
    @GetMapping("/{name}/refs/checkpoints")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRefCheckpoints(
            @PathVariable String name,
            @RequestParam String pdef) {
        List<String> checkpoints = svc.getRefCheckpoints(name, pdef);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("checkpoints", checkpoints)));
    }

    /** Set (replace) checkpoints for a reference (PDEF query param — see getRefMessages). */
    @PutMapping("/{name}/refs/checkpoints")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Void>> setRefCheckpoints(
            @PathVariable String name,
            @RequestParam String pdef,
            @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<String> checkpoints = (List<String>) body.getOrDefault("checkpoints", List.of());
        svc.setRefCheckpoints(name, pdef, checkpoints);
        return ResponseEntity.ok(ApiResponse.ok(null, "Checkpoints mis à jour"));
    }

    /** Bulk-delete multiple refs by ROWID list. */
    @DeleteMapping("/{name}/refs/bulk")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISEUR', 'SUPERVISOR', 'OPERATEUR', 'OPERATOR')")
    public ResponseEntity<ApiResponse<Void>> bulkDeleteRefs(
            @PathVariable String name,
            @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<String> ids = (List<String>) body.get("ids");
        int deleted = svc.bulkDeleteProjectRefs(name, ids);
        return ResponseEntity.ok(ApiResponse.ok(null, deleted + " référence(s) supprimée(s)"));
    }
}
