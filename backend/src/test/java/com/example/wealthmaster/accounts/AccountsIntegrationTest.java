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

@SpringBootTest(properties = {"app.initial-owner.email=owner@example.test", "app.initial-owner.password=synthetic-password"})
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
        jdbc.update("DELETE FROM audit_events"); accounts.deleteAll();
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
}
