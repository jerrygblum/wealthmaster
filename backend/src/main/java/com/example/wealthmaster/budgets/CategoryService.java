package com.example.wealthmaster.budgets;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import static com.example.wealthmaster.budgets.CategoryDtos.*;

@Service
public class CategoryService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public CategoryService(JdbcTemplate jdbc, ObjectMapper mapper) { this.jdbc = jdbc; this.mapper = mapper; }
    private static final String SELECT = """
        SELECT c.*, (EXISTS(SELECT 1 FROM ledger_category_history h WHERE h.category_id=c.id) OR EXISTS(SELECT 1 FROM expected_category_history h WHERE h.category_id=c.id)) AS used,
        EXISTS(SELECT 1 FROM categories child WHERE child.parent_id=c.id) AS children,
        (c.active AND COALESCE(p.active,TRUE)) AS available
        FROM categories c LEFT JOIN categories p ON p.id=c.parent_id
        """;
    private Category row(java.sql.ResultSet r, int n) throws java.sql.SQLException {
        return new Category(r.getObject("id", UUID.class), r.getString("name"), Type.valueOf(r.getString("type")),
            r.getObject("parent_id", UUID.class), r.getBoolean("active"), r.getTimestamp("created_at").toInstant(),
            r.getLong("version"), r.getBoolean("used"), r.getBoolean("children"), r.getBoolean("available"));
    }
    /** Category writers and ledger assignments serialize here; this lock never acquires account/operation locks. */
    public void lock(UUID owner) {
        jdbc.update("INSERT INTO category_owner_state(owner_id) VALUES(?) ON CONFLICT DO NOTHING", owner);
        jdbc.queryForObject("SELECT starter_installed FROM category_owner_state WHERE owner_id=? FOR UPDATE", Boolean.class, owner);
    }
    @Transactional(readOnly=true, isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public CategoryList list(UUID owner) {
        var items = jdbc.query(SELECT + " WHERE c.owner_id=? ORDER BY c.type,lower(c.name),c.id", this::row, owner);
        boolean installed = Boolean.TRUE.equals(jdbc.queryForObject("SELECT COALESCE((SELECT starter_installed FROM category_owner_state WHERE owner_id=?),FALSE)", Boolean.class, owner));
        return new CategoryList(items, items.isEmpty() && !installed);
    }
    private Category owned(UUID owner, UUID id) {
        var found = jdbc.query(SELECT + " WHERE c.id=? AND c.owner_id=?", this::row, id, owner);
        if (found.isEmpty()) throw new CategoryFailure(404, "Category not found.");
        return found.getFirst();
    }
    private void match(Category category, String match) {
        if (match == null) throw new CategoryFailure(428, "Reload categories before making this change.");
        if (!match.matches("\"[0-9]+\"")) throw new CategoryFailure(400, "If-Match must contain a quoted category version.");
        if (!match.equals("\"" + category.version() + "\"")) throw new CategoryFailure(412, "This category changed. Reload categories and try again.");
    }
    private String validate(UUID owner, UUID id, Input input, UUID unchangedParent) {
        if (input.name() == null || input.name().strip().isEmpty() || input.name().length() > 100 || input.type() == null)
            throw new IllegalArgumentException("Enter a category name of 1–100 characters and a type.");
        if (input.parentId() != null) {
            if (input.parentId().equals(id)) throw new IllegalArgumentException("A category cannot be its own parent.");
            var parent = owned(owner, input.parentId());
            if (parent.parentId() != null || parent.type() != input.type()) throw new IllegalArgumentException("Choose a top-level parent of the same category type.");
            if (!parent.active() && !Objects.equals(parent.id(), unchangedParent)) throw new CategoryFailure(409, "Restore the parent before adding or moving a subcategory.");
        }
        var name = input.name().strip();
        if (jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM categories WHERE owner_id=? AND type=? AND parent_id IS NOT DISTINCT FROM ?::uuid AND lower(name)=lower(?) AND id IS DISTINCT FROM ?::uuid)", Boolean.class, owner, input.type().name(), input.parentId(), name, id))
            throw new CategoryFailure(409, "A category with this name already exists in this group, including archived categories.");
        return name;
    }
    @Transactional
    public Category create(UUID owner, Input input) {
        lock(owner); return insert(owner, input);
    }
    private Category insert(UUID owner, Input input) {
        var name = validate(owner, null, input, null); var id = UUID.randomUUID();
        jdbc.update("INSERT INTO categories(id,owner_id,name,type,parent_id) VALUES(?,?,?,?,?)", id, owner, name, input.type().name(), input.parentId());
        var after = owned(owner, id); audit(owner, id, "CATEGORY_CREATED", null, after); return after;
    }
    @Transactional
    public Category update(UUID owner, UUID id, String version, Input input) {
        lock(owner); var before = owned(owner, id); match(before, version);
        boolean structural = before.type() != input.type() || !Objects.equals(before.parentId(), input.parentId());
        if (structural && (before.hasActivity() || before.hasChildren())) throw new CategoryFailure(409, "Type and parent are locked because this category has history or subcategories.");
        var name = validate(owner, id, input, before.parentId());
        jdbc.update("UPDATE categories SET name=?,type=?,parent_id=?,version=version+1 WHERE id=?", name, input.type().name(), input.parentId(), id);
        var after = owned(owner, id); audit(owner, id, "CATEGORY_UPDATED", before, after); return after;
    }
    @Transactional
    public Category setActive(UUID owner, UUID id, String version, boolean active) {
        lock(owner); var before = owned(owner, id); match(before, version);
        jdbc.update("UPDATE categories SET active=?,version=version+1 WHERE id=?", active, id);
        var after = owned(owner, id); audit(owner, id, active ? "CATEGORY_RESTORED" : "CATEGORY_ARCHIVED", before, after); return after;
    }
    @Transactional
    public void delete(UUID owner, UUID id, String version) {
        lock(owner); var before = owned(owner, id); match(before, version);
        if (before.hasActivity() || before.hasChildren()) throw new CategoryFailure(409, "This category has history or subcategories. Archive it instead.");
        jdbc.update("DELETE FROM categories WHERE id=?", id); audit(owner, id, "CATEGORY_DELETED", before, null);
    }
    @Transactional
    public CategoryList starterSet(UUID owner) {
        lock(owner);
        if (!list(owner).starterSetAvailable()) throw new CategoryFailure(409, "The starter set is available only once, for an empty category list.");
        insert(owner, new Input("Salary", Type.INCOME, null)); insert(owner, new Input("Other income", Type.INCOME, null));
        for (var branch : List.of(List.of("Housing", "Rent", "Utilities"), List.of("Food", "Groceries", "Dining out"), List.of("Transport", "Public transport", "Fuel"), List.of("Health"), List.of("Leisure"), List.of("Other spending"))) {
            var parent = insert(owner, new Input(branch.getFirst(), Type.SPENDING, null));
            for (var child : branch.subList(1, branch.size())) insert(owner, new Input(child, Type.SPENDING, parent.id()));
        }
        jdbc.update("UPDATE category_owner_state SET starter_installed=TRUE WHERE owner_id=?", owner); return list(owner);
    }
    /** Called inside the ledger transaction, after its account locks and before replacing movements. */
    public void validateAssignment(UUID owner, UUID categoryId, UUID previousId, boolean income) {
        if (categoryId == null) return;
        var category = owned(owner, categoryId);
        if (category.type() != (income ? Type.INCOME : Type.SPENDING)) throw new IllegalArgumentException("Choose a category matching income or spending.");
        if (!category.available() && !categoryId.equals(previousId)) throw new CategoryFailure(409, "Restore the category and its parent before assigning it.");
    }
    public Assignment assignment(UUID categoryId) {
        if (categoryId == null) return null;
        return jdbc.queryForObject("SELECT c.id,c.name,p.name AS parent_name,(c.active AND COALESCE(p.active,TRUE)) AS available FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE c.id=?", (r,n) -> new Assignment(r.getObject("id", UUID.class), r.getString("name"), r.getString("parent_name"), r.getBoolean("available")), categoryId);
    }
    public void remember(UUID operationId, UUID categoryId) {
        if (categoryId == null) return;
        jdbc.update("INSERT INTO ledger_category_history(operation_id,category_id) SELECT ?,id FROM categories WHERE id=? OR id=(SELECT parent_id FROM categories WHERE id=?) ON CONFLICT DO NOTHING", operationId, categoryId, categoryId);
    }
    private record Change(Category before, Category after) {}
    private void audit(UUID owner, UUID id, String event, Category before, Category after) {
        jdbc.update("INSERT INTO audit_events(id,actor_id,event_type,resource_id,details) VALUES(?,?,?,?,CAST(? AS jsonb))", UUID.randomUUID(), owner, event, id, mapper.writeValueAsString(new Change(before,after)));
    }
}
