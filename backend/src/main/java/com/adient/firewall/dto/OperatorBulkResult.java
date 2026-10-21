package com.adient.firewall.dto;

import java.util.List;

public record OperatorBulkResult(int affected, List<PreservedTampon> preserved) {
    public record PreservedTampon(String id, String code, String matricule) {}
}
