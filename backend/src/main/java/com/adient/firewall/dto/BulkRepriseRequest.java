package com.adient.firewall.dto;

import java.util.List;

public record BulkRepriseRequest(List<String> barcodes, String reprise) {}
