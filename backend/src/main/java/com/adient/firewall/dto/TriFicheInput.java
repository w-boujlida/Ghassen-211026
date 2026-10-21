package com.adient.firewall.dto;

import java.util.List;

public record TriFicheInput(
        String projet,
        String coiffe,
        String version,
        String defaut,
        String status,
        List<TriZoneInput> zones
) {}
