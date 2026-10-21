package com.adient.firewall.dto;

import java.util.List;
import java.util.Map;

public record OperatorBulkRequest(
        String action,
        List<String> ids,
        Map<String, String> changes,
        Map<String, String> names
) {}
