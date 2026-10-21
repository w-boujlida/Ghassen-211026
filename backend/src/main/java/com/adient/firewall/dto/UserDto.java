package com.adient.firewall.dto;

public record UserDto(
        Long    id,
        String  matricule,
        String  fullName,
        String  email,
        String  phone,
        String  role,
        boolean isActive,
        String  lastLogin,
        String  loginTimePreset,
        String  loginTimeStart,
        String  loginTimeEnd,
        int     failedAttempts
) {}
