package com.example.wealthmaster.users;

import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Arrays;
import static org.junit.jupiter.api.Assertions.*;

class MfaCryptoTest {
    final MfaCrypto crypto = new MfaCrypto("synthetic-test-encryption-password-only", "0123456789abcdef0123456789abcdef");
    final byte[] rfcSecret = "12345678901234567890".getBytes(StandardCharsets.US_ASCII);
    @Test void rfc6238Sha1VectorAndReplayProtection() {
        assertEquals(1, crypto.verifyStep(rfcSecret, "287082", Instant.ofEpochSecond(59), -1));
        assertThrows(SecurityFailure.class, () -> crypto.verifyStep(rfcSecret, "287082", Instant.ofEpochSecond(59), 1));
    }
    @Test void clockToleranceIsLimitedToOnePeriodAndLeadingZerosArePreserved() {
        // RFC vector at t=1111111109 has an eight-digit value 07081804, hence six-digit 081804.
        var time = Instant.ofEpochSecond(1111111109);
        assertEquals(time.getEpochSecond() / 30, crypto.verifyStep(rfcSecret, "081804", time.plusSeconds(30), -1));
        assertEquals(time.getEpochSecond() / 30, crypto.verifyStep(rfcSecret, "081804", time.minusSeconds(30), -1));
        assertThrows(SecurityFailure.class, () -> crypto.verifyStep(rfcSecret, "081804", time.plusSeconds(60), -1));
        assertThrows(SecurityFailure.class, () -> crypto.verifyStep(rfcSecret, "81804", time, -1));
    }
    @Test void encryptionIsRandomizedAuthenticatedAndRoundTrips() {
        var first = crypto.encrypt(rfcSecret); var second = crypto.encrypt(rfcSecret);
        assertFalse(Arrays.equals(first, second)); assertFalse(Arrays.equals(first, rfcSecret));
        assertArrayEquals(rfcSecret, crypto.decrypt(first));
        first[first.length - 1] ^= 1;
        assertThrows(RuntimeException.class, () -> crypto.decrypt(first));
    }
    @Test void missingEncryptionConfigurationFailsWithoutGeneratingFallbackKeys() {
        assertThrows(IllegalStateException.class, () -> new MfaCrypto("", ""));
        assertThrows(IllegalStateException.class, () -> new MfaCrypto("synthetic-test-encryption-password-only", "f".repeat(33)));
    }
}
