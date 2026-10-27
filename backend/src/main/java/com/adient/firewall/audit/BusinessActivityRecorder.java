package com.adient.firewall.audit;

import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class BusinessActivityRecorder {
    private final BusinessActivityRepository repository;

    public void record(Authentication auth, String module, String action, String target,
                       String route, String outcome, int status, long durationMs) {
        Long userId = null;
        if (auth.getDetails() instanceof Claims claims && claims.get("user_id") instanceof Number id) {
            userId = id.longValue();
        }
        String actor = auth.getName().replaceAll("[\\p{Cntrl}]", "");
        repository.insert(new BusinessActivity(null, userId, actor.substring(0, Math.min(actor.length(), 200)),
                null, module, action, target, route, outcome, status, durationMs));
    }

    public void recordCompleted(Authentication auth, String module, String action, String target,
                                String route, int status, long durationMs) {
        try {
            record(auth, module, action, target, route, status < 400 ? "success" : "failed", status, durationMs);
        } catch (RuntimeException failure) {
            // The business transaction may already be committed; do not change its HTTP result.
            // Deliberately omit exception messages/SQL/parameters from this operational alert.
            log.error("BUSINESS_AUDIT_WRITE_FAILED module={} action={} httpStatus={} errorType={}; business response unchanged",
                    module, action, status, failure.getClass().getSimpleName());
        }
    }
}
