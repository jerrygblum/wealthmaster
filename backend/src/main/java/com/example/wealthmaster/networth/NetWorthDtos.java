package com.example.wealthmaster.networth;

import com.example.wealthmaster.accounts.AccountType;
import java.time.*;
import java.util.*;

public final class NetWorthDtos {
    private NetWorthDtos() {}
    public record TypeTotal(AccountType type, String assets, String liabilities, String netWorth) {}
    public record CurrencyTotal(String currency, String assets, String liabilities, String netWorth,
                                List<TypeTotal> byAccountType) {}
    public record AccountContribution(UUID id, String name, AccountType type, String currency,
                                      boolean active, String currentBalance) {}
    public record FutureAccount(UUID id, String name, AccountType type, String currency,
                                boolean active, LocalDate openingDate) {}
    public record CurrentNetWorth(LocalDate balanceAsOf, Instant calculatedAt,
                                  List<CurrencyTotal> currencies, List<AccountContribution> accounts,
                                  List<FutureAccount> excludedFutureAccounts) {}
}
