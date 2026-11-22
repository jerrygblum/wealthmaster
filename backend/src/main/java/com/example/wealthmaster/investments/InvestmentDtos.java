package com.example.wealthmaster.investments;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;

public final class InvestmentDtos {
    private InvestmentDtos() {}
    public enum Kind { OPENING, BUY, SELL }
    public record SecurityInput(@NotBlank @Size(max=100) String name,@NotBlank @Size(max=32) String symbol,
        @NotBlank @Size(max=64) String exchange,@Size(max=12) String isin,@NotBlank String type,@NotBlank String currency) {}
    public record Security(UUID id,String name,String symbol,String exchange,String isin,String type,String currency) {}
    public record Charge(@NotBlank String type,@NotBlank String amount,@NotBlank String currency) {}
    public record AllocationInput(@NotNull UUID lotId,@NotBlank String quantity) {}
    public record Input(@NotNull UUID requestId,@NotNull UUID accountId,@NotNull UUID securityId,@NotNull Kind kind,
        @NotBlank String quantity,String unitPrice,@NotNull LocalDate tradeDate,LocalDate cashDate,
        LocalDate acquiredOn,String settlement,String acquisitionCost,boolean aggregateOpening,
        @Size(max=20) List<@NotNull @Valid Charge> charges,@Size(max=200) String reference,@Size(max=2000) String notes,
        boolean cashOnlyConfirmed,@Size(max=1000) List<@NotNull @Valid AllocationInput> allocations) {}
    public record Commit(@NotNull @Valid Input input,@NotBlank String token,boolean approved) {}
    public record Activity(UUID id,UUID accountId,UUID securityId,Kind kind,String quantity,String unitPrice,String gross,
        LocalDate tradeDate,LocalDate cashDate,LocalDate acquiredOn,String settlement,String acquisitionCost,
        String cashCurrency,String tradeCurrency,boolean aggregateOpening,List<Charge> charges,String reference,String notes,
        UUID cashOperationId,long version,boolean reversed,Instant createdAt,List<Allocation> allocations) {}
    public record Lot(UUID id,UUID activityId,UUID securityId,LocalDate date,LocalDate acquiredOn,boolean aggregateOpening,
        String quantity,String remaining,String remainingCost) {}
    public record Holding(Security security,String quantity,String knownCost,boolean costComplete,String averageCost,List<Lot> lots) {}
    public record AccountView(UUID accountId,String cashCurrency,String cashBalance,LocalDate asOf,
        boolean active,List<Security> securities,List<Holding> holdings,List<Activity> activities) {}
    public record Allocation(UUID lotId,String quantity,String cashCost) {}
    public record Preview(String token,List<String> errors,List<String> warnings,String gross,String cashMovement,
        String cashCurrency,String tradeCurrency,List<Lot> availableLots,List<Allocation> allocations) {}
    public record ReversalPreview(String token,List<String> errors,String cashMovement) {}
    public record Reversal(@Min(0) long version,@NotBlank String token,boolean approved) {}
}
