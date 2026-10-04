package com.example.wealthmaster.users;

import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

@Component
public final class MfaPolicy {
    private final boolean required;
    public MfaPolicy(Environment environment) {
        required = environment.acceptsProfiles(Profiles.of("prod")) || !environment.acceptsProfiles(Profiles.of("dev"));
    }
    public boolean required() { return required; }
}
