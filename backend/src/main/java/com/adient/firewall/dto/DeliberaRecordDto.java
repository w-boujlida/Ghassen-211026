package com.adient.firewall.dto;

import java.util.List;

public record DeliberaRecordDto(
        Long   id,
        String barcode,
        String projet,
        String reference,
        String version,
        String ligne,
        Long   posteId,
        String posteNom,
        Long   couturiereId,
        String couturiereNom,
        String statutReprise,
        String createdAt,
        List<DefautItem> defauts
) {
    public record DefautItem(Long id, String codeDefaut, String descDefaut, boolean verifie, String addedAt) {}
}
