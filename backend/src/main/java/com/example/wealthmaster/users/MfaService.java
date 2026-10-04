package com.example.wealthmaster.users;

import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import static com.example.wealthmaster.users.MfaRepository.*;

@Service
@Transactional(noRollbackFor = AuthenticationException.class)
public class MfaService {
    private final MfaRepository repository;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final AttemptLimiter limits;
    private final MfaCrypto crypto;
    private final Clock clock;
    private final boolean required;
    public MfaService(MfaRepository repository, UserRepository users, PasswordEncoder passwords, AttemptLimiter limits,
            MfaCrypto crypto, Clock clock, MfaPolicy policy) {
        this.repository = repository; this.users = users; this.passwords = passwords;
        this.limits = limits; this.crypto = crypto; this.clock = clock; this.required = policy.required();
    }
    public Snapshot snapshot(UUID owner) {
        var state = repository.state(owner, false);
        return new Snapshot(state.enabled(), state.version(), required, null, false);
    }
    public SecurityStatus status(UUID owner, String binding) {
        var state = repository.state(owner, false); var pending = repository.pending(owner);
        boolean ownPending = pending != null && pending.binding().equals(binding) && clock.instant().isBefore(pending.expiresAt());
        return new SecurityStatus(state.enabled(), required, state.enabledAt(), repository.availableCodes(state).size(),
                ownPending ? pending.operation().name() : null);
    }
    public Setup begin(UUID owner, String binding, Operation operation, String password, String factor,
            FactorKind kind, Instant recentFactor) {
        var state = repository.state(owner, true);
        if ((operation == Operation.ENROLL) == state.enabled()) throw new SecurityFailure(409, "The security settings changed. Reload settings and try again.");
        var user = users.findById(owner).orElseThrow(() -> new SecurityFailure(401, "Please sign in."));
        limits.guard("password:" + user.getEmail(), () -> {
            boolean matches;
            try { matches = passwords.matches(password, user.getPasswordHash()); }
            catch (IllegalArgumentException error) { matches = false; }
            if (!matches) throw new SecurityFailure(400, "Incorrect password.");
            return true;
        });
        Instant verifiedAt = null;
        if (state.enabled()) {
            if (factor != null && !factor.isBlank()) {
                verifyFactor(state, factor, kind == null ? FactorKind.TOTP : kind); verifiedAt = clock.instant();
            } else if (recentFactor != null && !clock.instant().isBefore(recentFactor)
                    && clock.instant().isBefore(recentFactor.plusSeconds(300))) {
                verifiedAt = recentFactor;
            } else throw new SecurityFailure(400, "Enter an authenticator or unused recovery code to verify this change.");
        }
        repository.deletePending(owner); repository.deleteInactiveCodes(state);
        byte[] secret = operation == Operation.RECOVERY ? null : crypto.newSecret();
        var pending = new Pending(owner, operation, binding, UUID.randomUUID(), state.version(),
                secret == null ? null : crypto.encrypt(secret), null, operation == Operation.RECOVERY ? verifiedAt : null,
                clock.instant().plusSeconds(600));
        repository.savePending(pending);
        List<String> codes = operation == Operation.RECOVERY ? generateCodes(pending) : null;
        String key = secret == null ? null : crypto.setupKey(secret);
        String uri = key == null ? null : "otpauth://totp/" + encode("Wealth Master:" + user.getEmail())
                + "?secret=" + key + "&issuer=" + encode("Wealth Master") + "&algorithm=SHA1&digits=6&period=30";
        return new Setup(key, uri, pending.expiresAt(), codes);
    }
    public Codes verifyEnrollment(UUID owner, String binding, String code) {
        var state = repository.state(owner, true); var pending = pending(state, binding);
        if (pending.operation() == Operation.RECOVERY || pending.verifiedAt() != null) throw new SecurityFailure(409, "Restart setup to receive a new set of recovery codes.");
        byte[] secret = pending.secret();
        long step = limits.guard("factor:" + owner, () -> crypto.verifyStep(crypto.decrypt(secret), code, clock.instant(), -1));
        pending = new Pending(owner, pending.operation(), binding, pending.generation(), pending.baseVersion(), pending.secret(), step, clock.instant(), pending.expiresAt());
        repository.savePending(pending);
        return new Codes(generateCodes(pending), pending.expiresAt());
    }
    public Snapshot confirm(UUID owner, String binding, boolean saved) {
        var state = repository.state(owner, true); var pending = pending(state, binding);
        if (!saved || pending.verifiedAt() == null) throw new SecurityFailure(400, "Verify the authenticator and confirm that you saved the recovery codes.");
        repository.activate(state, pending, clock.instant());
        var activated = repository.state(owner, false);
        repository.deletePending(owner); repository.deleteInactiveCodes(activated);
        repository.audit(owner, switch (pending.operation()) {
            case ENROLL -> "MFA_ACTIVATED"; case REPLACE -> "MFA_AUTHENTICATOR_REPLACED"; case RECOVERY -> "MFA_RECOVERY_CODES_REGENERATED";
        });
        return new Snapshot(true, activated.version(), required, pending.verifiedAt(), false);
    }
    public void cancel(UUID owner, String binding) {
        var state = repository.state(owner, true); var pending = repository.pending(owner);
        if (pending != null && !pending.binding().equals(binding)) throw new SecurityFailure(409, "Setup was started in another session.");
        repository.deletePending(owner); repository.deleteInactiveCodes(state);
    }
    public Snapshot verifyLogin(UUID owner, long expectedVersion, String code, FactorKind kind) {
        var state = repository.state(owner, true);
        if (!state.enabled() || state.version() != expectedVersion) throw new SecurityFailure(401, "Security settings changed. Please sign in again.");
        verifyFactor(state, code, kind);
        return new Snapshot(true, state.version(), required, clock.instant(), kind == FactorKind.RECOVERY);
    }
    private void verifyFactor(State state, String code, FactorKind kind) {
        limits.guard("factor:" + state.userId(), () -> {
            if (kind == FactorKind.TOTP) {
                long step = crypto.verifyStep(crypto.decrypt(state.secret()), code, clock.instant(), state.lastStep());
                repository.acceptedStep(state.userId(), step);
            } else {
                String normalized = code == null ? "" : code.strip().replace("-", "").toLowerCase(Locale.ROOT);
                if (!normalized.matches("[0-9a-f]{32}")) throw new SecurityFailure(400, "Invalid or already-used recovery code.");
                var match = repository.availableCodes(state).stream()
                        .filter(item -> passwords.matches(normalized, item.hash())).findFirst()
                        .orElseThrow(() -> new SecurityFailure(400, "Invalid or already-used recovery code."));
                repository.consumeCode(match.id(), clock.instant()); repository.audit(state.userId(), "MFA_RECOVERY_CODE_USED");
            }
            return true;
        });
    }
    private Pending pending(State state, String binding) {
        var pending = repository.pending(state.userId());
        if (pending == null || !pending.binding().equals(binding) || !clock.instant().isBefore(pending.expiresAt())
                || pending.baseVersion() != state.version()) {
            throw new SecurityFailure(409, "Setup expired or changed. Restart setup.");
        }
        return pending;
    }
    private List<String> generateCodes(Pending pending) {
        List<String> codes = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            String code = crypto.recoveryCode(); codes.add(code);
            repository.insertCode(pending.userId(), pending.generation(), passwords.encode(code.replace("-", "")));
        }
        return List.copyOf(codes);
    }
    private String encode(String text) { return URLEncoder.encode(text, StandardCharsets.UTF_8).replace("+", "%20"); }
    public enum FactorKind { TOTP, RECOVERY }
    public record Snapshot(boolean enabled, long version, boolean required, Instant verifiedAt, boolean recoveryUsed) {}
    public record SecurityStatus(boolean enabled, boolean required, Instant enabledAt, int recoveryCodesRemaining, String pendingOperation) {}
    public record Setup(String setupKey, String otpauthUri, Instant expiresAt, List<String> recoveryCodes) {
        @Override public String toString() { return "Setup[redacted]"; }
    }
    public record Codes(List<String> recoveryCodes, Instant expiresAt) {
        @Override public String toString() { return "Codes[redacted]"; }
    }
}
