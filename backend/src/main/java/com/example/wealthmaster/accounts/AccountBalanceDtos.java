package com.example.wealthmaster.accounts;

import java.time.*;
import java.util.*;

public final class AccountBalanceDtos {
    private AccountBalanceDtos() {}
    public record Entry(String id, LocalDate date, String description, String amount,
                        String source, String kind, UUID operationId, UUID expectationId) {}
    public record Review(UUID expectationId, String name, LocalDate month, String reason) {}
    public record Forecast(String adjustment, String balance, boolean complete, long overdueCount,
                           List<Review> reviews) {}
    public record Balance(UUID accountId, String accountName, AccountType accountType, String currency,
                          boolean active, LocalDate openingDate, LocalDate date, LocalDate businessDate,
                          Instant calculatedAt, boolean available, String openingBalance,
                          String currentBalance, String recordedBalance, String recordedChange,
                          Forecast forecast, List<Entry> entries, int page, boolean hasMore) {}
}
