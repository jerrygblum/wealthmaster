package com.example.wealthmaster.marketdata;

import java.time.*;
import java.util.*;
import jakarta.validation.constraints.*;

public final class MarketDtos {
    private MarketDtos() {}
    public record Listing(String symbol,String name,String exchange,String type) {}
    public record Point(Instant at,String close) {}
    public record Quote(String symbol,String name,String exchange,String type,String currency,
                        String price,String previousClose,Instant quotedAt,List<Point> series) {}
    public record HoldingValue(UUID securityId,String name,String symbol,String quantity,String currency,
         String price,String previousClose,String changePercent,List<Point> series,Instant quotedAt,Instant fetchedAt,
         String source,String nativeValue,String fxRate,Instant fxQuotedAt,String accountValue,boolean stale,
         LocalDate navDate,List<NavPoint> navHistory,String reference) {}
    public record Valuation(String currency,String cash,String holdingsValue,String totalValue,int unvaluedHoldings,
                            boolean stale,List<HoldingValue> holdings) {}
    public record NavPoint(LocalDate date,String nav) {}
    public record NavInput(@NotNull UUID requestId,@NotNull UUID accountId,@NotNull LocalDate date,
        @NotBlank @Pattern(regexp="[0-9]{1,26}(\\.[0-9]{1,12})?") String nav,@Size(max=500) String reference) {}
    public record NavEntry(UUID id,UUID securityId,LocalDate date,String nav,String currency,Instant recordedAt,String reference) {}
    public record Refresh(List<String> messages) {}
    public record SymbolInput(@NotBlank @Size(max=64) String symbol) {}
}
