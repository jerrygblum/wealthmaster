package com.example.wealthmaster.budgets;

import com.example.wealthmaster.config.BusinessTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static com.example.wealthmaster.budgets.BudgetDtos.*;

/** Resolves recurring settings and explicit exceptions without generating future database rows. */
@Service
public class EffectiveBudgetService {
    public record Comparison(UUID categoryId, String currency, Period periodType, LocalDate periodStart,
            String source, String limit, String actual, String remaining, String percentage, boolean overBudget,
            LocalDate usageStart, LocalDate usageEnd, boolean currentPeriod, boolean available,
            Source settingReference, Source overrideReference, int accruedMonths, int coveredMonths) {}
    public record EffectiveReport(LocalDate businessDate, List<Comparison> comparisons, List<Summary> currencies) {}
    public record Month(LocalDate periodStart, boolean accrued, Comparison comparison) {}
    public record Breakdown(LocalDate businessDate, BudgetSettingService.Setting setting, List<Month> items) {}
    record Key(UUID category, String currency, Period type, LocalDate start) {}
    record ExceptionLimit(UUID id, UUID category, String currency, Period type, LocalDate start, BigDecimal amount, long version) {}
    private record Resolved(Period type, LocalDate start, BigDecimal amount, String source, Source exception, int accrued, int covered) {}
    private record Activity(UUID category, String currency, LocalDate date, BigDecimal amount) {}
    private final JdbcTemplate jdbc;
    private final CategoryService categories;
    private final BudgetSettingService settings;
    private final BusinessTime time;
    public EffectiveBudgetService(JdbcTemplate jdbc, CategoryService categories, BudgetSettingService settings, BusinessTime time) {
        this.jdbc=jdbc;this.categories=categories;this.settings=settings;this.time=time;
    }
    List<ExceptionLimit> exceptions(UUID owner) {
        return jdbc.query("SELECT * FROM spending_budgets WHERE owner_id=? AND NOT deleted",(r,n)->new ExceptionLimit(r.getObject("id",UUID.class),r.getObject("category_id",UUID.class),r.getString("currency"),Period.valueOf(r.getString("period_type")),r.getObject("period_start",LocalDate.class),r.getBigDecimal("amount"),r.getLong("version")),owner);
    }
    private class Snapshot {
        final List<CategoryDtos.Category> cats;
        final List<BudgetSettingService.Setting> normals;
        final List<BudgetSettingService.Revision> revisions;
        final Map<Key,ExceptionLimit> overrides=new HashMap<>();
        Snapshot(UUID owner) {
            cats=categories.list(owner).items().stream().filter(c->c.type()==CategoryDtos.Type.SPENDING).toList();
            normals=settings.settings(owner);revisions=settings.revisions(owner);
            for(var b:exceptions(owner)) overrides.put(new Key(b.category(),b.currency(),b.type(),b.start()),b);
        }
        BudgetSettingService.Setting normal(UUID id,String currency) {return normals.stream().filter(s->s.categoryId().equals(id)&&s.currency().equals(currency)).findFirst().orElse(null);}
        Resolved exact(UUID id,String currency,Period type,LocalDate start) {
            var override=overrides.get(new Key(id,currency,type,start));
            if(override!=null) return new Resolved(type,start,override.amount(),"EXCEPTION",new Source(override.id(),override.version()),0,0);
            var normal=normal(id,currency);
            if(normal!=null) for(var revision:revisions) if(revision.settingId().equals(normal.id())&&revision.periodType()==type&&!revision.effectiveFrom().isAfter(start)) {
                return revision.amount()==null?null:new Resolved(type,start,revision.amount(),"NORMAL",null,0,0);
            }
            return null;
        }
        Resolved resolve(UUID id,String currency,Period type,LocalDate start) {
            var direct=exact(id,currency,type,start);if(direct!=null)return direct;
            if(type==Period.MONTH) return exact(id,currency,Period.YEAR,start.withDayOfYear(1));
            var sum=BigDecimal.ZERO;int accrued=0,covered=0;boolean any=false;
            for(int month=0;month<12;month++) {
                var date=start.plusMonths(month);var value=exact(id,currency,Period.MONTH,date);
                if(value!=null)any=true;
                if(!date.isAfter(time.today())) {accrued++;if(value!=null){covered++;sum=sum.add(value.amount());}}
            }
            return any?new Resolved(Period.YEAR,start,sum,"MONTHLY_ROLLUP",null,accrued,covered):null;
        }
        Comparison comparison(UUID id,String currency,Resolved value,LocalDate reportCutoff,List<Activity> activities) {
            if(value==null)return null;
            var from=value.start();var until=min(BudgetService.end(value.type(),from),reportCutoff);
            var actual=activities.stream().filter(o->o.currency().equals(currency)&&!o.date().isBefore(from)&&o.date().isBefore(until)&&includes(id,o.category())).map(Activity::amount).reduce(BigDecimal.ZERO,BigDecimal::add);
            var normal=normal(id,currency);var category=cats.stream().filter(c->c.id().equals(id)).findFirst().orElseThrow();
            return new Comparison(id,currency,value.type(),from,value.source(),value.amount().toPlainString(),actual.toPlainString(),value.amount().subtract(actual).toPlainString(),BudgetService.percentage(value.amount(),actual),actual.compareTo(value.amount())>0,from,until.isAfter(from)?until.minusDays(1):null,from.equals(current(value.type())),category.available(),normal==null?null:new Source(normal.id(),normal.version()),value.exception(),value.accrued(),value.covered());
        }
        boolean includes(UUID root,UUID assigned) {return root.equals(assigned)||cats.stream().anyMatch(c->c.id().equals(assigned)&&root.equals(c.parentId()));}
        boolean covered(Activity o,Period reportType,LocalDate reportStart) {
            if(o.category()==null)return false;
            var parent=cats.stream().filter(c->c.id().equals(o.category())).map(CategoryDtos.Category::parentId).filter(Objects::nonNull).findFirst().orElse(null);
            for(var id:parent==null?List.of(o.category()):List.of(o.category(),parent)) {
                if(reportType==Period.YEAR&&exact(id,o.currency(),Period.YEAR,reportStart)!=null)return true;
                if(resolve(id,o.currency(),Period.MONTH,o.date().withDayOfMonth(1))!=null)return true;
            }
            return false;
        }
    }
    public LocalDate current(Period type) {return type==Period.MONTH?time.today().withDayOfMonth(1):time.today().withDayOfYear(1);}
    public LocalDate cutoff(Period type,LocalDate start) {return min(BudgetService.end(type,start),time.today().plusDays(1));}
    private static LocalDate min(LocalDate a,LocalDate b) {return a.isBefore(b)?a:b;}
    private List<Activity> activities(UUID owner,LocalDate start,LocalDate until) {
        return jdbc.query("SELECT category_id,currency,transaction_date,CASE WHEN kind='REFUND' THEN -amount ELSE amount END AS amount FROM ledger_operations WHERE owner_id=? AND NOT deleted AND kind IN ('EXPENSE','REFUND') AND transaction_date>=? AND transaction_date<?",(r,n)->new Activity(r.getObject("category_id",UUID.class),r.getString("currency"),r.getObject("transaction_date",LocalDate.class),r.getBigDecimal("amount")),owner,start,until);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public EffectiveReport report(UUID owner,Period type,LocalDate start) {
        var snapshot=new Snapshot(owner);var until=cutoff(type,start);var ops=activities(owner,start.withDayOfYear(1),until);
        var currencies=new TreeSet<String>();ops.stream().filter(o->!o.date().isBefore(start)).forEach(o->currencies.add(o.currency()));
        snapshot.normals.forEach(s->currencies.add(s.currency()));snapshot.overrides.values().forEach(b->currencies.add(b.currency()));
        var comparisons=new ArrayList<Comparison>();var summaries=new ArrayList<Summary>();
        for(var currency:currencies) {
            var currencyComparisons=new ArrayList<Comparison>();
            for(var c:snapshot.cats){var comparison=snapshot.comparison(c.id(),currency,snapshot.resolve(c.id(),currency,type,start),until,ops);if(comparison!=null)currencyComparisons.add(comparison);}
            var selected=ops.stream().filter(o->o.currency().equals(currency)&&!o.date().isBefore(start)).toList();
            if(selected.isEmpty()&&currencyComparisons.isEmpty())continue;
            comparisons.addAll(currencyComparisons);
            summaries.add(new Summary(currency,selected.stream().map(Activity::amount).reduce(BigDecimal.ZERO,BigDecimal::add).toPlainString(),selected.stream().filter(o->o.category()==null).map(Activity::amount).reduce(BigDecimal.ZERO,BigDecimal::add).toPlainString(),selected.stream().filter(o->!snapshot.covered(o,type,start)).map(Activity::amount).reduce(BigDecimal.ZERO,BigDecimal::add).toPlainString()));
        }
        return new EffectiveReport(time.today(),comparisons,summaries);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Breakdown breakdown(UUID owner,UUID category,String currency,int year) {
        BudgetSettingService.currency(currency);if(year<1||year>9999)throw new IllegalArgumentException("Choose a year from 1 to 9999.");
        var snapshot=new Snapshot(owner);
        if(snapshot.cats.stream().noneMatch(c->c.id().equals(category)))throw new CategoryFailure(404,"Spending category not found.");
        var start=LocalDate.of(year,1,1);var ops=activities(owner,start,cutoff(Period.YEAR,start));var months=new ArrayList<Month>();
        for(int i=0;i<12;i++){var date=start.plusMonths(i);months.add(new Month(date,!date.isAfter(time.today()),snapshot.comparison(category,currency,snapshot.exact(category,currency,Period.MONTH,date),cutoff(Period.MONTH,date),ops)));}
        return new Breakdown(time.today(),snapshot.normal(category,currency),months);
    }
}
