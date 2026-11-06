package com.example.wealthmaster.users;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.Map;

public final class DemoGateFilter extends OncePerRequestFilter {
    private final DemoConfig config;
    private final DemoInstallation installation;
    private final MfaSessions sessions;
    private final ObjectMapper mapper;
    public DemoGateFilter(DemoConfig config,DemoInstallation installation,MfaSessions sessions,ObjectMapper mapper) {
        this.config=config;this.installation=installation;this.sessions=sessions;this.mapper=mapper;
    }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException {
        if (!config.enabled()) {chain.doFilter(request,response);return;}
        String path=request.getRequestURI().substring(request.getContextPath().length());
        try {
            if (path.equals("/api/v1/auth/login") || path.equals("/api/v1/auth/register") || path.startsWith("/api/v1/auth/mfa/"))
                throw new SecurityFailure(403,"Use Try demo to enter this shared sandbox.");
            boolean mutation=!request.getMethod().equals("GET") && !request.getMethod().equals("HEAD");
            String origin=request.getHeader("Origin");
            if(mutation && origin!=null && !origin.equals(config.origin())) throw new SecurityFailure(403,"Demo requests must use the configured public origin.");
            var auth=SecurityContextHolder.getContext().getAuthentication();
            boolean guest=auth!=null && auth.getAuthorities().stream().anyMatch(a->a.getAuthority().equals("ROLE_DEMO"));
            boolean sessionRoute=path.equals("/api/v1/auth/csrf") || path.equals("/api/v1/auth/demo")
                || path.equals("/api/v1/auth/session") || path.equals("/api/v1/auth/demo/session") || path.equals("/api/v1/auth/logout");
            if(guest && !sessionRoute) {
                if(!DemoAccess.allowed(request)) throw new SecurityFailure(403,"This feature is unavailable in the public demo.");
                if(mutation) {
                    var state=sessions.require(request);
                    installation.consumeMutation(state.userId(),state.demoGeneration());
                }
            }
            chain.doFilter(request,response);
        } catch(SecurityFailure e) {
            response.setStatus(e.status());response.setContentType("application/json");response.setHeader("Cache-Control","no-store");
            if(e.retryAfter()>0)response.setHeader("Retry-After",Long.toString(e.retryAfter()));
            response.getWriter().write(mapper.writeValueAsString(Map.of("message",e.getMessage(),"retryAfterSeconds",e.retryAfter())));
        }
    }
}
