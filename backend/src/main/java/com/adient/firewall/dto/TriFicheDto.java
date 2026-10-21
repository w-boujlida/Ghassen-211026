package com.adient.firewall.dto;

import java.util.List;

public record TriFicheDto(
        Long id,
        Integer num,
        String dateTri,
        String projet,
        String coiffe,
        String version,
        String defaut,
        String status,
        List<TriZoneDto> zones
) {}
