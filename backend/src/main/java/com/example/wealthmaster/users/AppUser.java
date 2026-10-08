package com.example.wealthmaster.users;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_users")
public class AppUser {
    @Id private UUID id;
    @Column(nullable = false, unique = true, length = 254) private String email;
    @Column(nullable = false) private String passwordHash;
    @Column(nullable = false) private Instant createdAt;
    public enum Role { OWNER, MEMBER }
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 8) private Role role = Role.MEMBER;
    protected AppUser() {}
    public AppUser(String email, String passwordHash) {
        this.id = UUID.randomUUID();
        this.email = email;
        this.passwordHash = passwordHash;
        this.createdAt = Instant.now();
    }
    public AppUser(String email, String passwordHash, Role role) {
        this(email,passwordHash); this.role=role;
    }
    public Role getRole() { return role; }
    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
}
