package com.example.wealthmaster.budgets;

import com.example.wealthmaster.config.BusinessTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static com.example.wealthmaster.budgets.BudgetDtos.*;

/** Compares selected-period activity with the category's current linked limit. */
@Service
public class EffectiveBudgetService {
    public record Comparison(UUID categoryId, String currency, Period periodType, LocalDate periodStart,
            String limit, String actual, String remaining, String percentage, boolean overBudget, boolean available) {}
    public record EffectiveReport(LocalDate businessDate, List<Comparison> comparisons, List<Summary> currencies) {}
    private record Activity(UUID category, String currency, BigDecimal amount) {}
    private record Key(UUID category, String currency) {}
    private final JdbcTemplate jdbc;
    private final CategoryService categories;
    private final BudgetSettingService settings;
    private final BusinessTime time;
    public EffectiveBudgetService(JdbcTemplate jdbc, CategoryService categories, BudgetSettingService settings, BusinessTime time) {
        this.jdbc=jdbc;this.categories=categories;this.settings=settings;this.time=time;
    }
    public LocalDate cutoff(Period type,LocalDate start) {
        var end=BudgetService.end(type,start);var tomorrow=time.today().plusDays(1);
        return end.isBefore(tomorrow)?end:tomorrow;
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public EffectiveReport report(UUID owner,Period type,LocalDate start) {
        var currentSettings=settings.settings(owner);
        var cats=categories.list(owner).items().stream().filter(c->c.type()==CategoryDtos.Type.SPENDING).toList();
        var parents=new HashMap<UUID,UUID>();
        for(var c:cats) parents.put(c.id(),c.parentId()==null?c.id():c.parentId());
        var normals=currentSettings.stream().filter(s->s.mode()!=BudgetSettingService.Mode.NONE&&cats.stream().anyMatch(c->c.id().equals(s.categoryId())&&c.parentId()==null)).toList();
        var ops=jdbc.query("SELECT category_id,currency,CASE WHEN kind='REFUND' THEN -amount ELSE amount END AS amount FROM ledger_operations WHERE owner_id=? AND NOT deleted AND kind IN ('EXPENSE','REFUND') AND transaction_date>=? AND transaction_date<?",(r,n)->new Activity(r.getObject("category_id",UUID.class),r.getString("currency"),r.getBigDecimal("amount")),owner,start,cutoff(type,start));
        var limits=new HashMap<Key,BigDecimal>();
        var comparisons=new ArrayList<Comparison>();
        for(var s:normals) {
            var limit=BudgetService.allowance(s.mode(),s.limit(),type);
            limits.put(new Key(s.categoryId(),s.currency()),limit);
            var actual=ops.stream().filter(o->o.currency().equals(s.currency())&&s.categoryId().equals(parents.get(o.category()))).map(Activity::amount).reduce(BigDecimal.ZERO,BigDecimal::add);
            var category=cats.stream().filter(c->c.id().equals(s.categoryId())).findFirst().orElseThrow();
            comparisons.add(new Comparison(s.categoryId(),s.currency(),type,start,limit.toPlainString(),actual.toPlainString(),limit.subtract(actual).toPlainString(),BudgetService.percentage(limit,actual),actual.compareTo(limit)>0,category.available()));
        }
        var currencies=new TreeSet<String>();ops.forEach(o->currencies.add(o.currency()));normals.forEach(s->currencies.add(s.currency()));
        var summaries=new ArrayList<Summary>();
        for(var currency:currencies) {
            var selected=ops.stream().filter(o->o.currency().equals(currency)).toList();
            summaries.add(new Summary(currency,selected.stream().map(Activity::amount).reduce(BigDecimal.ZERO,BigDecimal::add).toPlainString(),selected.stream().filter(o->o.category()==null).map(Activity::amount).reduce(BigDecimal.ZERO,BigDecimal::add).toPlainString(),selected.stream().filter(o->!limits.containsKey(new Key(parents.get(o.category()),currency))).map(Activity::amount).reduce(BigDecimal.ZERO,BigDecimal::add).toPlainString()));
        }
        return new EffectiveReport(time.today(),comparisons,summaries);
    }
}
