package com.adient.firewall.dto;

import java.util.List;

/** Détail d'une couturière : ses défauts groupés par poste, pour inspection. */
public record DefautCouturiereDetailDto(
        Long   couturiereId,
        String matricule,
        String nom,
        String projet,
        String ligne,
        String shift,
        String date,
        List<PosteDetailDto> postes,
        long total
) {}
