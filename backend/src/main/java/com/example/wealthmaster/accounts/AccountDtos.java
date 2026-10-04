package com.example.wealthmaster.accounts;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public final class AccountDtos {
    private AccountDtos() {}
    public enum BalanceMeaning { BALANCE, AMOUNT_OWED, IN_CREDIT }
    public record CreateAccount(
            @NotBlank @Size(max = 100) String name,
            @NotNull AccountType type,
            @Size(max = 100) String institution,
            @NotBlank @Pattern(regexp = "[A-Z]{3}") String currency,
            @NotBlank @Size(max = 40) @Pattern(regexp = "-?[0-9]{1,20}(\\.[0-9]{1,8})?") String openingAmount,
            @NotNull BalanceMeaning balanceMeaning,
            @NotNull LocalDate openingDate) {}
    public record AccountResponse(UUID id, String name, AccountType type, String institution,
            String currency, String openingBalance, LocalDate openingDate, boolean active, Instant createdAt) {
        public static AccountResponse from(FinancialAccount account) {
            return new AccountResponse(account.getId(), account.getName(), account.getType(),
                    account.getInstitution(), account.getCurrency(), account.getOpeningBalance().toPlainString(),
                    account.getOpeningDate(), account.isActive(), account.getCreatedAt());
        }
    }
}
