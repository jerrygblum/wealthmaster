package com.example.wealthmaster.users;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.function.Supplier;

@Service
public class AttemptLimiter {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    public AttemptLimiter(JdbcTemplate jdbc, Clock clock) { this.jdbc = jdbc; this.clock = clock; }
    // Separate password/factor keys: a correct password must not reset failed OTP attempts.
    @Transactional(noRollbackFor = AuthenticationException.class)
    public <T> T guard(String identity, Supplier<T> verification) {
        String key = key(identity); Instant now = clock.instant();
        jdbc.update("INSERT INTO auth_attempt_limits(attempt_key, window_start) VALUES (?, ?) ON CONFLICT DO NOTHING", key, Timestamp.from(now));
        var limit = jdbc.queryForObject("SELECT failures, window_start, locked_until FROM auth_attempt_limits WHERE attempt_key=? FOR UPDATE",
                (row, n) -> new Limit(row.getInt("failures"), row.getTimestamp("window_start").toInstant(),
                        row.getTimestamp("locked_until") == null ? null : row.getTimestamp("locked_until").toInstant()), key);
        if (limit.lockedUntil() != null && now.isBefore(limit.lockedUntil())) {
            long seconds = Math.max(1, (Duration.between(now, limit.lockedUntil()).toMillis() + 999) / 1000);
            throw new SecurityFailure(429, "Too many failed attempts. Try again in " + seconds + " seconds.", seconds);
        }
        boolean fresh = !now.isBefore(limit.windowStart().plusSeconds(300));
        try {
            T result = verification.get();
            jdbc.update("UPDATE auth_attempt_limits SET failures=0, window_start=?, locked_until=NULL WHERE attempt_key=?", Timestamp.from(now), key);
            return result;
        } catch (AuthenticationException failure) {
            int failures = (fresh ? 0 : limit.failures()) + 1;
            jdbc.update("UPDATE auth_attempt_limits SET failures=?, window_start=?, locked_until=? WHERE attempt_key=?",
                    failures, Timestamp.from(fresh ? now : limit.windowStart()), failures >= 5 ? Timestamp.from(now.plusSeconds(300)) : null, key);
            if (failures >= 5) throw new SecurityFailure(429, "Too many failed attempts. Try again in 300 seconds.", 300);
            throw failure;
        }
    }
    private String key(String identity) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(identity.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException("SHA-256 unavailable."); }
    }
    private record Limit(int failures, Instant windowStart, Instant lockedUntil) {}
}
