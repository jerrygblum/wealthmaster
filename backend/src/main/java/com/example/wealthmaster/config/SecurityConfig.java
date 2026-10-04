package com.example.wealthmaster.config;

import com.example.wealthmaster.users.*;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.Locale;
import java.util.Map;

@Configuration
public class SecurityConfig {
    @Bean PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
    @Bean UserDetailsService userDetailsService(UserRepository users) {
        return email -> users.findByEmail(email.strip().toLowerCase(Locale.ROOT))
                .map(user -> new OwnerPrincipal(user.getId(), user.getEmail(), user.getPasswordHash()))
                .orElseThrow(() -> new UsernameNotFoundException("Invalid credentials"));
    }
    @Bean SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectMapper mapper) throws Exception {
        return http
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/api/v1/meta/status",
                                "/api/v1/auth/csrf", "/api/v1/auth/login").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, error) ->
                                json(mapper, response, 401, Map.of("message", "Please sign in.")))
                        .accessDeniedHandler((request, response, error) ->
                                json(mapper, response, 403, Map.of("message", "Request could not be verified. Refresh and try again."))))
                .formLogin(login -> login
                        .loginProcessingUrl("/api/v1/auth/login")
                        .usernameParameter("email")
                        .successHandler((request, response, authentication) ->
                                json(mapper, response, 200, AuthController.SessionResponse.authenticated(
                                        (OwnerPrincipal) authentication.getPrincipal())))
                        .failureHandler((request, response, error) ->
                                json(mapper, response, 401, Map.of("message", "Invalid email or password."))))
                .logout(logout -> logout.logoutUrl("/api/v1/auth/logout")
                        .deleteCookies("JSESSIONID")
                        .logoutSuccessHandler((request, response, authentication) -> response.setStatus(204)))
                .headers(headers -> headers.cacheControl(cache -> {}))
                .build();
    }
    private static void json(ObjectMapper mapper, HttpServletResponse response, int status, Object body)
            throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(mapper.writeValueAsString(body));
    }
}
