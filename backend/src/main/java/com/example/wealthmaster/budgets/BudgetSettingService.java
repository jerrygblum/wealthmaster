package com.example.wealthmaster.budgets;

import com.example.wealthmaster.config.BusinessTime;
import jakarta.validation.constraints.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

@Service
public class BudgetSettingService {
    public enum Mode { NONE, MONTH, YEAR }
    public record Setting(UUID id, UUID categoryId, String currency, Mode mode, String limit, long version, String monthlyLimit, String yearlyLimit) {
        public Setting(UUID id,UUID categoryId,String currency,Mode mode,String limit,long version) {
            this(id,categoryId,currency,mode,limit,version,derived(mode,limit,BudgetDtos.Period.MONTH),derived(mode,limit,BudgetDtos.Period.YEAR));
        }
        private static String derived(Mode mode,String limit,BudgetDtos.Period period) {
            var value=BudgetService.allowance(mode,limit,period);return value==null?null:value.toPlainString();
        }
    }
    public record Input(@NotNull UUID categoryId, @NotBlank String currency, @NotNull Mode mode, String limit, BudgetDtos.Source expected) {}
    public record Settings(LocalDate businessDate, List<Setting> items) {}
    private final com.example.wealthmaster.users.CurrencyPolicy currencyPolicy;
    private final JdbcTemplate jdbc;
    private final CategoryService categories;
    private final BusinessTime time;
    private final ObjectMapper mapper;
    public BudgetSettingService(JdbcTemplate jdbc, CategoryService categories, BusinessTime time, ObjectMapper mapper, com.example.wealthmaster.users.CurrencyPolicy currencyPolicy) {
        this.currencyPolicy=currencyPolicy;this.jdbc=jdbc;this.categories=categories;this.time=time;this.mapper=mapper;
    }
    static void currency(String currency) {
        try { if(currency==null || !currency.matches("[A-Z]{3}")) throw new IllegalArgumentException(); Currency.getInstance(currency); }
        catch(IllegalArgumentException e) { throw new IllegalArgumentException("Choose an ISO 4217 currency."); }
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Settings list(UUID owner) { return new Settings(time.today(), settings(owner)); }
    List<Setting> settings(UUID owner) {
        return jdbc.query("SELECT * FROM budget_settings WHERE owner_id=? ORDER BY category_id,currency",(r,n)->new Setting(r.getObject("id",UUID.class),r.getObject("category_id",UUID.class),r.getString("currency"),Mode.valueOf(r.getString("mode")),r.getBigDecimal("amount")==null?null:r.getBigDecimal("amount").toPlainString(),r.getLong("version")),owner);
    }
    Setting find(UUID owner, UUID category, String currency) { return settings(owner).stream().filter(s->s.categoryId().equals(category)&&s.currency().equals(currency)).findFirst().orElse(null); }
    static void check(Setting actual, BudgetDtos.Source expected) {
        if(actual==null ? expected!=null : expected==null || !actual.id().equals(expected.id()) || actual.version()!=expected.version())
            throw new CategoryFailure(412,"The normal limit changed. Your input is retained; reload before saving.");
    }
    @Transactional
    public Setting save(UUID owner, Input input) {
        categories.lock(owner); currency(input.currency());
        var category=categories.list(owner).items().stream().filter(c->c.id().equals(input.categoryId())&&c.type()==CategoryDtos.Type.SPENDING).findFirst().orElseThrow(()->new CategoryFailure(404,"Spending category not found."));
        BudgetService.requireMainCategory(category.parentId());
        if(input.mode()!=Mode.NONE) currencyPolicy.normal(owner,input.currency());
        var before=find(owner,input.categoryId(),input.currency());check(before,input.expected());
        if(input.mode()==null) throw new IllegalArgumentException("Choose No limit, Monthly or Yearly.");
        if(input.mode()!=Mode.NONE && !category.available() && (before==null || before.mode()==Mode.NONE)) throw new CategoryFailure(409,"Restore this category branch before enabling a normal limit.");
        var amount=input.mode()==Mode.NONE?null:BudgetService.amount(input.limit());
        var id=before==null?UUID.randomUUID():before.id();var version=before==null?0:before.version()+1;
        if(before==null) jdbc.update("INSERT INTO budget_settings(id,owner_id,category_id,currency,mode,amount) VALUES(?,?,?,?,?,?)",id,owner,input.categoryId(),input.currency(),input.mode().name(),amount);
        else jdbc.update("UPDATE budget_settings SET mode=?,amount=?,version=? WHERE id=?",input.mode().name(),amount,version,id);
        jdbc.update("INSERT INTO budget_setting_category_history(setting_id,category_id) SELECT ?,id FROM categories WHERE id=? OR id=(SELECT parent_id FROM categories WHERE id=?) ON CONFLICT DO NOTHING",id,input.categoryId(),input.categoryId());
        var after=new Setting(id,input.categoryId(),input.currency(),input.mode(),amount==null?null:amount.toPlainString(),version);
        jdbc.update("INSERT INTO audit_events(id,actor_id,event_type,resource_id,details) VALUES(?,?,?,?,CAST(? AS jsonb))",UUID.randomUUID(),owner,"BUDGET_NORMAL_CHANGED",id,mapper.writeValueAsString(new Change(before,after)));
        return after;
    }
    private record Change(Setting before, Setting after) {}
}
