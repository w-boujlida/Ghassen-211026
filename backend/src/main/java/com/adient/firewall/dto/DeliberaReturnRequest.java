package com.adient.firewall.dto;

import java.util.List;

public record DeliberaReturnRequest(String justification, List<Long> resolvedDefectIds) {}
