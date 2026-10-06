package com.example.wealthmaster.budgets;

import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.*;

public final class BudgetDtos {
    private BudgetDtos() {}
    public enum Period { MONTH, YEAR }
    public record Source(@NotNull UUID id, @Min(0) long version) {}
    public record Summary(String currency, String netSpending, String uncategorized, String unbudgeted) {}
    public record Report(Period periodType, LocalDate periodStart, List<Summary> currencies, List<EffectiveBudgetService.Comparison> comparisons, LocalDate businessDate) {}
}
