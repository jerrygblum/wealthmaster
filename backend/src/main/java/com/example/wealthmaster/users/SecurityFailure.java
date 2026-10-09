package com.example.wealthmaster.users;

import org.springframework.security.core.AuthenticationException;

public final class SecurityFailure extends AuthenticationException {
    private final int status;
    private final long retryAfter;
    public SecurityFailure(int status, String message) { this(status, message, 0); }
    public SecurityFailure(int status, String message, long retryAfter) {
        super(message); this.status = status; this.retryAfter = retryAfter;
    }
    public int status() { return status; }
    public long retryAfter() { return retryAfter; }
}
