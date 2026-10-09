package com.example.wealthmaster.users;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

public final class MfaSessionFilter extends OncePerRequestFilter {
    private final MfaSessions sessions;
    public MfaSessionFilter(MfaSessions sessions) { this.sessions = sessions; }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof OwnerPrincipal && !sessions.valid(request)) {
            sessions.clear(request, response);
        }
        chain.doFilter(request, response);
    }
}
