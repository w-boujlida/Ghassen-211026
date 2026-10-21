package com.adient.firewall.dto;

import java.util.List;

public record ProductionTempsReelDTO(
        String date,
        String generatedAt,
        List<ProductionTempsReelLigneDTO> lignes
) {}
