package com.adient.firewall.audit;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Repository
@RequiredArgsConstructor
public class BusinessActivityRepository {
    private final JdbcTemplate db;

    @PostConstruct
    public void initialize() {
        Integer count = db.queryForObject(
                "SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME = 'USER_BUSINESS_ACTIVITY'", Integer.class);
        if (count != null && count == 0) {
            db.execute("""
                    CREATE TABLE USER_BUSINESS_ACTIVITY (
                        ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                        USER_ID NUMBER, ACTOR VARCHAR2(200 CHAR) NOT NULL,
                        OCCURRED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
                        MODULE VARCHAR2(50 CHAR) NOT NULL, ACTION VARCHAR2(80 CHAR) NOT NULL,
                        TARGET VARCHAR2(500 CHAR), ROUTE VARCHAR2(250 CHAR) NOT NULL,
                        OUTCOME VARCHAR2(20 CHAR) NOT NULL, HTTP_STATUS NUMBER(3) NOT NULL,
                        DURATION_MS NUMBER NOT NULL
                    )
                    """);
            db.execute("CREATE INDEX IX_BUSINESS_ACTOR_DATE ON USER_BUSINESS_ACTIVITY (USER_ID, OCCURRED_AT)");
            db.execute("CREATE INDEX IX_BUSINESS_DATE ON USER_BUSINESS_ACTIVITY (OCCURRED_AT)");
        }
    }

    public void insert(BusinessActivity event) {
        db.update("""
                INSERT INTO USER_BUSINESS_ACTIVITY
                (USER_ID, ACTOR, MODULE, ACTION, TARGET, ROUTE, OUTCOME, HTTP_STATUS, DURATION_MS)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, event.userId(), event.actor(), event.module(), event.action(), event.target(),
                event.route(), event.outcome(), event.httpStatus(), event.durationMs());
    }

    public record Page(List<BusinessActivity> rows, long total, int page, int limit) {}

    public Page find(Long userId, String actor, String module, String outcome,
                     LocalDate from, LocalDate to, int page, int limit) {
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (userId != null) { where.append(" AND USER_ID = ?"); args.add(userId); }
        if (actor != null) { where.append(" AND ACTOR = ?"); args.add(actor); }
        if (module != null) { where.append(" AND MODULE = ?"); args.add(module); }
        if (outcome != null) { where.append(" AND OUTCOME = ?"); args.add(outcome); }
        if (from != null) { where.append(" AND OCCURRED_AT >= ?"); args.add(Timestamp.valueOf(from.atStartOfDay())); }
        if (to != null) { where.append(" AND OCCURRED_AT < ?"); args.add(Timestamp.valueOf(to.plusDays(1).atStartOfDay())); }
        Long total = db.queryForObject("SELECT COUNT(*) FROM USER_BUSINESS_ACTIVITY" + where, Long.class, args.toArray());
        args.add((long) (page - 1) * limit);
        args.add(limit);
        List<BusinessActivity> rows = db.query(
                "SELECT * FROM USER_BUSINESS_ACTIVITY" + where
                        + " ORDER BY OCCURRED_AT DESC, ID DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
                (rs, n) -> new BusinessActivity(rs.getLong("ID"), rs.getObject("USER_ID", Long.class),
                        rs.getString("ACTOR"), rs.getTimestamp("OCCURRED_AT").toLocalDateTime(),
                        rs.getString("MODULE"), rs.getString("ACTION"), rs.getString("TARGET"),
                        rs.getString("ROUTE"), rs.getString("OUTCOME"), rs.getInt("HTTP_STATUS"),
                        rs.getLong("DURATION_MS")), args.toArray());
        return new Page(rows, total == null ? 0 : total, page, limit);
    }
}
