package com.example.wealthmaster.users;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;
import java.util.UUID;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static com.example.wealthmaster.users.RegistrationService.*;
@ActiveProfiles("prod")
@SpringBootTest(properties={"app.initial-owner.email=owner@example.test","app.initial-owner.password=synthetic-password",
 "app.mfa.encryption-password=synthetic-test-encryption-password-only","app.mfa.encryption-salt=0123456789abcdef0123456789abcdef"})
class RegistrationProdIntegrationTest {
    static final PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:18-alpine");
    @BeforeAll static void database() {if(System.getProperty("test.database.url")==null){assumeTrue(DockerClientFactory.instance().isDockerAvailable());postgres.start();}}
    @AfterAll static void stop(){if(postgres.isRunning())postgres.stop();}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){
        r.add("spring.datasource.url",()->System.getProperty("test.database.url",postgres.isRunning()?postgres.getJdbcUrl():""));
        r.add("spring.datasource.username",()->System.getProperty("test.database.username",postgres.getUsername()));
        r.add("spring.datasource.password",()->System.getProperty("test.database.password",postgres.getPassword()));
    }
    @Autowired RegistrationService registration;@Autowired UserRepository users;@Autowired JdbcTemplate jdbc;
    @Autowired WebApplicationContext context;@Autowired ObjectMapper mapper;
    @Test void productionSignupRequiresMfaBeforeAnyFinanceOrAdministration() throws Exception {
        jdbc.update("DELETE FROM registration_invitations");jdbc.update("DELETE FROM auth_attempt_limits");jdbc.update("UPDATE registration_settings SET enabled=FALSE,version=0 WHERE id=1");
        var owner=users.findByEmail("owner@example.test").orElseThrow().getId();registration.configure(owner,"\"0\"",new SettingInput(true));
        try {
            var issued=registration.invite(owner,new InviteInput("synthetic."+UUID.randomUUID()+"@example.test"));
            MockMvc mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();var session=new MockHttpSession();
            var csrf=mapper.readTree(mvc.perform(get("/api/v1/auth/csrf").session(session)).andReturn().getResponse().getContentAsString()).get("token").asString();
            mvc.perform(post("/api/v1/auth/register").session(session).header("X-CSRF-TOKEN",csrf).contentType("application/json").content(mapper.writeValueAsString(new Signup(issued.invitation().email(),issued.code(),"synthetic-password"))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("MFA_SETUP_REQUIRED")).andExpect(jsonPath("$.user.role").value("MEMBER"));
            for(var path:new String[]{"/api/v1/accounts","/api/v1/spending","/api/v1/registration"})mvc.perform(get(path).session(session)).andExpect(status().isForbidden());
            mvc.perform(get("/api/v1/users/me/security").session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.required").value(true));
        } finally {jdbc.update("DELETE FROM registration_invitations");jdbc.update("UPDATE registration_settings SET enabled=FALSE,version=0 WHERE id=1");}
    }
}
