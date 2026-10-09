package com.example.wealthmaster.users;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.stereotype.Component;
import java.io.Serializable;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import static com.example.wealthmaster.users.AuthController.AuthenticationStatus.*;

@Component
public class MfaSessions {
    private static final String STATE = "wealthmaster.authentication";
    private static final String BINDING = "wealthmaster.mfa.binding";
    private final MfaService mfa;
    private final Clock clock;
    private final UserRepository users;
    public MfaSessions(MfaService mfa, Clock clock, UserRepository users) { this.mfa = mfa; this.clock = clock; this.users=users; }
    public AuthController.SessionResponse passwordAccepted(OwnerPrincipal owner, HttpServletRequest request, HttpServletResponse response) {
        var snapshot = mfa.snapshot(owner.id());
        var status = snapshot.enabled() ? MFA_REQUIRED : snapshot.required() ? MFA_SETUP_REQUIRED : AUTHENTICATED;
        var state = new SessionState(owner.id(), owner.email(), status, snapshot.version(),
                status == MFA_REQUIRED ? clock.instant().plusSeconds(300) : null, null, false);
        save(state, request, response);
        return response(state);
    }
    public AuthController.SessionResponse verified(MfaService.Snapshot snapshot, HttpServletRequest request, HttpServletResponse response) {
        var previous = require(request);
        var state = new SessionState(previous.userId(), previous.email(), AUTHENTICATED, snapshot.version(), null,
                snapshot.verifiedAt(), snapshot.recoveryUsed());
        save(state, request, response);
        return response(state);
    }
    public SessionState require(HttpServletRequest request) {
        var session = request.getSession(false);
        var state = session == null ? null : (SessionState) session.getAttribute(STATE);
        if (state == null || state.expiresAt() != null && !clock.instant().isBefore(state.expiresAt())) {
            throw new SecurityFailure(401, "Your session expired. Please sign in again.");
        }
        return state;
    }
    public AuthController.SessionResponse current(HttpServletRequest request) { return response(require(request)); }
    public String binding(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session == null) throw new SecurityFailure(401, "Please sign in.");
        String binding = (String) session.getAttribute(BINDING);
        if (binding == null) { binding = UUID.randomUUID().toString(); session.setAttribute(BINDING, binding); }
        return binding;
    }
    public boolean valid(HttpServletRequest request) {
        try {
            var state = require(request);
            var authentication = SecurityContextHolder.getContext().getAuthentication();
            if (!(authentication.getPrincipal() instanceof OwnerPrincipal owner) || !owner.id().equals(state.userId())) return false;
            String expectedRole = switch (state.status()) {
                case AUTHENTICATED -> "ROLE_USER"; case MFA_REQUIRED -> "ROLE_MFA_PENDING"; case MFA_SETUP_REQUIRED -> "ROLE_MFA_SETUP";
            };
            if (authentication.getAuthorities().stream().noneMatch(authority -> authority.getAuthority().equals(expectedRole))) return false;
            var snapshot = mfa.snapshot(state.userId());
            return snapshot.version() == state.version()
                    && (state.status() != AUTHENTICATED || (snapshot.enabled() ? state.verifiedAt() != null : !snapshot.required()));
        } catch (SecurityFailure error) { return false; }
    }
    public void clear(HttpServletRequest request, HttpServletResponse response) {
        var session = request.getSession(false); if (session != null) session.invalidate();
        SecurityContextHolder.clearContext();
        new HttpSessionSecurityContextRepository().saveContext(SecurityContextHolder.createEmptyContext(), request, response);
    }
    private void save(SessionState state, HttpServletRequest request, HttpServletResponse response) {
        HttpSession session = request.getSession(); request.changeSessionId();
        session.setAttribute(STATE, state);
        String role = switch (state.status()) {
            case AUTHENTICATED -> "ROLE_USER"; case MFA_REQUIRED -> "ROLE_MFA_PENDING"; case MFA_SETUP_REQUIRED -> "ROLE_MFA_SETUP";
        };
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new OwnerPrincipal(state.userId(), state.email(), ""), null, List.of(new SimpleGrantedAuthority(role))));
        SecurityContextHolder.setContext(context);
        new HttpSessionSecurityContextRepository().saveContext(context, request, response);
        new HttpSessionCsrfTokenRepository().saveToken(null, request, response);
    }
    private AuthController.SessionResponse response(SessionState state) {
        return new AuthController.SessionResponse(state.status(), new AuthController.UserResponse(state.userId(), state.email(), users.findById(state.userId()).orElseThrow(() -> new SecurityFailure(401,"Please sign in.")).getRole()), state.recoveryUsed());
    }
    public record SessionState(UUID userId, String email, AuthController.AuthenticationStatus status, long version,
            Instant expiresAt, Instant verifiedAt, boolean recoveryUsed) implements Serializable {}
}
