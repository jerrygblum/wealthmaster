package com.example.wealthmaster.users;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static com.example.wealthmaster.users.RegistrationService.*;

@ActiveProfiles("dev")
@SpringBootTest(properties={"app.initial-owner.email=owner@example.test","app.initial-owner.password=synthetic-password",
 "app.mfa.encryption-password=synthetic-test-encryption-password-only","app.mfa.encryption-salt=0123456789abcdef0123456789abcdef"})
class RegistrationIntegrationTest {
    static final PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:18-alpine");
    @BeforeAll static void database() { if(System.getProperty("test.database.url")==null) { assumeTrue(DockerClientFactory.instance().isDockerAvailable());postgres.start(); } }
    @AfterAll static void stop() { if(postgres.isRunning()) postgres.stop(); }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",()->System.getProperty("test.database.url",postgres.isRunning()?postgres.getJdbcUrl():""));
        r.add("spring.datasource.username",()->System.getProperty("test.database.username",postgres.getUsername()));
        r.add("spring.datasource.password",()->System.getProperty("test.database.password",postgres.getPassword()));
    }
    @Autowired RegistrationService registration;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwords;
    @Autowired WebApplicationContext context;
    @Autowired ObjectMapper mapper;
    @MockitoBean Clock clock;
    MockMvc mvc;
    final Instant now=Instant.parse("2026-10-08T12:00:00Z");
    @BeforeEach void setup() {
        when(clock.instant()).thenReturn(now);
        jdbc.update("DELETE FROM registration_invitations");jdbc.update("UPDATE registration_settings SET enabled=FALSE,version=0 WHERE id=1");
        jdbc.update("DELETE FROM auth_attempt_limits");
        mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }
    @AfterEach void cleanup() { jdbc.update("DELETE FROM registration_invitations");jdbc.update("UPDATE registration_settings SET enabled=FALSE,version=0 WHERE id=1"); }
    UUID owner() { return users.findByEmail("owner@example.test").orElseThrow().getId(); }
    String email() { return "synthetic."+UUID.randomUUID()+"@example.test"; }
    String csrf(MockHttpSession session) throws Exception {
        return mapper.readTree(mvc.perform(get("/api/v1/auth/csrf").session(session)).andReturn().getResponse().getContentAsString()).get("token").asString();
    }
    MockHttpSession login(String email) throws Exception {
        var session=new MockHttpSession();
        mvc.perform(post("/api/v1/auth/login").session(session).header("X-CSRF-TOKEN",csrf(session)).param("email",email).param("password","synthetic-password")).andExpect(status().isOk());return session;
    }
    Issued invite(String email) { return registration.invite(owner(),new InviteInput(email)); }
    Signup input(Issued issued) { return new Signup(issued.invitation().email(),issued.code(),"synthetic-password"); }
    void enable() { registration.configure(owner(),"\"0\"",new SettingInput(true)); }
    @Test void defaultsToDisabledAndKeepsInvitationsPrivate() throws Exception {
        assertEquals(AppUser.Role.OWNER,users.findById(owner()).orElseThrow().getRole());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM app_users WHERE role='OWNER'",Integer.class));
        mvc.perform(get("/api/v1/auth/registration")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(content().json("{\"enabled\":false}"));
        var issued=invite(email());assertEquals(now.plus(Duration.ofDays(7)),issued.invitation().expiresAt());assertEquals(43,issued.code().length());
        assertNotEquals(issued.code(),jdbc.queryForObject("SELECT code_hash FROM registration_invitations WHERE id=?",String.class,issued.invitation().id()));
        assertThrows(SecurityFailure.class,()->registration.register(input(issued)));
        var ownerSession=login("owner@example.test");
        var body=mvc.perform(get("/api/v1/registration").session(ownerSession)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andReturn().getResponse().getContentAsString();
        assertFalse(body.contains(issued.code()));assertFalse(body.contains("code_hash"));
        var session=new MockHttpSession();
        mvc.perform(post("/api/v1/auth/register").session(session).contentType("application/json").content(mapper.writeValueAsString(input(issued)))).andExpect(status().isForbidden());
        assertNull(jdbc.queryForObject("SELECT used_at FROM registration_invitations WHERE id=?",java.sql.Timestamp.class,issued.invitation().id()));
    }
    @Test void registrationNormalizesEmailConsumesOnceAndSignsInAsMember() throws Exception {
        enable();var issued=invite("  "+email().toUpperCase(Locale.ROOT)+"  ");var session=new MockHttpSession();
        var signup=new Signup(issued.invitation().email().toUpperCase(Locale.ROOT),issued.code(),"synthetic-password");
        mvc.perform(post("/api/v1/auth/register").session(session).header("X-CSRF-TOKEN",csrf(session)).contentType("application/json").content(mapper.writeValueAsString(signup)))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("AUTHENTICATED")).andExpect(jsonPath("$.user.role").value("MEMBER"));
        var user=users.findByEmail(issued.invitation().email()).orElseThrow();assertTrue(passwords.matches(signup.password(),user.getPasswordHash()));
        assertEquals("USED",registration.management(owner()).invitations().getFirst().status());
        assertThrows(SecurityFailure.class,()->registration.register(signup));
        mvc.perform(get("/api/v1/registration").session(session)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/accounts").session(session)).andExpect(status().isOk()).andExpect(content().json("[]"));
        mvc.perform(post("/api/v1/auth/register").session(session).header("X-CSRF-TOKEN",csrf(session)).contentType("application/json").content(mapper.writeValueAsString(signup))).andExpect(status().isConflict());
        registration.configure(owner(),"\"1\"",new SettingInput(false));
        mvc.perform(get("/api/v1/auth/session").session(session)).andExpect(status().isOk());
        assertEquals("AUTHENTICATED",mapper.readTree(mvc.perform(get("/api/v1/auth/session").session(login(user.getEmail()))).andReturn().getResponse().getContentAsString()).get("status").asString());
    }
    @Test void rejectsWrongEmailExpiredRevokedAndReplacedCodesAndStaleVersions() {
        enable();var issued=invite(email());
        var mismatch=new Signup(email(),issued.code(),"synthetic-password");
        var rejected=assertThrows(SecurityFailure.class,()->registration.register(mismatch)).getMessage();
        when(clock.instant()).thenReturn(issued.invitation().expiresAt());
        assertEquals(rejected,assertThrows(SecurityFailure.class,()->registration.register(input(issued))).getMessage());
        var replaced=registration.replace(owner(),issued.invitation().id(),"\"0\"");
        assertEquals(rejected,assertThrows(SecurityFailure.class,()->registration.register(input(issued))).getMessage());
        assertEquals(412,assertThrows(SecurityFailure.class,()->registration.revoke(owner(),issued.invitation().id(),"\"0\"")).status());
        assertEquals(428,assertThrows(SecurityFailure.class,()->registration.revoke(owner(),issued.invitation().id(),null)).status());
        registration.revoke(owner(),issued.invitation().id(),"\"1\"");
        assertEquals(rejected,assertThrows(SecurityFailure.class,()->registration.register(input(replaced))).getMessage());
        assertEquals(412,assertThrows(SecurityFailure.class,()->registration.configure(owner(),"\"0\"",new SettingInput(false))).status());
        assertEquals(403,assertThrows(SecurityFailure.class,()->registration.management(UUID.randomUUID())).status());
    }
    @Test void throttlesFailedSignupIndependentlyAndValidatesPasswords() throws Exception {
        enable();var issued=invite(email());var session=new MockHttpSession();
        for(int n=0;n<5;n++) mvc.perform(post("/api/v1/auth/register").session(session).header("X-CSRF-TOKEN",csrf(session)).contentType("application/json")
            .content(mapper.writeValueAsString(new Signup(issued.invitation().email(),"invalid-code","synthetic-password")))).andExpect(status().is(n==4?429:403));
        mvc.perform(post("/api/v1/auth/register").session(session).header("X-CSRF-TOKEN",csrf(session)).contentType("application/json").content(mapper.writeValueAsString(input(issued)))).andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After","300"));
        assertTrue(login("owner@example.test")!=null);
        when(clock.instant()).thenReturn(now.plusSeconds(301));
        mvc.perform(post("/api/v1/auth/register").session(session).header("X-CSRF-TOKEN",csrf(session)).contentType("application/json")
            .content(mapper.writeValueAsString(new Signup(issued.invitation().email(),issued.code(),"short")))).andExpect(status().isBadRequest());
        assertEquals(400,assertThrows(SecurityFailure.class,()->registration.register(new Signup(issued.invitation().email(),issued.code(),"é".repeat(40)))).status());
    }
    @Test void signupAndInvitationConsumptionRollBackTogether() {
        enable();var issued=invite(email());var before=users.count();
        jdbc.execute("CREATE FUNCTION synthetic_fail_registration() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''synthetic failure''; END'");
        jdbc.execute("CREATE TRIGGER synthetic_registration_failure BEFORE UPDATE ON registration_invitations FOR EACH ROW EXECUTE FUNCTION synthetic_fail_registration()");
        try {assertThrows(org.springframework.dao.DataAccessException.class,()->registration.register(input(issued)));}
        finally {jdbc.execute("DROP TRIGGER synthetic_registration_failure ON registration_invitations");jdbc.execute("DROP FUNCTION synthetic_fail_registration()");}
        assertEquals(before,users.count());assertEquals("ACTIVE",registration.management(owner()).invitations().getFirst().status());
    }
    @Test void concurrentSignupCreatesExactlyOneMember() throws Exception {
        enable();var issued=invite(email());var gate=new CountDownLatch(1);
        Callable<Boolean> task=()-> {gate.await();try {registration.register(input(issued));return true;}catch(SecurityFailure expected){return false;}};
        try(var pool=Executors.newFixedThreadPool(2)) {var a=pool.submit(task);var b=pool.submit(task);gate.countDown();assertNotEquals(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));}
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM app_users WHERE email=?",Integer.class,issued.invitation().email()));
    }
    @Test void administrationRequiresOwnerAndVersionAndCsrf() throws Exception {
        var ownerSession=login("owner@example.test");
        mvc.perform(put("/api/v1/registration").session(ownerSession).contentType("application/json").content("{\"enabled\":true}")).andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/registration").session(ownerSession).header("X-CSRF-TOKEN",csrf(ownerSession)).contentType("application/json").content("{\"enabled\":true}")).andExpect(status().isPreconditionRequired());
        mvc.perform(put("/api/v1/registration").session(ownerSession).header("X-CSRF-TOKEN",csrf(ownerSession)).header("If-Match","\"0\"").contentType("application/json").content("{\"enabled\":true}")).andExpect(status().isOk());
        var member=users.saveAndFlush(new AppUser(email(),passwords.encode("synthetic-password")));var memberSession=login(member.getEmail());
        mvc.perform(post("/api/v1/registration/invitations").session(memberSession).header("X-CSRF-TOKEN",csrf(memberSession)).contentType("application/json").content(mapper.writeValueAsString(new InviteInput(email())))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/registration")).andExpect(status().isUnauthorized());
    }
}
