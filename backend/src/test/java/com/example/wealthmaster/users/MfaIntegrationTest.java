package com.example.wealthmaster.users;

import com.eatthepath.otp.TimeBasedOneTimePasswordGenerator;
import org.apache.commons.codec.binary.Base32;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;
import javax.crypto.spec.SecretKeySpec;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static com.example.wealthmaster.users.MfaRepository.Operation.*;

@SpringBootTest(properties = {"app.initial-owner.email=owner@example.test", "app.initial-owner.password=synthetic-password",
    "app.mfa.encryption-password=synthetic-test-encryption-password-only",
    "app.mfa.encryption-salt=0123456789abcdef0123456789abcdef"})
@Import(MfaIntegrationTest.TestTime.class)
class MfaIntegrationTest {
    static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18-alpine");
    @BeforeAll static void startDatabase() {
        if (System.getProperty("test.database.url") == null) {
            assumeTrue(DockerClientFactory.instance().isDockerAvailable(), "Docker or disposable test.database.url required"); postgres.start();
        }
    }
    @AfterAll static void stopDatabase() { if (postgres.isRunning()) postgres.stop(); }
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getProperty("test.database.url", postgres.isRunning() ? postgres.getJdbcUrl() : ""));
        registry.add("spring.datasource.username", () -> System.getProperty("test.database.username", postgres.getUsername()));
        registry.add("spring.datasource.password", () -> System.getProperty("test.database.password", postgres.getPassword()));
    }
    @TestConfiguration static class TestTime { @Bean @Primary MutableClock testClock() { return new MutableClock(); } }
    static class MutableClock extends Clock {
        final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-10-04T00:00:00Z"));
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now.get(); }
        void advance(long seconds) { now.updateAndGet(time -> time.plusSeconds(seconds)); }
    }
    @Autowired MutableClock clock;
    @Autowired WebApplicationContext context;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwords;
    @Autowired MfaService mfa;
    @Autowired ObjectMapper mapper;
    MockMvc mvc;
    AppUser user;
    @BeforeEach void setup() {
        clock.now.set(Instant.parse("2026-10-04T00:00:00Z"));
        user = users.findByEmail("mfa@example.test").orElseGet(() -> users.save(new AppUser("mfa@example.test", passwords.encode("synthetic-password"))));
        jdbc.update("DELETE FROM mfa_pending WHERE user_id=?", user.getId());
        jdbc.update("DELETE FROM mfa_recovery_codes WHERE user_id=?", user.getId());
        jdbc.update("DELETE FROM user_mfa WHERE user_id=?", user.getId());
        jdbc.update("DELETE FROM auth_attempt_limits");
        jdbc.update("DELETE FROM audit_events WHERE actor_id=?", user.getId());
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }
    String csrf(MockHttpSession session) throws Exception {
        var result = mvc.perform(get("/api/v1/auth/csrf").session(session)).andExpect(status().isOk()).andReturn();
        return mapper.readTree(result.getResponse().getContentAsString()).get("token").asString();
    }
    MockHttpSession login(String expected) throws Exception {
        var session = new MockHttpSession();
        mvc.perform(post("/api/v1/auth/login").session(session).header("X-CSRF-TOKEN", csrf(session))
                .param("email", user.getEmail()).param("password", "synthetic-password"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value(expected));
        return session;
    }
    org.springframework.test.web.servlet.ResultActions postJson(String path, Object body, MockHttpSession session) throws Exception {
        return mvc.perform(post(path).session(session).header("X-CSRF-TOKEN", csrf(session)).contentType("application/json").content(mapper.writeValueAsString(body)));
    }
    String code(String setupKey) throws Exception {
        return new TimeBasedOneTimePasswordGenerator().generateOneTimePasswordString(new SecretKeySpec(new Base32().decode(setupKey), "HmacSHA1"), clock.instant(), Locale.ROOT);
    }
    record Enrollment(MfaService.Setup setup, List<String> codes) {}
    Enrollment verifiedSetup(String binding) throws Exception {
        var setup = mfa.begin(user.getId(), binding, ENROLL, "synthetic-password", null, null, null);
        var codes = mfa.verifyEnrollment(user.getId(), binding, code(setup.setupKey())).recoveryCodes();
        return new Enrollment(setup, codes);
    }
    Enrollment enabled() throws Exception {
        var enrollment = verifiedSetup("test-binding"); mfa.confirm(user.getId(), "test-binding", true); return enrollment;
    }
    void assertAccountMutationsForbidden(MockHttpSession session) throws Exception {
        mvc.perform(get("/api/v1/net-worth/current").session(session)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/transactions").session(session)).andExpect(status().isForbidden());
        for (String resource : List.of("transactions", "transfers")) {
            for (var request : List.of(post("/api/v1/" + resource).contentType("application/json").content("{}"),
                    put("/api/v1/" + resource + "/" + UUID.randomUUID()).contentType("application/json").content("{}"),
                    delete("/api/v1/" + resource + "/" + UUID.randomUUID()))) {
                mvc.perform(request.session(session).header("X-CSRF-TOKEN", csrf(session)).header("If-Match", "\"0\""))
                        .andExpect(status().isForbidden());
            }
        }
        var path = "/api/v1/accounts/" + UUID.randomUUID();
        for (var request : List.of(put(path).contentType("application/json").content("{}"), delete(path), post(path + "/archive"), post(path + "/restore"))) {
            mvc.perform(request.session(session).header("X-CSRF-TOKEN", csrf(session)).header("If-Match", "\"0\""))
                    .andExpect(status().isForbidden());
        }
    }
    @Test void productionRequiresVerifiedEnrollmentAndSavedConfirmationBeforeAccounts() throws Exception {
        var session = login("MFA_SETUP_REQUIRED"); var otherSession = login("MFA_SETUP_REQUIRED");
        mvc.perform(get("/api/v1/accounts").session(session)).andExpect(status().isForbidden());
        assertAccountMutationsForbidden(session);
        mvc.perform(get("/api/v1/users/me/security").session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.required").value(true));
        mvc.perform(post("/api/v1/users/me/mfa/enrollment/start").session(session).contentType("application/json").content("{}"))
                .andExpect(status().isForbidden());
        var setupResult = postJson("/api/v1/users/me/mfa/enrollment/start", Map.of("password", "synthetic-password"), session).andExpect(status().isOk()).andReturn();
        String key = mapper.readTree(setupResult.getResponse().getContentAsString()).get("setupKey").asString();
        postJson("/api/v1/users/me/mfa/enrollment/confirm", Map.of("recoveryCodesSaved", true), session).andExpect(status().isBadRequest());
        postJson("/api/v1/users/me/mfa/enrollment/verify", Map.of("code", code(key)), session).andExpect(status().isOk()).andExpect(jsonPath("$.recoveryCodes.length()").value(10));
        assertFalse(mfa.snapshot(user.getId()).enabled());
        postJson("/api/v1/users/me/mfa/enrollment/confirm", Map.of("recoveryCodesSaved", false), session).andExpect(status().isBadRequest());
        postJson("/api/v1/users/me/mfa/enrollment/confirm", Map.of("recoveryCodesSaved", true), session).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("AUTHENTICATED"));
        mvc.perform(get("/api/v1/accounts").session(session)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/auth/session").session(otherSession)).andExpect(status().isUnauthorized());
        assertTrue(mfa.snapshot(user.getId()).enabled());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE actor_id=? AND event_type='MFA_ACTIVATED'", Integer.class, user.getId()));
    }
    @Test void passwordOnlySessionCannotBypassSecondFactorAndSuccessfulProofRotatesSession() throws Exception {
        var enrollment = enabled(); clock.advance(30);
        var session = login("MFA_REQUIRED"); String previousId = session.getId();
        mvc.perform(get("/api/v1/accounts").session(session)).andExpect(status().isForbidden());
        assertAccountMutationsForbidden(session);
        mvc.perform(get("/api/v1/users/me/security").session(session)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/auth/session").session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("MFA_REQUIRED"));
        postJson("/api/v1/auth/mfa/verify", Map.of("code", code(enrollment.setup().setupKey()), "kind", "TOTP"), session)
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("AUTHENTICATED"));
        assertNotEquals(previousId, session.getId());
        mvc.perform(get("/api/v1/accounts").session(session)).andExpect(status().isOk());
    }
    @Test void codesAreSingleUseAcrossConcurrentSessionsAndRestartedChallenges() throws Exception {
        var enrollment = enabled();
        var first = login("MFA_REQUIRED"); var second = login("MFA_REQUIRED");
        postJson("/api/v1/auth/mfa/verify", Map.of("code", enrollment.codes().getFirst(), "kind", "RECOVERY"), first).andExpect(status().isOk()).andExpect(jsonPath("$.recoveryUsed").value(true));
        postJson("/api/v1/auth/mfa/verify", Map.of("code", enrollment.codes().getFirst(), "kind", "RECOVERY"), second).andExpect(status().isBadRequest());
        assertEquals(9, mfa.status(user.getId(), "irrelevant").recoveryCodesRemaining());
        var pool = Executors.newFixedThreadPool(2);
        try {
            var barrier = new CyclicBarrier(2);
            List<Future<Boolean>> results = new ArrayList<>();
            for (int i = 0; i < 2; i++) results.add(pool.submit(() -> {
                barrier.await();
                try { mfa.verifyLogin(user.getId(), mfa.snapshot(user.getId()).version(), enrollment.codes().get(1), MfaService.FactorKind.RECOVERY); return true; }
                catch (SecurityFailure failure) { return false; }
            }));
            assertEquals(1, results.stream().filter(future -> { try { return future.get(10, TimeUnit.SECONDS); } catch (Exception error) { throw new RuntimeException(error); } }).count());
        } finally { pool.shutdownNow(); }
    }
    @Test void setupIsSessionBoundExpiresAndNeverRedisplaysCodes() throws Exception {
        var setup = mfa.begin(user.getId(), "one", ENROLL, "synthetic-password", null, null, null);
        assertThrows(SecurityFailure.class, () -> mfa.verifyEnrollment(user.getId(), "two", code(setup.setupKey())));
        mfa.verifyEnrollment(user.getId(), "one", code(setup.setupKey()));
        assertThrows(SecurityFailure.class, () -> mfa.verifyEnrollment(user.getId(), "one", code(setup.setupKey())));
        clock.advance(600);
        assertThrows(SecurityFailure.class, () -> mfa.confirm(user.getId(), "one", true));
        assertFalse(mfa.snapshot(user.getId()).enabled());
        mfa.cancel(user.getId(), "one");
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM mfa_recovery_codes WHERE user_id=?", Integer.class, user.getId()));
    }
    @Test void encryptedSecretsAndHashedRecoveryCodesAreStoredWithoutPlaintext() throws Exception {
        var enrollment = enabled();
        byte[] stored = jdbc.queryForObject("SELECT encrypted_secret FROM user_mfa WHERE user_id=?", byte[].class, user.getId());
        assertFalse(Arrays.equals(new Base32().decode(enrollment.setup().setupKey()), stored));
        var hashes = jdbc.queryForList("SELECT code_hash FROM mfa_recovery_codes WHERE user_id=?", String.class, user.getId());
        assertEquals(10, hashes.size());
        for (String code : enrollment.codes()) assertTrue(hashes.stream().noneMatch(hash -> hash.contains(code.replace("-", ""))));
    }
    @Test void replacementPreservesOldFactorUntilConfirmationAndCancellationIsSafe() throws Exception {
        var old = enabled(); clock.advance(30);
        var recent = mfa.verifyLogin(user.getId(), 1, code(old.setup().setupKey()), MfaService.FactorKind.TOTP).verifiedAt();
        var replacement = mfa.begin(user.getId(), "replace", REPLACE, "synthetic-password", null, null, recent);
        assertEquals(1, mfa.snapshot(user.getId()).version());
        mfa.cancel(user.getId(), "replace"); clock.advance(30);
        mfa.verifyLogin(user.getId(), 1, code(old.setup().setupKey()), MfaService.FactorKind.TOTP);
        replacement = mfa.begin(user.getId(), "replace", REPLACE, "synthetic-password", null, null, clock.instant());
        var codes = mfa.verifyEnrollment(user.getId(), "replace", code(replacement.setupKey())).recoveryCodes();
        mfa.confirm(user.getId(), "replace", true);
        assertEquals(2, mfa.snapshot(user.getId()).version());
        assertThrows(SecurityFailure.class, () -> mfa.verifyLogin(user.getId(), 2, old.codes().getFirst(), MfaService.FactorKind.RECOVERY));
        mfa.verifyLogin(user.getId(), 2, codes.getFirst(), MfaService.FactorKind.RECOVERY);
    }
    @Test void lastRecoveryCodeCanAuthorizeReplacementAndRegenerationIsStaged() throws Exception {
        var enrollment = enabled();
        for (int i = 0; i < 9; i++) mfa.verifyLogin(user.getId(), 1, enrollment.codes().get(i), MfaService.FactorKind.RECOVERY);
        var proof = mfa.verifyLogin(user.getId(), 1, enrollment.codes().get(9), MfaService.FactorKind.RECOVERY);
        assertEquals(0, mfa.status(user.getId(), "session").recoveryCodesRemaining());
        mfa.begin(user.getId(), "session", REPLACE, "synthetic-password", null, null, proof.verifiedAt()); mfa.cancel(user.getId(), "session");
        var pending = mfa.begin(user.getId(), "session", RECOVERY, "synthetic-password", null, null, proof.verifiedAt());
        assertEquals(1, mfa.snapshot(user.getId()).version());
        assertThrows(SecurityFailure.class, () -> mfa.verifyLogin(user.getId(), 1, pending.recoveryCodes().getFirst(), MfaService.FactorKind.RECOVERY));
        mfa.confirm(user.getId(), "session", true);
        mfa.verifyLogin(user.getId(), 2, pending.recoveryCodes().getFirst(), MfaService.FactorKind.RECOVERY);
        assertEquals(9, mfa.status(user.getId(), "session").recoveryCodesRemaining());
    }
    @Test void factorLimitsPersistAcrossNewPasswordSessionsAndCooldownExpires() throws Exception {
        var enrollment = enabled();
        for (int attempt = 0; attempt < 5; attempt++) {
            var session = login("MFA_REQUIRED");
            postJson("/api/v1/auth/mfa/verify", Map.of("code", "not-a-recovery-code", "kind", "RECOVERY"), session)
                .andExpect(status().is(attempt == 4 ? 429 : 400));
        }
        var failure = assertThrows(SecurityFailure.class, () -> mfa.verifyLogin(user.getId(), 1, enrollment.codes().getFirst(), MfaService.FactorKind.RECOVERY));
        assertEquals(429, failure.status()); assertEquals(300, failure.retryAfter());
        clock.advance(300);
        mfa.verifyLogin(user.getId(), 1, enrollment.codes().getFirst(), MfaService.FactorKind.RECOVERY);
    }
    @Test void loginChallengeExpiresAndPasswordAttemptsAreThrottled() throws Exception {
        enabled(); var session = login("MFA_REQUIRED"); clock.advance(300);
        mvc.perform(get("/api/v1/auth/session").session(session)).andExpect(status().isUnauthorized());
        for (int attempt = 0; attempt < 5; attempt++) {
            var fresh = new MockHttpSession();
            mvc.perform(post("/api/v1/auth/login").session(fresh).header("X-CSRF-TOKEN", csrf(fresh))
                .param("email", user.getEmail()).param("password", "incorrect-password"))
                .andExpect(status().is(attempt == 4 ? 429 : 401));
        }
    }
    @Test void managementInvalidatesOtherVerifiedSessionsAndRejectsPreviousRecoveryGeneration() throws Exception {
        var enrollment = enabled(); var current = login("MFA_REQUIRED"); var other = login("MFA_REQUIRED");
        postJson("/api/v1/auth/mfa/verify", Map.of("code", enrollment.codes().get(0), "kind", "RECOVERY"), current).andExpect(status().isOk());
        postJson("/api/v1/auth/mfa/verify", Map.of("code", enrollment.codes().get(1), "kind", "RECOVERY"), other).andExpect(status().isOk());
        var result = postJson("/api/v1/users/me/mfa/recovery/start", Map.of("password", "synthetic-password"), current).andExpect(status().isOk()).andReturn();
        String freshCode = mapper.readTree(result.getResponse().getContentAsString()).get("recoveryCodes").get(0).asString();
        assertEquals(8, mfa.status(user.getId(), "x").recoveryCodesRemaining());
        postJson("/api/v1/users/me/mfa/enrollment/confirm", Map.of("recoveryCodesSaved", true), current).andExpect(status().isOk());
        mvc.perform(get("/api/v1/accounts").session(current)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/accounts").session(other)).andExpect(status().isUnauthorized());
        assertThrows(SecurityFailure.class, () -> mfa.verifyLogin(user.getId(), 2, enrollment.codes().get(2), MfaService.FactorKind.RECOVERY));
        mfa.verifyLogin(user.getId(), 2, freshCode, MfaService.FactorKind.RECOVERY);
    }
    @Test void frontendOwnerIdsCannotChangeAnotherUsersMfaEnrollment() throws Exception {
        var peer = users.findByEmail("mfa-peer@example.test").orElseGet(() -> users.save(new AppUser("mfa-peer@example.test", passwords.encode("synthetic-password"))));
        var peerSetup = mfa.begin(peer.getId(), "peer-session", ENROLL, "synthetic-password", null, null, null);
        var current = login("MFA_SETUP_REQUIRED");
        var result = postJson("/api/v1/users/me/mfa/enrollment/start", Map.of("password", "synthetic-password", "userId", peer.getId().toString()), current).andExpect(status().isOk()).andReturn();
        String ownKey = mapper.readTree(result.getResponse().getContentAsString()).get("setupKey").asString();
        assertNotEquals(peerSetup.setupKey(), ownKey);
        postJson("/api/v1/users/me/mfa/enrollment/verify", Map.of("code", code(ownKey), "userId", peer.getId().toString()), current).andExpect(status().isOk());
        postJson("/api/v1/users/me/mfa/enrollment/confirm", Map.of("recoveryCodesSaved", true, "userId", peer.getId().toString()), current).andExpect(status().isOk());
        assertTrue(mfa.snapshot(user.getId()).enabled()); assertFalse(mfa.snapshot(peer.getId()).enabled());
        assertEquals("ENROLL", mfa.status(peer.getId(), "peer-session").pendingOperation());
        mfa.cancel(peer.getId(), "peer-session");
    }
    @Test void replacementRequiresPasswordAndFreshExistingProof() throws Exception {
        enabled();
        assertThrows(SecurityFailure.class, () -> mfa.begin(user.getId(), "x", REPLACE, "wrong-password", null, null, clock.instant()));
        assertThrows(SecurityFailure.class, () -> mfa.begin(user.getId(), "x", REPLACE, "synthetic-password", null, null, clock.instant().minusSeconds(300)));
    }
}
