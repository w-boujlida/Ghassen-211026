package com.adient.firewall.dto;

import java.math.BigDecimal;

public record CoiffeDetailDTO(
        BigDecimal id,
        String     reference,
        String     projet,
        String     ligne,
        int        heure,
        String     horodatage,
        BigDecimal quantite,
        boolean    estRetouche,
        String     date
) {}
