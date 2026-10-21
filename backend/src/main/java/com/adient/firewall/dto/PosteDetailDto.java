package com.adient.firewall.dto;

import java.util.List;

/** Regroupement par poste des défauts d'une couturière, pour la vue détail. */
public record PosteDetailDto(
        String posteNom,
        List<DefautDetailItemDto> defauts,
        long total
) {}
