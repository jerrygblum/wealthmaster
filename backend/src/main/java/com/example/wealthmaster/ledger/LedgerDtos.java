package com.example.wealthmaster.ledger;

import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;

public final class LedgerDtos {
    private LedgerDtos() {}
    public enum Kind { INCOME, EXPENSE, REFUND, TRANSFER }
    public record TransactionInput(@NotNull UUID accountId, @NotNull Kind kind,
        @NotBlank @Pattern(regexp="[0-9]{1,20}(\\.[0-9]{1,8})?") String amount,
        @NotNull LocalDate transactionDate, LocalDate valueDate, @Size(max=200) String payee,
        @NotBlank @Size(max=500) String description, @Size(max=2000) String notes) {}
    public record TransferInput(@NotNull UUID sourceAccountId, @NotNull UUID destinationAccountId,
        @NotBlank @Pattern(regexp="[0-9]{1,20}(\\.[0-9]{1,8})?") String amount,
        @NotNull LocalDate transactionDate, @NotBlank @Size(max=500) String description,
        @Size(max=2000) String notes) {}
    public record Operation(UUID id, Kind kind, UUID accountId, UUID destinationAccountId,
        String amount, String currency, LocalDate transactionDate, LocalDate valueDate,
        String payee, String description, String notes, Instant createdAt, long version) {}
    public record ActivityPage(List<Operation> items, int page, boolean hasMore) {}
}
