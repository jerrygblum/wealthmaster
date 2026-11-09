package com.example.wealthmaster.users;

import com.example.wealthmaster.marketdata.MarketProvider;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ActiveProfiles("prod")
@SpringBootTest(properties={"APP_DEMO_ENABLED=true","APP_DEMO_PUBLIC_ORIGIN=https://demo.example.test",
    "app.initial-owner.email=","app.initial-owner.password=","app.mfa.encryption-password=synthetic-demo-encryption-password-only",
    "app.mfa.encryption-salt=0123456789abcdef0123456789abcdef","SESSION_COOKIE_SECURE=false"})
class DemoIntegrationTest {
    static final PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:18-alpine").withDatabaseName("wealthmaster_demo");
    @BeforeAll static void start() {Assumptions.assumeTrue(DockerClientFactory.instance().isDockerAvailable());postgres.start();}
    @AfterAll static void stop() {if(postgres.isRunning())postgres.stop();}
    @DynamicPropertySource static void db(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",postgres::getJdbcUrl);r.add("spring.datasource.username",postgres::getUsername);r.add("spring.datasource.password",postgres::getPassword);
    }
    @Autowired WebApplicationContext context;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    @Autowired DemoInstallation demo;
    @Autowired MfaPolicy mfa;
    @MockitoBean MarketProvider provider;
    MockMvc mvc;
    @BeforeEach void setup() {mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();jdbc.update("UPDATE demo_installation SET mutation_requests=0");}
    String csrf(MockHttpSession session)throws Exception {return mapper.readTree(mvc.perform(get("/api/v1/auth/csrf").session(session)).andReturn().getResponse().getContentAsString()).get("token").asString();}
    MockHttpSession enter()throws Exception {
        var session=new MockHttpSession();var before=session.getId();
        mvc.perform(post("/api/v1/auth/demo/session").session(session).header("X-CSRF-TOKEN",csrf(session)).header("Origin","https://demo.example.test"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.demo").value(true)).andExpect(jsonPath("$.user.role").value("MEMBER"));
        assertNotEquals(before,session.getId());return session;
    }
    @Test void startupSeedsFullDatasetAndRestartPreservesEdits()throws Exception {
        mvc.perform(get("/actuator/health/readiness")).andExpect(status().isOk());
        assertTrue(mfa.required());assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM app_users",Integer.class));
        assertEquals(7,jdbc.queryForObject("SELECT count(*) FROM financial_accounts",Integer.class));
        assertTrue(jdbc.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class)>100);
        assertTrue(jdbc.queryForObject("SELECT count(*) FROM market_quotes",Integer.class)>600);
        assertEquals(4,jdbc.queryForObject("SELECT count(*) FROM expected_transactions",Integer.class));
        var marker=demo.require();var count=jdbc.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class);
        demo.initialize();assertEquals(marker,demo.require());assertEquals(count,jdbc.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));
        mvc.perform(get("/api/v1/auth/demo")).andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(true)).andExpect(jsonPath("$.nextResetAt").exists());
        verifyNoInteractions(provider);
    }
    @Test void sessionRequiresCsrfAndOriginAndCannotTargetAnotherIdentity()throws Exception {
        mvc.perform(post("/api/v1/auth/demo/session")).andExpect(status().isForbidden());
        var session=new MockHttpSession();
        mvc.perform(post("/api/v1/auth/demo/session").session(session).header("X-CSRF-TOKEN",csrf(session)).header("Origin","https://other.example.test")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/auth/demo/session").session(session).header("X-CSRF-TOKEN",csrf(session)).contentType("application/json").content("{\"userId\":\""+UUID.randomUUID()+"\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.user.id").value(demo.require().userId().toString()));
    }
    @Test void financialReadsAndEditsWorkButDangerousRoutesAreForbidden()throws Exception {
        var session=enter();
        for(var path:List.of("/accounts","/transactions","/categories","/spending","/expected-transactions","/investments/securities","/net-worth/current","/net-worth/trend/options","/users/me/preferences"))
            mvc.perform(get("/api/v1"+path).session(session)).andExpect(status().isOk());
        var account=jdbc.queryForObject("SELECT id FROM financial_accounts WHERE type='INVESTMENT'",UUID.class);
        mvc.perform(get("/api/v1/accounts/"+account+"/balance").session(session).param("date",java.time.LocalDate.now().plusDays(7).toString()).param("includeExpected","true")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        var fund=jdbc.queryForObject("SELECT id FROM investment_securities WHERE type='FUND'",UUID.class);
        mvc.perform(get("/api/v1/investments/accounts/"+account).session(session)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/net-worth/trend").session(session).param("accountIds",account.toString()).param("startDate",java.time.LocalDate.now().minusMonths(11).withDayOfMonth(1).toString()).param("endDate",java.time.LocalDate.now().toString()).param("bucket","MONTH")).andExpect(status().isOk()).andExpect(jsonPath("$.points.length()").value(12));
        mvc.perform(post("/api/v1/market-data/securities/"+fund+"/nav").session(session).header("X-CSRF-TOKEN",csrf(session)).contentType("application/json")
            .content("{\"requestId\":\""+UUID.randomUUID()+"\",\"accountId\":\""+account+"\",\"date\":\"2020-01-01\",\"nav\":\"10.123456789012\"}"))
            .andExpect(status().isCreated());
        for(var path:List.of("/users/me/security","/users/me/registration","/imports/workbooks","/imports/original-categories","/market-data/search?q=demo","/future-feature"))
            mvc.perform(get("/api/v1"+path).session(session)).andExpect(status().isForbidden());
        for(var path:List.of("/auth/register","/users/me/mfa/enrollment/start","/users/me/registration/invitations","/imports/workbooks","/market-data/securities","/market-data/accounts/"+account+"/refresh"))
            mvc.perform(post("/api/v1"+path).session(session).header("X-CSRF-TOKEN",csrf(session)).contentType("application/json").content("{}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(provider);
    }
    @Test void quotaAndGenerationAreEnforcedAndLogoutOnlyEndsItsOwnSession()throws Exception {
        var a=enter();var b=enter();
        jdbc.update("UPDATE demo_installation SET mutation_requests=5000");
        mvc.perform(post("/api/v1/accounts").session(a).header("X-CSRF-TOKEN",csrf(a)).contentType("application/json").content("{}"))
            .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After","60"));
        mvc.perform(post("/api/v1/auth/logout").session(a).header("X-CSRF-TOKEN",csrf(a))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/auth/session").session(b)).andExpect(status().isOk());
        var generation=demo.require().generation();jdbc.update("UPDATE demo_installation SET generation=?",UUID.randomUUID());
        try {mvc.perform(get("/api/v1/accounts").session(b)).andExpect(status().isUnauthorized());}
        finally {jdbc.update("UPDATE demo_installation SET generation=?",generation);}
    }
}
