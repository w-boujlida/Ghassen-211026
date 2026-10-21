package com.adient.firewall.dto;

import java.util.List;

public record ComptageHoraireDto(
        String projet,
        String ligne,
        String date,
        List<CreneauCountDto> matin,
        List<CreneauCountDto> apresMidi,
        long totalMatin,
        long totalApresMidi,
        long total
) {
    public record CreneauCountDto(String creneau, long count) {}
}
