package com.example.wealthmaster.users;

import com.example.wealthmaster.accounts.*;
import com.example.wealthmaster.config.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import java.util.Optional;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = AuthenticationTest.TestConfig.class)
@WebAppConfiguration
class AuthenticationTest {
    @Configuration @EnableWebMvc @EnableWebSecurity
    @Import({SecurityConfig.class, AuthController.class, MfaController.class, MfaSessions.class, AccountController.class, ApiErrors.class})
    static class TestConfig {
        @Bean UserRepository users() { return mock(UserRepository.class); }
        @Bean AccountService accounts() { return mock(AccountService.class); }
        @Bean MfaService mfa() { return mock(MfaService.class); }
        @Bean AttemptLimiter limits() {
            var limits = mock(AttemptLimiter.class);
            when(limits.guard(anyString(), any())).thenAnswer(invocation -> ((java.util.function.Supplier<?>) invocation.getArgument(1)).get());
            return limits;
        }
        @Bean ObjectMapper mapper() { return JsonMapper.builder().findAndAddModules().build(); }
    }
    @Autowired WebApplicationContext context;
    @Autowired UserRepository users;
    @Autowired AccountService accounts;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper mapper;
    @Autowired MfaService mfa;
    MockMvc mvc;
    AppUser owner;
    @BeforeEach void setup() {
        reset(users, accounts, mfa);
        when(mfa.snapshot(any())).thenReturn(new MfaService.Snapshot(false, 0, false, null, false));
        owner = new AppUser("owner@example.test", encoder.encode("synthetic-password"));
        when(users.findByEmail("owner@example.test")).thenReturn(Optional.of(owner));
        when(accounts.list(owner.getId())).thenReturn(List.of());
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }
    private String csrf(MockHttpSession session) throws Exception {
        var result = mvc.perform(get("/api/v1/auth/csrf").session(session)).andExpect(status().isOk()).andReturn();
        return mapper.readTree(result.getResponse().getContentAsString()).get("token").asString();
    }
    private MockHttpSession login(MockHttpSession session) throws Exception {
        var result = mvc.perform(post("/api/v1/auth/login").session(session).header("X-CSRF-TOKEN", csrf(session))
                        .param("email", "OWNER@example.test").param("password", "synthetic-password"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("AUTHENTICATED"))
                .andExpect(jsonPath("$.user.email").value("owner@example.test"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist()).andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }
    @Test void loginRotatesSessionRestoresIdentityAndLogoutRevokesIt() throws Exception {
        var session = new MockHttpSession(); String before = session.getId();
        session = login(session); assertNotEquals(before, session.getId());
        mvc.perform(get("/api/v1/auth/session").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.user.id").value(owner.getId().toString()));
        mvc.perform(get("/api/v1/accounts").session(session)).andExpect(status().isOk());
        verify(accounts).list(owner.getId());
        mvc.perform(post("/api/v1/auth/logout").session(session).header("X-CSRF-TOKEN", csrf(session)))
                .andExpect(status().isNoContent());
        assertTrue(session.isInvalid());
        mvc.perform(get("/api/v1/accounts")).andExpect(status().isUnauthorized());
    }
    @Test void inconsistentPrincipalOrPrematureUserRoleCannotBypassSessionState() throws Exception {
        var session = login(new MockHttpSession());
        var context = org.springframework.security.core.context.SecurityContextHolder.createEmptyContext();
        context.setAuthentication(org.springframework.security.authentication.UsernamePasswordAuthenticationToken.authenticated(
                new OwnerPrincipal(java.util.UUID.randomUUID(), "other@example.test", ""), null,
                List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_USER"))));
        session.setAttribute("SPRING_SECURITY_CONTEXT", context);
        mvc.perform(get("/api/v1/accounts").session(session)).andExpect(status().isUnauthorized());
        verifyNoInteractions(accounts);
        when(mfa.snapshot(any())).thenReturn(new MfaService.Snapshot(true, 0, false, null, false));
        session = new MockHttpSession();
        mvc.perform(post("/api/v1/auth/login").session(session).header("X-CSRF-TOKEN", csrf(session))
                .param("email", "owner@example.test").param("password", "synthetic-password"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("MFA_REQUIRED"));
        context.setAuthentication(org.springframework.security.authentication.UsernamePasswordAuthenticationToken.authenticated(
                new OwnerPrincipal(owner.getId(), owner.getEmail(), ""), null,
                List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_USER"))));
        session.setAttribute("SPRING_SECURITY_CONTEXT", context);
        mvc.perform(get("/api/v1/accounts").session(session)).andExpect(status().isUnauthorized());
    }
    @Test void wrongPasswordAndUnknownEmailHaveTheSameGenericResponse() throws Exception {
        for (String email : new String[]{"owner@example.test", "unknown@example.test"}) {
            var session = new MockHttpSession();
            mvc.perform(post("/api/v1/auth/login").session(session).header("X-CSRF-TOKEN", csrf(session))
                            .param("email", email).param("password", "wrong-password"))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.message").value("Invalid email or password."));
            mvc.perform(get("/api/v1/auth/session").session(session)).andExpect(status().isUnauthorized());
        }
    }
    @Test void csrfIsRequiredForLoginCreationAndLogout() throws Exception {
        mvc.perform(post("/api/v1/auth/login").param("email", "owner@example.test").param("password", "synthetic-password"))
                .andExpect(status().isForbidden());
        var session = login(new MockHttpSession());
        mvc.perform(post("/api/v1/accounts").session(session).contentType("application/json").content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/auth/logout").session(session)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/auth/session").session(session)).andExpect(status().isOk());
    }
    @Test void csrfRotatesAfterLoginAndOldTokenCannotCreateAccount() throws Exception {
        var session = new MockHttpSession(); String before = csrf(session);
        session = login(session);
        mvc.perform(post("/api/v1/accounts").session(session).header("X-CSRF-TOKEN", before)
                        .contentType("application/json").content("{}"))
                .andExpect(status().isForbidden());
    }
    @Test void unauthenticatedRequestsAndInvalidAccountPayloadsAreRejected() throws Exception {
        mvc.perform(get("/api/v1/accounts")).andExpect(status().isUnauthorized());
        var session = login(new MockHttpSession());
        mvc.perform(post("/api/v1/accounts").session(session).header("X-CSRF-TOKEN", csrf(session))
                        .contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fields.name").exists());
        verify(accounts, never()).create(any(), any());
    }
}
