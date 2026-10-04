package com.example.wealthmaster.users;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public class MfaRepository {
    private final JdbcTemplate jdbc;
    public MfaRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public State state(UUID userId, boolean lock) {
        jdbc.update("INSERT INTO user_mfa(user_id) VALUES (?) ON CONFLICT DO NOTHING", userId);
        return jdbc.queryForObject("SELECT * FROM user_mfa WHERE user_id=?" + (lock ? " FOR UPDATE" : ""),
                (row, n) -> new State(userId, row.getBytes("encrypted_secret"), instant(row, "enabled_at"),
                        row.getLong("last_totp_step"), row.getObject("active_generation", UUID.class), row.getLong("security_version")), userId);
    }
    public Pending pending(UUID userId) {
        var rows = jdbc.query("SELECT * FROM mfa_pending WHERE user_id=?", (row, n) -> new Pending(userId,
                Operation.valueOf(row.getString("operation")), row.getString("session_binding"), row.getObject("generation", UUID.class),
                row.getLong("base_version"), row.getBytes("encrypted_secret"), row.getObject("verified_step", Long.class),
                instant(row, "verified_at"), instant(row, "expires_at")), userId);
        return rows.isEmpty() ? null : rows.getFirst();
    }
    public void savePending(Pending pending) {
        jdbc.update("""
            INSERT INTO mfa_pending(user_id, operation, session_binding, generation, base_version, encrypted_secret, verified_step, verified_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET operation=EXCLUDED.operation, session_binding=EXCLUDED.session_binding,
                generation=EXCLUDED.generation, base_version=EXCLUDED.base_version, encrypted_secret=EXCLUDED.encrypted_secret,
                verified_step=EXCLUDED.verified_step, verified_at=EXCLUDED.verified_at, expires_at=EXCLUDED.expires_at
            """, pending.userId(), pending.operation().name(), pending.binding(), pending.generation(), pending.baseVersion(),
                pending.secret(), pending.verifiedStep(), timestamp(pending.verifiedAt()), timestamp(pending.expiresAt()));
    }
    public void deletePending(UUID owner) { jdbc.update("DELETE FROM mfa_pending WHERE user_id=?", owner); }
    public void deleteInactiveCodes(State state) {
        jdbc.update("DELETE FROM mfa_recovery_codes WHERE user_id=? AND generation IS DISTINCT FROM ?", state.userId(), state.generation());
    }
    public void insertCode(UUID owner, UUID generation, String hash) {
        jdbc.update("INSERT INTO mfa_recovery_codes(id, user_id, generation, code_hash) VALUES (?, ?, ?, ?)", UUID.randomUUID(), owner, generation, hash);
    }
    public List<RecoveryCode> availableCodes(State state) {
        return jdbc.query("SELECT id, code_hash FROM mfa_recovery_codes WHERE user_id=? AND generation=? AND used_at IS NULL ORDER BY id",
                (row, n) -> new RecoveryCode(row.getObject("id", UUID.class), row.getString("code_hash")), state.userId(), state.generation());
    }
    public void consumeCode(UUID id, Instant now) {
        jdbc.update("UPDATE mfa_recovery_codes SET used_at=? WHERE id=? AND used_at IS NULL", timestamp(now), id);
    }
    public void acceptedStep(UUID user, long step) { jdbc.update("UPDATE user_mfa SET last_totp_step=? WHERE user_id=?", step, user); }
    public void activate(State state, Pending pending, Instant now) {
        if (pending.operation() == Operation.RECOVERY) {
            jdbc.update("UPDATE user_mfa SET active_generation=?, security_version=security_version+1 WHERE user_id=?", pending.generation(), state.userId());
        } else {
            jdbc.update("UPDATE user_mfa SET encrypted_secret=?, enabled_at=?, last_totp_step=?, active_generation=?, security_version=security_version+1 WHERE user_id=?",
                    pending.secret(), timestamp(now), pending.verifiedStep(), pending.generation(), state.userId());
        }
    }
    public void audit(UUID owner, String event) {
        jdbc.update("INSERT INTO audit_events(id, actor_id, event_type, resource_id) VALUES (?, ?, ?, ?)", UUID.randomUUID(), owner, event, owner);
    }
    private static Timestamp timestamp(Instant value) { return value == null ? null : Timestamp.from(value); }
    private static Instant instant(ResultSet row, String column) throws SQLException {
        var timestamp = row.getTimestamp(column); return timestamp == null ? null : timestamp.toInstant();
    }
    public enum Operation { ENROLL, REPLACE, RECOVERY }
    public record State(UUID userId, byte[] secret, Instant enabledAt, long lastStep, UUID generation, long version) {
        public boolean enabled() { return secret != null; }
    }
    public record Pending(UUID userId, Operation operation, String binding, UUID generation, long baseVersion,
            byte[] secret, Long verifiedStep, Instant verifiedAt, Instant expiresAt) {}
    public record RecoveryCode(UUID id, String hash) {}
}
