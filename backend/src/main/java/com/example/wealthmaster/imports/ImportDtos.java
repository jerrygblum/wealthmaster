package com.example.wealthmaster.imports;

import java.util.*;
import java.time.*;
import com.example.wealthmaster.accounts.AccountDtos;
import com.example.wealthmaster.budgets.CategoryDtos;

public final class ImportDtos {
    private ImportDtos() {}
    public record Cell(String value, String formula, String type) {}
    public record SourceRow(int number, Map<String,Cell> cells) {}
    public record Sheet(String name, List<SourceRow> rows) {}
    public record Workbook(boolean date1904, List<Sheet> sheets) {}
    public record Selection(String sheet, int headerRow, Map<String,String> columns) {}
    public record AccountTarget(String key, UUID existingId, Long version, AccountDtos.CreateAccount create,
                                String closingBalance) {}
    public record CategoryTarget(String key, UUID existingId, Long version, CategoryDtos.Input create,
                                 String parentKey) {}
    public record Decision(int row, boolean include, String reason, String date, String kind,
                           String account, String card, String category, String amount,
                           String description, Integer partner) {}
    public record DuplicateChoice(String mode, UUID existingId, Long version) {}
    public record Plan(Selection selection, String start, String end, List<AccountTarget> accounts,
                       List<CategoryTarget> categories, List<Decision> rows, Map<String,DuplicateChoice> duplicates) {}
    public record Batch(UUID id, String status, long version, Instant createdAt, Workbook workbook, Plan plan, Receipt receipt) {}
    public record Summary(UUID id, String status, long version, Instant createdAt) {}
    public record Save(long version, Plan plan) {}
    public record Configure(long version, Selection selection) {}
    public record Operation(String key, String kind, String account, String destination, String category,
                            String amount, String currency, String date, String description,
                            boolean reconstructed, List<Integer> rows) {}
    public record Candidate(UUID id, long version, String kind, String amount, String date, String description) {}
    public record Balance(String key, String name, String currency, String opening, String existingMovements,
                          String importedMovements, String projectedClosing, String expectedClosing, String difference) {}
    public record Preview(long version, String token, List<String> errors, List<String> warnings,
                          List<Operation> operations, Map<String,List<Candidate>> duplicates,
                          List<Balance> balances, Map<String,String> totals, List<Integer> excluded) {}
    public record Approval(long version, String token, boolean approveCreations, boolean approveSettlements,
                           boolean approveExclusions, boolean acknowledgeDates, boolean acknowledgeCurrencies,
                           boolean acknowledgeBaselines, boolean acknowledgeUnverified) {}
    public record Receipt(UUID batchId, int createdOperations, int linkedOperations, Map<String,UUID> createdAccounts,
                          Map<String,UUID> createdCategories, Instant committedAt) {}
    public record Undo(long version) {}
    public record UndoPreview(long version, List<String> errors, int operations) {}
}
