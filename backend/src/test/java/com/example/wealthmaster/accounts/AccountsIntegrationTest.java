package com.example.wealthmaster.accounts;

import com.example.wealthmaster.users.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.AfterAll;
import org.testcontainers.DockerClientFactory;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ActiveProfiles("dev")
@SpringBootTest(properties = {"app.initial-owner.email=owner@example.test", "app.initial-owner.password=synthetic-password",
        "app.mfa.encryption-password=synthetic-test-encryption-password-only",
        "app.mfa.encryption-salt=0123456789abcdef0123456789abcdef"})
class AccountsIntegrationTest {
    static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18-alpine");
    @BeforeAll static void startDatabase() {
        if (System.getProperty("test.database.url") == null) {
            assumeTrue(DockerClientFactory.instance().isDockerAvailable(), "Docker or an explicit disposable test.database.url is required");
            postgres.start();
        }
    }
    @AfterAll static void stopDatabase() {
        if (postgres.isRunning()) postgres.stop();
    }
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getProperty("test.database.url", postgres.isRunning() ? postgres.getJdbcUrl() : ""));
        registry.add("spring.datasource.username", () -> System.getProperty("test.database.username", postgres.getUsername()));
        registry.add("spring.datasource.password", () -> System.getProperty("test.database.password", postgres.getPassword()));
    }
    @Autowired WebApplicationContext context;
    @Autowired UserRepository users;
    @Autowired AccountRepository accounts;
    @Autowired PasswordEncoder encoder;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    MockMvc mvc;
    @BeforeEach void setup() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        jdbc.update("DELETE FROM audit_events");
        jdbc.update("DELETE FROM ledger_account_history");
        jdbc.update("DELETE FROM ledger_movements");
        jdbc.update("DELETE FROM ledger_operations"); accounts.deleteAll();
    }
    String csrf(MockHttpSession session) throws Exception {
        var result = mvc.perform(get("/api/v1/auth/csrf").session(session)).andReturn();
        return mapper.readTree(result.getResponse().getContentAsString()).get("token").asString();
    }
    MockHttpSession login(String email) throws Exception {
        var session = new MockHttpSession();
        mvc.perform(post("/api/v1/auth/login").session(session).header("X-CSRF-TOKEN", csrf(session))
                .param("email", email).param("password", "synthetic-password")).andExpect(status().isOk());
        return session;
    }
    @Test void persistedAccountsAreExactAuditedAndIsolatedEvenWithForgedOwnerId() throws Exception {
        var second = users.findByEmail("second@example.test").orElseGet(() -> users.save(new AppUser("second@example.test", encoder.encode("synthetic-password"))));
        var owner = login("owner@example.test");
        mvc.perform(post("/api/v1/accounts").session(owner).header("X-CSRF-TOKEN", csrf(owner))
                .contentType("application/json").content("""
                    {"name":"Card","type":"CREDIT_CARD","currency":"CHF",
                     "openingAmount":"99999999999999999999.12345678","balanceMeaning":"AMOUNT_OWED",
                     "openingDate":"2026-10-04","ownerId":"%s"}
                    """.formatted(second.getId())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.openingBalance").value("-99999999999999999999.12345678"))
                .andExpect(jsonPath("$.openingDate").value("2026-10-04"));
        assertEquals(0, new BigDecimal("-99999999999999999999.12345678").compareTo(jdbc.queryForObject("SELECT opening_balance FROM financial_accounts", BigDecimal.class)));
        assertEquals(users.findByEmail("owner@example.test").orElseThrow().getId(), jdbc.queryForObject("SELECT owner_id FROM financial_accounts", java.util.UUID.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='ACCOUNT_CREATED'", Integer.class));
        var other = login("second@example.test");
        mvc.perform(get("/api/v1/accounts").session(other)).andExpect(status().isOk()).andExpect(content().json("[]"));
        mvc.perform(get("/api/v1/accounts").session(login("owner@example.test"))).andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("Card"));
    }
    @Test void rejectedAccountDoesNotPersistOrCreateAuditEvent() throws Exception {
        var owner = login("owner@example.test");
        mvc.perform(post("/api/v1/accounts").session(owner).header("X-CSRF-TOKEN", csrf(owner))
                .contentType("application/json").content("""
                    {"name":"Invalid","type":"CHECKING","currency":"CHF","openingAmount":"1.123456789",
                     "balanceMeaning":"BALANCE","openingDate":"2026-10-04"}
                    """))
                .andExpect(status().isBadRequest());
        assertEquals(0, accounts.count());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM audit_events", Integer.class));
    }

    private FinancialAccount fixture() {
        return accounts.saveAndFlush(new FinancialAccount(users.findByEmail("owner@example.test").orElseThrow().getId(),
                "Synthetic", AccountType.CHECKING, null, "CHF", new BigDecimal("10.12345678"), java.time.LocalDate.of(2026, 10, 4)));
    }
    private String editJson() { return """
        {"name":"Updated","type":"INVESTMENT","institution":"Synthetic broker","currency":"CHF",
        "openingAmount":"99999999999999999999.12345678","balanceMeaning":"BALANCE","openingDate":"2026-10-03"}
        """; }
    @Test void editArchiveRestoreDeletePersistVersionsAndSurvivingAuditSnapshots() throws Exception {
        var account = fixture(); var owner = login("owner@example.test"); var path = "/api/v1/accounts/" + account.getId();
        mvc.perform(put(path).session(owner).header("X-CSRF-TOKEN", csrf(owner)).header("If-Match", "\"0\"")
                .contentType("application/json").content(editJson())).andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1)).andExpect(jsonPath("$.openingBalance").value("99999999999999999999.12345678"));
        mvc.perform(delete(path).session(owner).header("X-CSRF-TOKEN", csrf(owner)).header("If-Match", "\"0\""))
                .andExpect(status().isPreconditionFailed());
        mvc.perform(post(path + "/archive").session(owner).header("X-CSRF-TOKEN", csrf(owner)).header("If-Match", "\"1\""))
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false)).andExpect(jsonPath("$.version").value(2));
        mvc.perform(post(path + "/restore").session(owner).header("X-CSRF-TOKEN", csrf(owner)).header("If-Match", "\"2\""))
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(true)).andExpect(jsonPath("$.version").value(3));
        mvc.perform(delete(path).session(owner).header("X-CSRF-TOKEN", csrf(owner)).header("If-Match", "\"3\""))
                .andExpect(status().isNoContent());
        assertFalse(accounts.existsById(account.getId()));
        assertEquals(4, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE resource_id=?", Integer.class, account.getId()));
        assertEquals("Synthetic", jdbc.queryForObject("SELECT details->'before'->>'name' FROM audit_events WHERE event_type='ACCOUNT_UPDATED'", String.class));
        assertEquals("Updated", jdbc.queryForObject("SELECT details->'before'->>'name' FROM audit_events WHERE event_type='ACCOUNT_DELETED'", String.class));
    }
    @Test void everyMutationChecksOwnershipCsrfAndAuthentication() throws Exception {
        var account = fixture(); var owner = login("owner@example.test");
        users.findByEmail("second@example.test").orElseGet(() -> users.save(new AppUser("second@example.test", encoder.encode("synthetic-password"))));
        var other = login("second@example.test"); var path = "/api/v1/accounts/" + account.getId();
        for (var request : java.util.List.of(put(path).contentType("application/json").content(editJson()), delete(path), post(path + "/archive"), post(path + "/restore"))) {
            mvc.perform(request.session(other).header("X-CSRF-TOKEN", csrf(other)).header("If-Match", "\"0\""))
                    .andExpect(status().isNotFound());
        }
        mvc.perform(delete(path).session(owner).header("If-Match", "\"0\"")).andExpect(status().isForbidden());
        mvc.perform(delete(path).session(owner).header("X-CSRF-TOKEN", csrf(owner))).andExpect(status().is(428));
        var anonymous = new MockHttpSession();
        mvc.perform(delete(path).session(anonymous).header("X-CSRF-TOKEN", csrf(anonymous)).header("If-Match", "\"0\""))
                .andExpect(status().isUnauthorized());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM audit_events", Integer.class));
        assertTrue(accounts.existsById(account.getId()));
    }
    @Test void invalidEditLeavesAccountAndAuditUnchanged() throws Exception {
        var account = fixture(); var owner = login("owner@example.test");
        mvc.perform(put("/api/v1/accounts/" + account.getId()).session(owner).header("X-CSRF-TOKEN", csrf(owner))
                .header("If-Match", "\"0\"").contentType("application/json").content(editJson().replace("CHF", "ZZZ")))
                .andExpect(status().isBadRequest());
        assertEquals("Synthetic", accounts.findById(account.getId()).orElseThrow().getName());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM audit_events", Integer.class));
    }

    @Test void concurrentEditsWithSameVersionHaveOneWinner() throws Exception {
        var account = fixture(); var first = login("owner@example.test"); var second = login("owner@example.test");
        var firstToken = csrf(first); var secondToken = csrf(second);
        var start = new java.util.concurrent.CountDownLatch(1);
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Integer> editFirst = () -> { start.await(); return mvc.perform(put("/api/v1/accounts/" + account.getId())
                    .session(first).header("X-CSRF-TOKEN", firstToken).header("If-Match", "\"0\"")
                    .contentType("application/json").content(editJson())).andReturn().getResponse().getStatus(); };
            java.util.concurrent.Callable<Integer> editSecond = () -> { start.await(); return mvc.perform(put("/api/v1/accounts/" + account.getId())
                    .session(second).header("X-CSRF-TOKEN", secondToken).header("If-Match", "\"0\"")
                    .contentType("application/json").content(editJson().replace("Updated", "Other edit"))).andReturn().getResponse().getStatus(); };
            var a = executor.submit(editFirst); var b = executor.submit(editSecond); start.countDown();
            var statuses = java.util.List.of(a.get(15, java.util.concurrent.TimeUnit.SECONDS), b.get(15, java.util.concurrent.TimeUnit.SECONDS));
            assertTrue(statuses.contains(200)); assertTrue(statuses.contains(412));
        }
        assertEquals(1, accounts.findById(account.getId()).orElseThrow().getVersion());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM audit_events", Integer.class));
    }
    @Test void auditFailureRollsBackEditAndDeletion() throws Exception {
        var account = fixture(); var owner = login("owner@example.test");
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT synthetic_reject_account_changes CHECK (event_type NOT IN ('ACCOUNT_UPDATED','ACCOUNT_DELETED'))");
        try {
            assertThrows(Exception.class, () -> mvc.perform(put("/api/v1/accounts/" + account.getId()).session(owner)
                    .header("X-CSRF-TOKEN", csrf(owner)).header("If-Match", "\"0\"").contentType("application/json").content(editJson())));
            assertEquals("Synthetic", accounts.findById(account.getId()).orElseThrow().getName());
            assertEquals(0, accounts.findById(account.getId()).orElseThrow().getVersion());
            assertThrows(Exception.class, () -> mvc.perform(delete("/api/v1/accounts/" + account.getId()).session(owner)
                    .header("X-CSRF-TOKEN", csrf(owner)).header("If-Match", "\"0\"")));
            assertTrue(accounts.existsById(account.getId()));
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM audit_events", Integer.class));
        } finally { jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT synthetic_reject_account_changes"); }
    }
}
