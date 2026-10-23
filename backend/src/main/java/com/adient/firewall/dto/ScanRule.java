package com.adient.firewall.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;

public record ScanRule(Integer length, String prefix, String suffix) {
    @JsonCreator
    public static ScanRule fromJson(@JsonProperty("length") BigDecimal length,
            @JsonProperty("prefix") String prefix, @JsonProperty("suffix") String suffix) {
        try {
            return new ScanRule(length == null ? null : length.intValueExact(), prefix, suffix);
        } catch (ArithmeticException e) {
            throw new IllegalArgumentException("La longueur du scan doit être un entier.", e);
        }
    }
}
