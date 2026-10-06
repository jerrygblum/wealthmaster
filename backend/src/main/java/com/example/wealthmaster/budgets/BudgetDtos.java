package com.example.wealthmaster.budgets;

import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.*;

public final class BudgetDtos {
    private BudgetDtos() {}
    public enum Period { MONTH, YEAR }
    public record Input(@NotNull UUID categoryId, @NotBlank String currency, @NotNull Period periodType,
                        @NotNull LocalDate periodStart, @NotBlank String limit) {}
    public record Limit(@NotBlank String limit) {}
    public record Source(@NotNull UUID id, @Min(0) long version) {}
    public record Copy(@NotEmpty List<@jakarta.validation.Valid Source> sources, @NotNull LocalDate targetPeriodStart) {}
    public record Budget(UUID id, UUID categoryId, String categoryName, UUID parentId, String parentName,
                         String currency, Period periodType, LocalDate periodStart, String limit,
                         String actual, String remaining, String percentage, boolean overBudget,
                         boolean available, long version) {}
    public record Summary(String currency, String netSpending, String uncategorized, String unbudgeted) {}
    public record Report(Period periodType, LocalDate periodStart, List<Budget> items, List<Summary> currencies, List<EffectiveBudgetService.Comparison> comparisons, LocalDate businessDate) {}
    public record Skip(UUID id, String reason) {}
    public record CopyResult(List<Budget> created, List<Skip> skipped) {}
}
