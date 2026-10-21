package com.adient.firewall.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * Shared DTO for both Firewall and CSL records.
 * The "operator" field holds CQFW (firewall) or CQCSL (csl) depending on context.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record QualityRecordDto(
        Long id,
        String barCode,
        String date,
        String dateCode,
        // Firewall uses cqFw, CSL uses cqCsl – only one is non-null per record type
        String cqFw,
        String cqCsl,
        String cqDelibera,
        String ref,
        String version,
        String poste,
        String remarque,
        String reprise,
        String ref2,
        String ref3,
        String tampon,
        String defDetail,
        String project,
        String equipeProd,
        String superviseur,
        String recordStatus,
        String matricule,
        String nomComplet,
        List<DefectEntry> defects
) {
    public record DefectEntry(String codeDef, String checkpoint, String descDef, int qty, Object demirite, String status) {}
}
