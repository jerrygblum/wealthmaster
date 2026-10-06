package com.example.wealthmaster.budgets;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;

public final class CategoryDtos {
    private CategoryDtos() {}
    public enum Type { INCOME, SPENDING }
    public record NormalLimit(@NotNull BudgetSettingService.Mode mode,String limit,BudgetDtos.Source expected,
                              @NotNull @Min(0) Long expectedPreferencesVersion) {}
    public record Input(@NotBlank @Size(max=100) String name, @NotNull Type type, UUID parentId,
                        @jakarta.validation.Valid NormalLimit normalLimit) {
        public Input(String name,Type type,UUID parentId) { this(name,type,parentId,null); }
    }
    public record Category(UUID id, String name, Type type, UUID parentId, boolean active,
                           Instant createdAt, long version, boolean hasActivity, boolean hasChildren,
                           boolean available) {}
    public record CategoryList(List<Category> items, boolean starterSetAvailable) {}
    public record Assignment(UUID id, String name, String parentName, boolean available) {}
}
