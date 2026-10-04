package com.example.wealthmaster.users;

import com.eatthepath.otp.TimeBasedOneTimePasswordGenerator;
import org.apache.commons.codec.binary.Base32;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.encrypt.AesGcmBytesEncryptor;
import org.springframework.security.crypto.encrypt.BytesEncryptor;
import org.springframework.stereotype.Component;
import javax.crypto.spec.SecretKeySpec;
import java.security.InvalidKeyException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;

@Component
public class MfaCrypto {
    private final BytesEncryptor encryptor;
    private final SecureRandom random = new SecureRandom();
    private final TimeBasedOneTimePasswordGenerator totp = new TimeBasedOneTimePasswordGenerator();
    private final Base32 base32 = new Base32();
    public MfaCrypto(@Value("${app.mfa.encryption-password:}") String password,
            @Value("${app.mfa.encryption-salt:}") String salt) {
        if (password.length() < 32 || !salt.matches("[0-9a-fA-F]{32,}")) {
            throw new IllegalStateException("Set MFA_ENCRYPTION_PASSWORD (at least 32 characters) and MFA_ENCRYPTION_SALT (at least 16 random bytes encoded as an even-length hex string). Preserve them across restarts and restores.");
        }
        if (salt.length() % 2 != 0) throw new IllegalStateException("MFA_ENCRYPTION_SALT must contain an even number of hex characters.");
        encryptor = AesGcmBytesEncryptor.withPassword(password, salt).build();
    }
    public byte[] newSecret() { byte[] bytes = new byte[20]; random.nextBytes(bytes); return bytes; }
    public byte[] encrypt(byte[] secret) { return encryptor.encrypt(secret); }
    public byte[] decrypt(byte[] secret) { return encryptor.decrypt(secret); }
    public String setupKey(byte[] secret) { return base32.encodeToString(secret).replace("=", ""); }
    public String recoveryCode() {
        byte[] bytes = new byte[16]; random.nextBytes(bytes);
        String hex = HexFormat.of().formatHex(bytes);
        return String.join("-", hex.substring(0, 8), hex.substring(8, 16), hex.substring(16, 24), hex.substring(24));
    }
    public long verifyStep(byte[] secret, String code, Instant now, long lastStep) {
        if (code == null || !code.matches("[0-9]{6}")) throw invalidCode();
        long step = now.getEpochSecond() / 30;
        try {
            var key = new SecretKeySpec(secret, "HmacSHA1");
            for (long candidate = step - 1; candidate <= step + 1; candidate++) {
                if (candidate > lastStep && totp.validateOneTimePassword(key, Instant.ofEpochSecond(candidate * 30), code)) {
                    return candidate;
                }
            }
        } catch (InvalidKeyException error) {
            throw new IllegalStateException("Authenticator key could not be used.");
        }
        throw invalidCode();
    }
    private SecurityFailure invalidCode() {
        return new SecurityFailure(400, "Invalid or already-used code. Wait for a new authenticator code and check your device clock.");
    }
}
