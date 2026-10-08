package com.example.wealthmaster.users;

import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OwnerSetupTest {
    @Test void initialOwnerIsNormalizedAndPasswordIsHashed() {
        var users = mock(UserRepository.class);
        var encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            new OwnerSetup(users, encoder, factory.getValidator(), " OWNER@EXAMPLE.TEST ", "synthetic-password").run(new DefaultApplicationArguments());
        }
        var capture = ArgumentCaptor.forClass(AppUser.class);
        verify(users).save(capture.capture());
        assertEquals("owner@example.test", capture.getValue().getEmail());
        assertEquals(AppUser.Role.OWNER, capture.getValue().getRole());
        assertNotEquals("synthetic-password", capture.getValue().getPasswordHash());
        assertTrue(encoder.matches("synthetic-password", capture.getValue().getPasswordHash()));
    }
    @Test void restartNeverResetsExistingCredentials() {
        var users = mock(UserRepository.class); when(users.count()).thenReturn(1L);
        var encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            new OwnerSetup(users, encoder, factory.getValidator(), "", "").run(new DefaultApplicationArguments());
        }
        verify(users).count(); verifyNoMoreInteractions(users);
    }
    @Test void missingInvalidOrOverlongCredentialsFailWithoutDisclosure() {
        var users = mock(UserRepository.class);
        var encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            for (String[] credentials : new String[][]{{"", ""}, {"invalid", "synthetic-password"},
                    {"owner@example.test", "short"}, {"owner@example.test", "é".repeat(37)}}) {
                var setup = new OwnerSetup(users, encoder, factory.getValidator(), credentials[0], credentials[1]);
                var error = assertThrows(IllegalStateException.class, () -> setup.run(new DefaultApplicationArguments()));
                if (!credentials[1].isEmpty()) assertFalse(error.getMessage().contains(credentials[1]));
            }
        }
        verify(users, never()).save(any());
    }
}
