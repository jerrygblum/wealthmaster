package com.example.wealthmaster.budgets;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;

public final class CategoryDtos {
    private CategoryDtos() {}
    public enum Type { INCOME, SPENDING }
    public record Input(@NotBlank @Size(max=100) String name, @NotNull Type type, UUID parentId) {}
    public record Category(UUID id, String name, Type type, UUID parentId, boolean active,
                           Instant createdAt, long version, boolean hasActivity, boolean hasChildren,
                           boolean available) {}
    public record CategoryList(List<Category> items, boolean starterSetAvailable) {}
    public record Assignment(UUID id, String name, String parentName, boolean available) {}
}
