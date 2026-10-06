package com.example.wealthmaster.budgets;

import com.example.wealthmaster.config.BusinessTime;
import com.example.wealthmaster.ledger.LedgerDtos;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.math.*;
import java.time.LocalDate;
import java.util.*;
import static com.example.wealthmaster.budgets.BudgetDtos.*;

@Service
public class BudgetService {
    private final JdbcTemplate jdbc;
    private final CategoryService categories;
    private final BusinessTime time;
    private final ObjectMapper mapper;
    private final EffectiveBudgetService effective;
    public BudgetService(JdbcTemplate jdbc, CategoryService categories, BusinessTime time, ObjectMapper mapper, EffectiveBudgetService effective) {
        this.jdbc=jdbc; this.categories=categories; this.time=time; this.mapper=mapper; this.effective=effective;
    }
    static BigDecimal amount(String value) {
        if(value==null || !value.matches("[0-9]{1,20}(\\.[0-9]{1,8})?")) throw new IllegalArgumentException("Enter a non-negative decimal with at most 20 integer digits and 8 decimal places.");
        return new BigDecimal(value);
    }
    static LocalDate end(Period type, LocalDate start) {
        if(type==null || start==null || start.getDayOfMonth()!=1 || type==Period.YEAR && start.getMonthValue()!=1)
            throw new IllegalArgumentException("Use the first day of a month, or January 1 for a year.");
        return type==Period.MONTH?start.plusMonths(1):start.plusYears(1);
    }
    static String percentage(BigDecimal limit, BigDecimal actual) {
        return limit.signum()==0?null:actual.multiply(new BigDecimal("100")).divide(limit,2,RoundingMode.HALF_UP).toPlainString();
    }
    private static final String SELECT="""
        SELECT b.*, c.name AS category_name,c.parent_id,p.name AS parent_name,
        (c.active AND COALESCE(p.active,TRUE)) AS available,
        COALESCE((SELECT SUM(CASE WHEN o.kind='REFUND' THEN -o.amount ELSE o.amount END)
          FROM ledger_operations o LEFT JOIN categories oc ON oc.id=o.category_id
          WHERE o.owner_id=b.owner_id AND NOT o.deleted AND o.kind IN ('EXPENSE','REFUND')
          AND o.currency=b.currency AND o.transaction_date>=b.period_start
          AND o.transaction_date < b.period_start + CASE WHEN b.period_type='MONTH' THEN INTERVAL '1 month' ELSE INTERVAL '1 year' END
          AND (o.category_id=b.category_id OR oc.parent_id=b.category_id)),0) AS actual
        FROM spending_budgets b JOIN categories c ON c.id=b.category_id LEFT JOIN categories p ON p.id=c.parent_id
        """;
    private Budget row(java.sql.ResultSet r,int n) throws java.sql.SQLException {
        var limit=r.getBigDecimal("amount"); var actual=r.getBigDecimal("actual");
        return new Budget(r.getObject("id",UUID.class),r.getObject("category_id",UUID.class),r.getString("category_name"),r.getObject("parent_id",UUID.class),r.getString("parent_name"),r.getString("currency"),Period.valueOf(r.getString("period_type")),r.getObject("period_start",LocalDate.class),limit.toPlainString(),actual.toPlainString(),limit.subtract(actual).toPlainString(),percentage(limit,actual),actual.compareTo(limit)>0,r.getBoolean("available"),r.getLong("version"));
    }
    private Budget owned(UUID owner,UUID id) {
        var rows=jdbc.query(SELECT+" WHERE b.owner_id=? AND b.id=? AND NOT b.deleted",this::row,owner,id);
        if(rows.isEmpty()) throw new CategoryFailure(404,"Budget not found."); return rows.getFirst();
    }
    private void match(Budget b,String value) {
        if(value==null) throw new CategoryFailure(428,"Reload budgets before making this change.");
        if(!value.matches("\"[0-9]+\"")) throw new CategoryFailure(400,"If-Match must contain a quoted budget version.");
        if(!value.equals("\""+b.version()+"\"")) throw new CategoryFailure(412,"This budget changed. Reload and try again.");
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Report report(UUID owner,Period type,LocalDate start) {
        if(type==null) type=Period.MONTH;
        if(start==null) start=type==Period.MONTH?time.today().withDayOfMonth(1):time.today().withDayOfYear(1);
        var until=end(type,start);
        var budgets=jdbc.query(SELECT+" WHERE b.owner_id=? AND b.period_type=? AND b.period_start=? AND NOT b.deleted ORDER BY b.currency,COALESCE(p.name,c.name),c.parent_id NULLS FIRST,c.name,b.id",this::row,owner,type.name(),start);
        var resolved=effective.report(owner,type,start);
        return new Report(type,start,budgets,resolved.currencies(),resolved.comparisons(),resolved.businessDate());
    }

    private boolean duplicate(UUID owner,Input i) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM spending_budgets WHERE owner_id=? AND category_id=? AND currency=? AND period_type=? AND period_start=? AND NOT deleted)",Boolean.class,owner,i.categoryId(),i.currency(),i.periodType().name(),i.periodStart()));
    }
    private Budget insert(UUID owner,Input i) {
        end(i.periodType(),i.periodStart()); var limit=amount(i.limit());
        try { if(i.currency()==null || !i.currency().matches("[A-Z]{3}")) throw new IllegalArgumentException(); Currency.getInstance(i.currency()); }
        catch(IllegalArgumentException e) { throw new IllegalArgumentException("Choose an ISO 4217 currency."); }
        categories.validateAssignment(owner,i.categoryId(),null,false);
        if(i.categoryId()==null) throw new IllegalArgumentException("Choose a spending category.");
        if(duplicate(owner,i)) throw new CategoryFailure(409,"A budget already exists for this category, currency and period.");
        var id=UUID.randomUUID();
        jdbc.update("INSERT INTO spending_budgets(id,owner_id,category_id,currency,period_type,period_start,amount) VALUES(?,?,?,?,?,?,?)",id,owner,i.categoryId(),i.currency(),i.periodType().name(),i.periodStart(),limit);
        jdbc.update("INSERT INTO budget_category_history(budget_id,category_id) SELECT ?,id FROM categories WHERE id=? OR id=(SELECT parent_id FROM categories WHERE id=?)",id,i.categoryId(),i.categoryId());
        var after=owned(owner,id); audit(owner,id,"BUDGET_CREATED",null,after); return after;
    }
    @Transactional public Budget create(UUID owner,Input input) { categories.lock(owner); return insert(owner,input); }
    @Transactional public Budget update(UUID owner,UUID id,String version,Limit input) {
        categories.lock(owner); var before=owned(owner,id); match(before,version);
        jdbc.update("UPDATE spending_budgets SET amount=?,version=version+1 WHERE id=?",amount(input.limit()),id);
        var after=owned(owner,id); audit(owner,id,"BUDGET_UPDATED",before,after); return after;
    }
    @Transactional public void delete(UUID owner,UUID id,String version) {
        categories.lock(owner); var before=owned(owner,id); match(before,version);
        jdbc.update("UPDATE spending_budgets SET deleted=TRUE,version=version+1 WHERE id=?",id); audit(owner,id,"BUDGET_DELETED",before,null);
    }
    @Transactional public CopyResult copy(UUID owner,Copy input) {
        categories.lock(owner);
        if(input.sources()==null || input.sources().isEmpty()) throw new IllegalArgumentException("Select source budgets.");
        var sources=new ArrayList<Budget>(); var ids=new HashSet<UUID>();
        for(var source:input.sources()) { var b=owned(owner,source.id()); match(b,"\""+source.version()+"\""); if(ids.add(b.id())) sources.add(b); }
        var first=sources.getFirst(); end(first.periodType(),input.targetPeriodStart());
        if(first.periodStart().equals(input.targetPeriodStart()) || sources.stream().anyMatch(b->b.periodType()!=first.periodType() || !b.periodStart().equals(first.periodStart()))) throw new IllegalArgumentException("Copy from one period into a different period of the same type.");
        var created=new ArrayList<Budget>(); var skipped=new ArrayList<Skip>();
        for(var b:sources) {
            var i=new Input(b.categoryId(),b.currency(),b.periodType(),input.targetPeriodStart(),b.limit());
            if(!b.available()) skipped.add(new Skip(b.id(),"CATEGORY_UNAVAILABLE"));
            else if(duplicate(owner,i)) skipped.add(new Skip(b.id(),"TARGET_EXISTS"));
            else created.add(insert(owner,i));
        }
        return new CopyResult(created,skipped);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public LedgerDtos.ActivityPage activity(UUID owner,UUID id,int page) {
        if(page<0 || page>1000000) throw new IllegalArgumentException("Invalid page.");
        var b=owned(owner,id);
        var items=jdbc.query("""
          SELECT o.* FROM ledger_operations o LEFT JOIN categories c ON c.id=o.category_id
          WHERE o.owner_id=? AND NOT o.deleted AND o.kind IN ('EXPENSE','REFUND') AND o.currency=?
          AND o.transaction_date>=? AND o.transaction_date<? AND (o.category_id=? OR c.parent_id=?)
          ORDER BY o.transaction_date DESC,o.created_at DESC,o.id LIMIT 51 OFFSET ?
          """,(r,n)->new LedgerDtos.Operation(r.getObject("id",UUID.class),LedgerDtos.Kind.valueOf(r.getString("kind")),r.getObject("account_id",UUID.class),null,r.getBigDecimal("amount").toPlainString(),r.getString("currency"),r.getObject("transaction_date",LocalDate.class),r.getObject("value_date",LocalDate.class),r.getString("payee"),r.getString("description"),r.getString("notes"),r.getTimestamp("created_at").toInstant(),r.getLong("version"),r.getObject("category_id",UUID.class),categories.assignment(r.getObject("category_id",UUID.class))),owner,b.currency(),b.periodStart(),end(b.periodType(),b.periodStart()),b.categoryId(),b.categoryId(),page*50);
        return new LedgerDtos.ActivityPage(items.stream().limit(50).toList(),page,items.size()>50);
    }
    private record Change(Budget before,Budget after) {}
    private void audit(UUID owner,UUID id,String event,Budget before,Budget after) {
        jdbc.update("INSERT INTO audit_events(id,actor_id,event_type,resource_id,details) VALUES(?,?,?,?,CAST(? AS jsonb))",UUID.randomUUID(),owner,event,id,mapper.writeValueAsString(new Change(before,after)));
    }
}
