package com.adient.firewall.dto;

/** Input DTO for creating/updating Firewall or CSL records (same fields). */
public record QualityRecordInput(
        String barCode,
        String dateFw,
        String cqFw,
        String cqCsl,
        String cqDelibera,
        String ref,
        String codeDef,
        String checkpoint,
        String descDef,
        Integer qty,
        String version,
        String poste,
        String remarque,
        Integer demirite,
        String reprise,
        String ref2,
        String ref3,
        String tampon,
        String project,
        String equipe2,
        String superviseur,
        String defstatus,
        // for update: need source + codeDef to identify row
        String source,
        String defStatus,
        String refDetail,
        String equipeProd,
        // record-level tracking fields
        String recordStatus,
        String matricule,
        String nomComplet
) {}
