package com.example.wealthmaster.users;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final MfaSessions sessions;
    private final MfaService mfa;
    public AuthController(MfaSessions sessions, MfaService mfa) { this.sessions = sessions; this.mfa = mfa; }
    @GetMapping("/csrf") public CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }
    @GetMapping("/session") public SessionResponse session(HttpServletRequest request) { return sessions.current(request); }
    @PostMapping("/mfa/verify")
    public SessionResponse verify(@Valid @RequestBody VerifyInput input, HttpServletRequest request, HttpServletResponse response) {
        var state = sessions.require(request);
        if (state.status() != AuthenticationStatus.MFA_REQUIRED) throw new SecurityFailure(409, "No login verification is pending.");
        return sessions.verified(mfa.verifyLogin(state.userId(), state.version(), input.code(), input.kind()), request, response);
    }
    public record CsrfResponse(String headerName, String token) {}
    public enum AuthenticationStatus { AUTHENTICATED, MFA_REQUIRED, MFA_SETUP_REQUIRED }
    public record SessionResponse(AuthenticationStatus status, UserResponse user, boolean recoveryUsed) {}
    public record UserResponse(UUID id, String email, AppUser.Role role) {}
    public record VerifyInput(@NotBlank @Size(max = 64) String code, @NotNull MfaService.FactorKind kind) {
        @Override public String toString() { return "VerifyInput[redacted]"; }
    }
}
