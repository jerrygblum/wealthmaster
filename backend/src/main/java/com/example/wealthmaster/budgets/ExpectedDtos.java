package com.example.wealthmaster.budgets;

import jakarta.validation.constraints.*;
import com.example.wealthmaster.ledger.LedgerDtos.Operation;
import java.time.LocalDate;
import java.util.*;

public final class ExpectedDtos {
    private ExpectedDtos() {}
    public enum Kind { INCOME, EXPENSE, TRANSFER }
    public record Input(@NotBlank @Size(max=100) String name, @NotNull Kind kind,
        @NotNull UUID accountId, UUID destinationAccountId, UUID categoryId,
        @NotBlank @Pattern(regexp="[0-9]{1,20}(\\.[0-9]{1,8})?") String amount,
        @Min(1) @Max(31) int dayOfMonth, @NotNull LocalDate firstMonth, LocalDate lastMonth,
        @Size(max=200) String payee, @Size(max=2000) String notes) {}
    public record Definition(UUID id, String name, Kind kind, UUID accountId, UUID destinationAccountId,
        UUID categoryId, String amount, String currency, int dayOfMonth, LocalDate firstMonth,
        LocalDate lastMonth, String payee, String notes, long version, boolean available) {}
    public record Occurrence(Definition definition, LocalDate expectedDate, long version,
        String status, Operation actual, String difference, boolean canRecord) {}
    public record Totals(String currency, Kind kind, String expected, String completed,
        String actual, String outstanding) {}
    public record Report(LocalDate month, LocalDate businessDate, List<Definition> definitions,
        List<Occurrence> items, List<Totals> totals) {}
    public record Reconcile(@NotNull @Min(0) Long definitionVersion, UUID operationId,
        Long operationVersion, boolean skipped) {}
    public record RecordInput(@NotNull @Min(0) Long definitionVersion,
        @NotBlank String amount, @NotNull LocalDate transactionDate, LocalDate valueDate,
        @Size(max=200) String payee, @NotBlank @Size(max=500) String description,
        @Size(max=2000) String notes, UUID categoryId) {}
}
