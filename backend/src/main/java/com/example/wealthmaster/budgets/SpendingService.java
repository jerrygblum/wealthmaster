package com.example.wealthmaster.budgets;

import com.example.wealthmaster.ledger.LedgerDtos;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

@Service
public class SpendingService {
    public record Amounts(String expenses, String refunds, String netSpending) {}
    public record Group(UUID categoryId, String currency, Amounts direct, Amounts inclusive) {}
    public record CurrencyTotal(String currency, String expenses, String refunds, String netSpending, String uncategorized, String unbudgeted) {}
    public record Report(BudgetDtos.Period periodType, LocalDate periodStart, List<CategoryDtos.Category> categories,
                         List<Group> groups, List<CurrencyTotal> currencies, List<EffectiveBudgetService.Comparison> limits, LocalDate businessDate, List<BudgetSettingService.Setting> settings) {}
    private record Key(UUID category, String currency) {}
    private record Totals(BigDecimal expenses, BigDecimal refunds) {
        Totals add(Totals other) { return new Totals(expenses.add(other.expenses), refunds.add(other.refunds)); }
        Amounts dto() { return new Amounts(expenses.toPlainString(), refunds.toPlainString(), expenses.subtract(refunds).toPlainString()); }
    }
    private static final Totals ZERO = new Totals(BigDecimal.ZERO, BigDecimal.ZERO);
    private final JdbcTemplate jdbc;
    private final CategoryService categories;
    private final BudgetService budgets;
    private final EffectiveBudgetService effective;
    private final BudgetSettingService settings;
    public SpendingService(JdbcTemplate jdbc, CategoryService categories, BudgetService budgets, EffectiveBudgetService effective, BudgetSettingService settings) {
        this.jdbc=jdbc; this.categories=categories; this.budgets=budgets;this.effective=effective;this.settings=settings;
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Report report(UUID owner, BudgetDtos.Period type, LocalDate start) {
        var budget=budgets.report(owner,type,start);
        var cats=categories.list(owner).items().stream().filter(c->c.type()==CategoryDtos.Type.SPENDING).toList();
        var direct=new HashMap<Key,Totals>();
        jdbc.query("""
            SELECT category_id,currency,
              SUM(CASE WHEN kind='EXPENSE' THEN amount ELSE 0 END) AS expenses,
              SUM(CASE WHEN kind='REFUND' THEN amount ELSE 0 END) AS refunds
            FROM ledger_operations WHERE owner_id=? AND NOT deleted AND kind IN ('EXPENSE','REFUND')
              AND transaction_date>=? AND transaction_date<? GROUP BY category_id,currency
            """, (r,n)-> { direct.put(new Key(r.getObject("category_id",UUID.class),r.getString("currency")),new Totals(r.getBigDecimal("expenses"),r.getBigDecimal("refunds"))); return 0; },owner,budget.periodStart(),effective.cutoff(budget.periodType(),budget.periodStart()));
        var groups=new ArrayList<Group>(); var totals=new ArrayList<CurrencyTotal>();
        for(var currency:budget.currencies()) {
            var sum=ZERO;
            for(var entry:direct.entrySet()) if(entry.getKey().currency().equals(currency.currency())) sum=sum.add(entry.getValue());
            var amounts=sum.dto();
            totals.add(new CurrencyTotal(currency.currency(),amounts.expenses(),amounts.refunds(),amounts.netSpending(),currency.uncategorized(),currency.unbudgeted()));
            for(var c:cats) {
                var own=direct.getOrDefault(new Key(c.id(),currency.currency()),ZERO); var inclusive=own;
                for(var child:cats) if(c.id().equals(child.parentId())) inclusive=inclusive.add(direct.getOrDefault(new Key(child.id(),currency.currency()),ZERO));
                groups.add(new Group(c.id(),currency.currency(),own.dto(),inclusive.dto()));
            }
            var uncategorized=direct.getOrDefault(new Key(null,currency.currency()),ZERO).dto();
            groups.add(new Group(null,currency.currency(),uncategorized,uncategorized));
        }
        return new Report(budget.periodType(),budget.periodStart(),cats,groups,totals,budget.comparisons(),budget.businessDate(),settings.settings(owner));
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public LedgerDtos.ActivityPage activity(UUID owner,BudgetDtos.Period type,LocalDate start,String currency,UUID category,int page) {
        if(page<0 || page>1000000) throw new IllegalArgumentException("Invalid page.");
        try { Currency.getInstance(currency); } catch(Exception e) { throw new IllegalArgumentException("Choose an ISO 4217 currency."); }
        if(category!=null && categories.list(owner).items().stream().noneMatch(c->c.id().equals(category) && c.type()==CategoryDtos.Type.SPENDING)) throw new CategoryFailure(404,"Spending category not found.");
        var period=budgets.report(owner,type,start);
        var items=jdbc.query("""
            SELECT o.* FROM ledger_operations o LEFT JOIN categories c ON c.id=o.category_id
            WHERE o.owner_id=? AND NOT o.deleted AND o.kind IN ('EXPENSE','REFUND') AND o.currency=?
            AND o.transaction_date>=? AND o.transaction_date<?
            AND ((?::uuid IS NULL AND o.category_id IS NULL) OR o.category_id=? OR c.parent_id=?)
            ORDER BY o.transaction_date DESC,o.created_at DESC,o.id LIMIT 51 OFFSET ?
            """,(r,n)->new LedgerDtos.Operation(r.getObject("id",UUID.class),LedgerDtos.Kind.valueOf(r.getString("kind")),r.getObject("account_id",UUID.class),null,r.getBigDecimal("amount").toPlainString(),r.getString("currency"),r.getObject("transaction_date",LocalDate.class),r.getObject("value_date",LocalDate.class),r.getString("payee"),r.getString("description"),r.getString("notes"),r.getTimestamp("created_at").toInstant(),r.getLong("version"),r.getObject("category_id",UUID.class),categories.assignment(r.getObject("category_id",UUID.class))),owner,currency,period.periodStart(),effective.cutoff(period.periodType(),period.periodStart()),category,category,category,page*50);
        return new LedgerDtos.ActivityPage(items.stream().limit(50).toList(),page,items.size()>50);
    }
}
