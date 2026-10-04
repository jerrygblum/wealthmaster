package com.example.wealthmaster.users;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.junit.jupiter.api.Assertions.*;

class MfaPolicyTest {
    @Test void productionCannotBeMadeOptionalByAlsoSelectingDevelopment() {
        var environment = new MockEnvironment();
        environment.setActiveProfiles("prod", "dev");
        environment.setProperty("app.mfa.required", "false");
        assertTrue(new MfaPolicy(environment).required());
    }
    @Test void onlyExplicitDevelopmentMakesEnrollmentOptional() {
        var environment = new MockEnvironment(); environment.setActiveProfiles("dev");
        assertFalse(new MfaPolicy(environment).required());
    }
    @Test void defaultAndOtherProfilesAreSecureByDefault() {
        var environment = new MockEnvironment(); assertTrue(new MfaPolicy(environment).required());
        environment.setActiveProfiles("staging"); assertTrue(new MfaPolicy(environment).required());
    }
}
