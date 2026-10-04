package com.example.wealthmaster.accounts;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "financial_accounts")
public class FinancialAccount {
    @Id private UUID id;
    @Column(nullable = false) private UUID ownerId;
    @Column(nullable = false, length = 100) private String name;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private AccountType type;
    @Column(length = 100) private String institution;
    @Column(nullable = false, length = 3) private String currency;
    @Column(nullable = false, precision = 28, scale = 8) private BigDecimal openingBalance;
    @Column(nullable = false) private LocalDate openingDate;
    @Column(nullable = false) private boolean active;
    @Column(nullable = false) private Instant createdAt;
    protected FinancialAccount() {}
    public FinancialAccount(UUID ownerId, String name, AccountType type, String institution,
            String currency, BigDecimal openingBalance, LocalDate openingDate) {
        this.id = UUID.randomUUID(); this.ownerId = ownerId; this.name = name; this.type = type;
        this.institution = institution; this.currency = currency; this.openingBalance = openingBalance;
        this.openingDate = openingDate; this.active = true; this.createdAt = Instant.now();
    }
    public UUID getId() { return id; }
    public String getName() { return name; }
    public AccountType getType() { return type; }
    public String getInstitution() { return institution; }
    public String getCurrency() { return currency; }
    public BigDecimal getOpeningBalance() { return openingBalance; }
    public LocalDate getOpeningDate() { return openingDate; }
    public boolean isActive() { return active; }
    public Instant getCreatedAt() { return createdAt; }
}
