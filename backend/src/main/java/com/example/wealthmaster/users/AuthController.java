package com.example.wealthmaster.users;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }
    @GetMapping("/session")
    public SessionResponse session(@AuthenticationPrincipal OwnerPrincipal owner) {
        return SessionResponse.authenticated(owner);
    }
    public record CsrfResponse(String headerName, String token) {}
    // MFA_REQUIRED will be returned only once a real challenge flow exists.
    public enum AuthenticationStatus { AUTHENTICATED }
    public record SessionResponse(AuthenticationStatus status, UserResponse user) {
        public static SessionResponse authenticated(OwnerPrincipal owner) {
            return new SessionResponse(AuthenticationStatus.AUTHENTICATED,
                    new UserResponse(owner.id(), owner.email()));
        }
    }
    public record UserResponse(UUID id, String email) {}
}
