package com.adient.firewall.audit;

import java.time.LocalDateTime;

public record BusinessActivity(
        Long id, Long userId, String actor, LocalDateTime occurredAt,
        String module, String action, String target, String route,
        String outcome, int httpStatus, long durationMs) {}
