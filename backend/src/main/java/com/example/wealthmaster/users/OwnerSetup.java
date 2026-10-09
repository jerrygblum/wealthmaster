package com.example.wealthmaster.users;

import jakarta.validation.Validator;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

@Component
public class OwnerSetup implements ApplicationRunner {
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final Validator validator;
    private final String email;
    private final String password;
    public OwnerSetup(UserRepository users, PasswordEncoder encoder, Validator validator,
            @Value("${app.initial-owner.email:}") String email,
            @Value("${app.initial-owner.password:}") String password) {
        this.users = users; this.encoder = encoder; this.validator = validator;
        this.email = email; this.password = password;
    }
    @Override @Transactional
    public void run(ApplicationArguments args) {
        if (users.count() != 0) return;
        var credentials = new InitialCredentials(email.strip().toLowerCase(Locale.ROOT), password);
        if (!validator.validate(credentials).isEmpty()
                || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalStateException("Initial setup requires INITIAL_OWNER_EMAIL and INITIAL_OWNER_PASSWORD (12–72 characters, at most 72 UTF-8 bytes). No credentials were logged.");
        }
        users.save(new AppUser(credentials.email(), encoder.encode(password), AppUser.Role.OWNER));
    }
    private record InitialCredentials(@NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 12, max = 72) String password) {}
}
