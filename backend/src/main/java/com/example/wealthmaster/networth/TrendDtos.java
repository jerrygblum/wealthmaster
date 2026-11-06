package com.example.wealthmaster.networth;

import com.example.wealthmaster.accounts.AccountType;
import java.time.*;
import java.util.*;

public final class TrendDtos {
    private TrendDtos() {}
    public enum Bucket { DAY, WEEK, MONTH, QUARTER, YEAR }
    public record Account(UUID id, String name, AccountType type, String currency, LocalDate openingDate, boolean active) {}
    public record Options(LocalDate businessDate, List<Account> accounts) {}
    public record Period(LocalDate startDate, LocalDate endDate, boolean partial) {}
    public record PriceSource(UUID securityId, String securityName, String currency, LocalDate priceDate, Instant quotedAt,
                              Instant fetchedAt, String source, boolean stale, boolean missing) {}
    public record Value(UUID accountId, boolean opened, String value, String knownSubtotal,
                        int missingPositions, boolean stale, List<PriceSource> sources) {}
    public record Total(String currency, String value, String knownSubtotal, int missingPositions, boolean stale) {}
    public record Point(Period period, List<Value> accounts, List<Total> currencies) {}
    public record Trend(LocalDate startDate, LocalDate endDate, Bucket bucket, LocalDate businessDate,
                        Instant calculatedAt, List<Account> accounts, List<Point> points) {}
}
