package com.example.wealthmaster.accounts;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public final class AccountDtos {
    private AccountDtos() {}
    public enum Accent { DEFAULT, BLUE, TEAL, PURPLE, AMBER, ROSE }
    public enum Logo { TYPE, UBS, POSTFINANCE, RAIFFEISEN, ZKB, REVOLUT, CUSTOM }
    public record Appearance(@NotNull Accent accent, @Pattern(regexp="#[0-9A-Fa-f]{6}") String color, Logo logo) {
        public Appearance(Accent accent) { this(accent,null,null); }
    }
    public record LogoUpload(@NotBlank @Size(max=44000) String data, @Pattern(regexp="#[0-9A-Fa-f]{6}") String color) {}
    public record OrderedAccount(@NotNull UUID id, @NotNull @Min(0) Long version) {}
    public record AccountOrder(@NotNull java.util.List<@NotNull @jakarta.validation.Valid OrderedAccount> accounts) {}
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
            String currency, String openingBalance, LocalDate openingDate, boolean active, Instant createdAt, long version, boolean hasActivity, String currentBalance, LocalDate balanceAsOf, long displayOrder, Accent accent, com.example.wealthmaster.marketdata.MarketDtos.Valuation valuation, String color, Logo logo, String logoData) {
        public AccountResponse(UUID id,String name,AccountType type,String institution,String currency,String openingBalance,LocalDate openingDate,boolean active,Instant createdAt,long version,boolean hasActivity,String currentBalance,LocalDate balanceAsOf,long displayOrder,Accent accent,com.example.wealthmaster.marketdata.MarketDtos.Valuation valuation) {
            this(id,name,type,institution,currency,openingBalance,openingDate,active,createdAt,version,hasActivity,currentBalance,balanceAsOf,displayOrder,accent,valuation,null,Logo.TYPE,null);
        }
        public AccountResponse(UUID id,String name,AccountType type,String institution,String currency,String openingBalance,LocalDate openingDate,boolean active,Instant createdAt,long version,boolean hasActivity,String currentBalance,LocalDate balanceAsOf,long displayOrder,Accent accent) {
            this(id,name,type,institution,currency,openingBalance,openingDate,active,createdAt,version,hasActivity,currentBalance,balanceAsOf,displayOrder,accent,null);
        }
        public AccountResponse withValuation(com.example.wealthmaster.marketdata.MarketDtos.Valuation value) {
            return new AccountResponse(id,name,type,institution,currency,openingBalance,openingDate,active,createdAt,version,hasActivity,currentBalance,balanceAsOf,displayOrder,accent,value,color,logo,logoData);
        }
        public AccountResponse withActivity(boolean activity) {
            return new AccountResponse(id, name, type, institution, currency, openingBalance, openingDate, active, createdAt, version, activity, currentBalance, balanceAsOf, displayOrder, accent, valuation, color, logo, logoData);
        }
        public AccountResponse withBalance(String balance, LocalDate date) {
            return new AccountResponse(id, name, type, institution, currency, openingBalance, openingDate, active, createdAt, version, hasActivity, balance, date, displayOrder, accent, valuation, color, logo, logoData);
        }
        public AccountResponse forAudit() {
            return new AccountResponse(id,name,type,institution,currency,openingBalance,openingDate,active,createdAt,version,hasActivity,currentBalance,balanceAsOf,displayOrder,accent,valuation,color,logo,null);
        }
        public static AccountResponse from(FinancialAccount account) {
            return new AccountResponse(account.getId(), account.getName(), account.getType(),
                    account.getInstitution(), account.getCurrency(), account.getOpeningBalance().toPlainString(),
                    account.getOpeningDate(), account.isActive(), account.getCreatedAt(), account.getVersion(), false, account.getOpeningBalance().toPlainString(), null, account.getDisplayOrder(), account.getAccent(), null, account.getColor(), account.getLogo(), account.getLogoData());
        }
    }
}
