package com.adient.firewall.dto;

public record LoginResponse(String token, String matricule, String fullName, String role) {}
