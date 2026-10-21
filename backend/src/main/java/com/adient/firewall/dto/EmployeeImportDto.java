package com.adient.firewall.dto;

import java.util.List;

public record EmployeeImportDto(
        String mat,
        String name,
        String dateEmbauche,
        String projet,
        String equipe,
        String equipe2,
        String supervisor,
        List<String> tampons
) {}
