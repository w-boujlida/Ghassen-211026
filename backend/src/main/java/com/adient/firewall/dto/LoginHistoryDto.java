package com.adient.firewall.dto;

public record LoginHistoryDto(
        Long   id,
        Long   userId,
        String matricule,
        String fullName,
        String loginAt,
        String ipAddress,
        String serverMac,
        String status
) {}
