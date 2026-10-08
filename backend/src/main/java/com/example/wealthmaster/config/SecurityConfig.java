package com.example.wealthmaster.config;

import com.example.wealthmaster.users.*;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.Clock;
import java.util.Locale;
import java.util.Map;

@Configuration
public class SecurityConfig {
    @Bean Clock securityClock() { return Clock.systemUTC(); }
    @Bean PasswordEncoder passwordEncoder() { return PasswordEncoderFactories.createDelegatingPasswordEncoder(); }
    @Bean UserDetailsService userDetailsService(UserRepository users) {
        return email -> users.findByEmail(email.strip().toLowerCase(Locale.ROOT))
                .map(user -> new OwnerPrincipal(user.getId(), user.getEmail(), user.getPasswordHash()))
                .orElseThrow(() -> new UsernameNotFoundException("Invalid credentials"));
    }
    @Bean AuthenticationProvider passwordAuthenticationProvider(UserDetailsService users, PasswordEncoder passwords, AttemptLimiter limits) {
        var delegate = new DaoAuthenticationProvider(users); delegate.setPasswordEncoder(passwords);
        return new AuthenticationProvider() {
            @Override public Authentication authenticate(Authentication input) throws AuthenticationException {
                String email = input.getName().strip().toLowerCase(Locale.ROOT);
                if (email.length() > 254) throw new org.springframework.security.authentication.BadCredentialsException("Invalid credentials");
                return limits.guard("password:" + email, () -> {
                    try { return delegate.authenticate(input); }
                    catch (IllegalArgumentException error) {
                        throw new org.springframework.security.authentication.BadCredentialsException("Invalid credentials");
                    }
                });
            }
            @Override public boolean supports(Class<?> type) { return delegate.supports(type); }
        };
    }
    @Bean SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectMapper mapper, MfaSessions sessions,
            AuthenticationProvider provider) throws Exception {
        return http.authenticationManager(new org.springframework.security.authentication.ProviderManager(provider))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/api/v1/meta/status", "/api/v1/auth/csrf", "/api/v1/auth/login", "/api/v1/auth/registration", "/api/v1/auth/register").permitAll()
                        .requestMatchers("/api/v1/auth/session").hasAnyRole("USER", "MFA_PENDING", "MFA_SETUP")
                        .requestMatchers("/api/v1/auth/mfa/verify").hasRole("MFA_PENDING")
                        .requestMatchers("/api/v1/users/me/mfa/replacement/**", "/api/v1/users/me/mfa/recovery/**").hasRole("USER")
                        .requestMatchers("/api/v1/users/me/security", "/api/v1/users/me/mfa/enrollment/**", "/api/v1/users/me/mfa/pending/cancel")
                            .hasAnyRole("USER", "MFA_SETUP")
                        .anyRequest().hasRole("USER"))
                .addFilterBefore(new MfaSessionFilter(sessions), AuthorizationFilter.class)
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, error) -> json(mapper, response, 401, Map.of("message", "Please sign in.")))
                        .accessDeniedHandler((request, response, error) -> json(mapper, response, 403,
                                Map.of("message", "Access denied. Complete verification or refresh and try again."))))
                .formLogin(login -> login.loginProcessingUrl("/api/v1/auth/login").usernameParameter("email")
                        .successHandler((request, response, authentication) -> json(mapper, response, 200,
                                sessions.passwordAccepted((OwnerPrincipal) authentication.getPrincipal(), request, response)))
                        .failureHandler((request, response, error) -> {
                            if (error instanceof SecurityFailure failure) {
                                if (failure.retryAfter() > 0) response.setHeader("Retry-After", Long.toString(failure.retryAfter()));
                                json(mapper, response, failure.status(), Map.of("message", failure.getMessage(), "retryAfterSeconds", failure.retryAfter()));
                            } else json(mapper, response, 401, Map.of("message", "Invalid email or password."));
                        }))
                .logout(logout -> logout.logoutUrl("/api/v1/auth/logout").deleteCookies("JSESSIONID")
                        .logoutSuccessHandler((request, response, authentication) -> response.setStatus(204)))
                .build();
    }
    private static void json(ObjectMapper mapper, HttpServletResponse response, int status, Object body) throws IOException {
        response.setStatus(status); response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(mapper.writeValueAsString(body));
    }
}
