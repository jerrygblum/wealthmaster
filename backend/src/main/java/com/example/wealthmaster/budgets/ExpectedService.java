package com.example.wealthmaster.budgets;

import com.example.wealthmaster.accounts.*;
import com.example.wealthmaster.config.BusinessTime;
import com.example.wealthmaster.ledger.LedgerService;
import com.example.wealthmaster.ledger.LedgerDtos;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static com.example.wealthmaster.budgets.ExpectedDtos.*;

@Service
public class ExpectedService implements AccountUsagePolicy.ActivitySource {
    private final JdbcTemplate jdbc;
    private final AccountRepository accounts;
    private final CategoryService categories;
    private final LedgerService ledger;
    private final BusinessTime time;
    private final ObjectMapper mapper;
    public ExpectedService(JdbcTemplate jdbc,AccountRepository accounts,CategoryService categories,
        LedgerService ledger,BusinessTime time,ObjectMapper mapper) {
        this.jdbc=jdbc;this.accounts=accounts;this.categories=categories;this.ledger=ledger;this.time=time;this.mapper=mapper;
    }
    public boolean hasActivity(UUID account) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM expected_account_history WHERE account_id=?)",Boolean.class,account));
    }
    private static final String SELECT="""
        SELECT e.*, (a.active AND COALESCE(b.active,TRUE) AND COALESCE(c.active,TRUE)
        AND COALESCE(p.active,TRUE)) AS available FROM expected_transactions e
        JOIN financial_accounts a ON a.id=e.account_id
        LEFT JOIN financial_accounts b ON b.id=e.destination_id
        LEFT JOIN categories c ON c.id=e.category_id LEFT JOIN categories p ON p.id=c.parent_id
        """;
    private Definition row(java.sql.ResultSet r,int n) throws java.sql.SQLException {
        return new Definition(r.getObject("id",UUID.class),r.getString("name"),Kind.valueOf(r.getString("kind")),
            r.getObject("account_id",UUID.class),r.getObject("destination_id",UUID.class),r.getObject("category_id",UUID.class),
            r.getBigDecimal("amount").toPlainString(),r.getString("currency"),r.getInt("day_of_month"),
            r.getObject("first_month",LocalDate.class),r.getObject("last_month",LocalDate.class),r.getString("payee"),
            r.getString("notes"),r.getLong("version"),r.getBoolean("available"));
    }
    private Definition owned(UUID owner,UUID id) {
        var found=jdbc.query(SELECT+" WHERE e.owner_id=? AND e.id=? AND NOT e.deleted",this::row,owner,id);
        if(found.isEmpty()) throw new CategoryFailure(404,"Expected item not found.");
        return found.getFirst();
    }
    private void lock(UUID owner) {
        jdbc.update("INSERT INTO expectation_owner_state(owner_id) VALUES(?) ON CONFLICT DO NOTHING",owner);
        jdbc.queryForObject("SELECT owner_id FROM expectation_owner_state WHERE owner_id=? FOR UPDATE",UUID.class,owner);
    }
    private void match(String header,long version) {
        if(header==null) throw new CategoryFailure(428,"Reload expected activity before making this change.");
        if(!header.matches("\"[0-9]+\"")) throw new IllegalArgumentException("If-Match must contain a quoted version.");
        if(!header.equals("\""+version+"\"")) throw new CategoryFailure(412,"Expected activity changed. Cancel and reload; your input is retained.");
    }
    private void definitionVersion(Definition d,Long version) {
        if(version==null || version!=d.version()) throw new CategoryFailure(412,"The recurring item changed. Reload before reconciling.");
    }
    @Transactional
    public Definition save(UUID owner,UUID id,String version,Input input) {
        lock(owner); var before=id==null?null:owned(owner,id); if(before!=null) match(version,before.version());
        ExpectedPolicy.month(input.firstMonth()); if(input.lastMonth()!=null) ExpectedPolicy.month(input.lastMonth());
        if(input.name()==null || input.name().isBlank() || input.name().length()>100 || input.kind()==null
            || input.dayOfMonth()<1 || input.dayOfMonth()>31 || input.lastMonth()!=null && input.lastMonth().isBefore(input.firstMonth()))
            throw new IllegalArgumentException("Check the recurring name, day and start/end months.");
        var amount=amount(input.amount());
        boolean transfer=input.kind()==Kind.TRANSFER;
        if(transfer && (input.destinationAccountId()==null || input.accountId().equals(input.destinationAccountId()))
            || !transfer && input.destinationAccountId()!=null || transfer && input.categoryId()!=null)
            throw new IllegalArgumentException("Transfers need distinct source/destination accounts and no category.");
        var ids=new TreeSet<UUID>(); ids.add(input.accountId()); if(input.destinationAccountId()!=null) ids.add(input.destinationAccountId());
        var locked=new HashMap<UUID,FinancialAccount>();
        for(var accountId:ids) locked.put(accountId,accounts.findByIdAndOwnerId(accountId,owner).orElseThrow(()->new AccountFailure(404,"Account not found.")));
        for(var a:locked.values()) if(!a.isActive() && (before==null || !a.getId().equals(before.accountId()) && !a.getId().equals(before.destinationAccountId())))
            throw new AccountFailure(409,"Restore accounts before assigning them.");
        var currency=locked.get(input.accountId()).getCurrency();
        if(transfer && !currency.equals(locked.get(input.destinationAccountId()).getCurrency())) throw new IllegalArgumentException("Transfers require matching currencies.");
        categories.lock(owner); categories.validateAssignment(owner,input.categoryId(),before==null?null:before.categoryId(),input.kind()==Kind.INCOME);
        if(id==null) {
            id=UUID.randomUUID();
            jdbc.update("INSERT INTO expected_transactions(id,owner_id,name,kind,account_id,destination_id,category_id,amount,currency,day_of_month,first_month,last_month,payee,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                id,owner,input.name().strip(),input.kind().name(),input.accountId(),input.destinationAccountId(),input.categoryId(),amount,currency,input.dayOfMonth(),input.firstMonth(),input.lastMonth(),input.payee(),input.notes());
        } else jdbc.update("UPDATE expected_transactions SET name=?,kind=?,account_id=?,destination_id=?,category_id=?,amount=?,currency=?,day_of_month=?,first_month=?,last_month=?,payee=?,notes=?,version=version+1 WHERE id=?",
            input.name().strip(),input.kind().name(),input.accountId(),input.destinationAccountId(),input.categoryId(),amount,currency,input.dayOfMonth(),input.firstMonth(),input.lastMonth(),input.payee(),input.notes(),id);
        for(var accountId:ids) jdbc.update("INSERT INTO expected_account_history VALUES(?,?) ON CONFLICT DO NOTHING",id,accountId);
        if(input.categoryId()!=null) jdbc.update("INSERT INTO expected_category_history SELECT ?,id FROM categories WHERE id=? OR id=(SELECT parent_id FROM categories WHERE id=?) ON CONFLICT DO NOTHING",id,input.categoryId(),input.categoryId());
        var after=owned(owner,id); audit(owner,id,before==null?"EXPECTED_CREATED":"EXPECTED_UPDATED",before,after); return after;
    }
    static BigDecimal amount(String value) {
        if(value==null || !value.matches("[0-9]{1,20}(\\.[0-9]{1,8})?")) throw new IllegalArgumentException("Enter a positive decimal with at most 20 integer digits and 8 decimal places.");
        var result=new BigDecimal(value); if(result.signum()<=0) throw new IllegalArgumentException("Amount must be positive."); return result;
    }
    @Transactional
    public void delete(UUID owner,UUID id,String version) {
        lock(owner);var before=owned(owner,id);match(version,before.version());
        var states=jdbc.queryForList("SELECT * FROM expected_occurrences WHERE expectation_id=?",id);
        jdbc.update("UPDATE expected_occurrences SET operation_id=NULL,skipped=FALSE,version=version+1 WHERE expectation_id=?",id);
        jdbc.update("UPDATE expected_transactions SET deleted=TRUE,version=version+1 WHERE id=?",id);
        audit(owner,id,"EXPECTED_DELETED",Map.of("definition",before,"occurrences",states),null);
    }
    private record State(UUID operation,boolean skipped,long version) {}
    private State state(UUID id,LocalDate month) {
        var states=jdbc.query("SELECT * FROM expected_occurrences WHERE expectation_id=? AND month=?",(r,n)->new State(r.getObject("operation_id",UUID.class),r.getBoolean("skipped"),r.getLong("version")),id,month);
        return states.isEmpty()?new State(null,false,0):states.getFirst();
    }
    private LedgerDtos.Operation operation(UUID owner,UUID id,boolean locking) {
        var rows=jdbc.query("SELECT * FROM ledger_operations WHERE owner_id=? AND id=? AND NOT deleted"+(locking?" FOR UPDATE":""),(r,n)->new LedgerDtos.Operation(
            r.getObject("id",UUID.class),LedgerDtos.Kind.valueOf(r.getString("kind")),r.getObject("account_id",UUID.class),r.getObject("destination_id",UUID.class),
            r.getBigDecimal("amount").toPlainString(),r.getString("currency"),r.getObject("transaction_date",LocalDate.class),r.getObject("value_date",LocalDate.class),
            r.getString("payee"),r.getString("description"),r.getString("notes"),r.getTimestamp("created_at").toInstant(),r.getLong("version"),r.getObject("category_id",UUID.class),categories.assignment(r.getObject("category_id",UUID.class))),owner,id);
        return rows.isEmpty()?null:rows.getFirst();
    }
    private Occurrence occurrence(UUID owner,Definition d,LocalDate month) {
        var state=state(d.id(),month);var op=state.operation()==null?null:operation(owner,state.operation(),false);
        boolean valid=ExpectedPolicy.applies(d,month) && ExpectedPolicy.compatible(d,op); var due=ExpectedPolicy.due(month,d.dayOfMonth());
        var status=ExpectedPolicy.status(state.skipped(),state.operation()!=null,valid,due,time.today());
        if(valid && op.transactionDate().isAfter(time.today())) status="SCHEDULED";
        return new Occurrence(d,due,state.version(),status,op,op==null || !op.currency().equals(d.currency())?null:new BigDecimal(op.amount()).subtract(new BigDecimal(d.amount())).toPlainString(),
            d.available() && state.operation()==null && !state.skipped());
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Report report(UUID owner,LocalDate requested) {
        var month=ExpectedPolicy.month(requested==null?time.today().withDayOfMonth(1):requested);
        var definitions=jdbc.query(SELECT+" WHERE e.owner_id=? AND NOT e.deleted ORDER BY lower(e.name),e.id",this::row,owner);
        var items=definitions.stream().filter(d->ExpectedPolicy.applies(d,month) || state(d.id(),month).operation()!=null)
            .map(d->occurrence(owner,d,month)).sorted(Comparator.comparing(Occurrence::expectedDate).thenComparing(o->o.definition().name()).thenComparing(o->o.definition().id())).toList();
        var totals=new TreeMap<String,BigDecimal[]>();
        for(var item:items) {
            var d=item.definition();var v=totals.computeIfAbsent(d.currency()+":"+d.kind(),k->new BigDecimal[]{BigDecimal.ZERO,BigDecimal.ZERO,BigDecimal.ZERO,BigDecimal.ZERO});
            if(item.status().equals("SKIPPED")) continue;
            var expected=new BigDecimal(d.amount());v[0]=v[0].add(expected);
            if(item.status().equals("COMPLETED")) {v[1]=v[1].add(expected);v[2]=v[2].add(new BigDecimal(item.actual().amount()));} else v[3]=v[3].add(expected);
        }
        return new Report(month,time.today(),definitions,items,totals.entrySet().stream().map(e->{var key=e.getKey().split(":");var v=e.getValue();return new Totals(key[0],Kind.valueOf(key[1]),v[0].toPlainString(),v[1].toPlainString(),v[2].toPlainString(),v[3].toPlainString());}).toList());
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public LedgerDtos.ActivityPage candidates(UUID owner,UUID id,LocalDate month,int page) {
        ExpectedPolicy.month(month); if(page<0 || page>1000000) throw new IllegalArgumentException("Invalid page.");
        var d=owned(owner,id);var due=ExpectedPolicy.due(month,d.dayOfMonth());
        var ids=jdbc.query("""
            SELECT o.id FROM ledger_operations o WHERE o.owner_id=? AND NOT o.deleted AND o.kind=? AND o.currency=?
            AND o.account_id=? AND o.destination_id IS NOT DISTINCT FROM ?::uuid
            AND date_trunc('month',o.transaction_date)::date=?
            AND NOT EXISTS(SELECT 1 FROM expected_occurrences s WHERE s.operation_id=o.id)
            ORDER BY (o.amount=?) DESC,(o.category_id IS NOT DISTINCT FROM ?::uuid) DESC,
            (COALESCE(lower(o.payee)=lower(?),FALSE)) DESC,abs(o.transaction_date-?::date),o.transaction_date DESC,o.created_at DESC,o.id
            LIMIT 51 OFFSET ?
            """,(r,n)->r.getObject("id",UUID.class),owner,d.kind().name(),d.currency(),d.accountId(),d.destinationAccountId(),month,new BigDecimal(d.amount()),d.categoryId(),d.payee(),due,page*50);
        return new LedgerDtos.ActivityPage(ids.stream().limit(50).map(op->operation(owner,op,false)).toList(),page,ids.size()>50);
    }
    private Definition change(UUID owner,UUID id,LocalDate month,String version,Long definitionVersion) {
        ExpectedPolicy.month(month);lock(owner);var d=owned(owner,id);definitionVersion(d,definitionVersion);
        var s=state(id,month);match(version,s.version());
        if(!ExpectedPolicy.applies(d,month) && s.operation()==null) throw new CategoryFailure(409,"This item does not recur in the selected month.");
        return d;
    }
    private void write(UUID owner,UUID id,LocalDate month,State before,UUID op,boolean skipped) {
        jdbc.update("INSERT INTO expected_occurrences(expectation_id,owner_id,month,operation_id,skipped) VALUES(?,?,?,?,?) ON CONFLICT(expectation_id,month) DO UPDATE SET operation_id=EXCLUDED.operation_id,skipped=EXCLUDED.skipped,version=expected_occurrences.version+1",id,owner,month,op,skipped);
        audit(owner,id,"EXPECTED_RECONCILED",Map.of("month",month,"state",before),Map.of("month",month,"state",state(id,month)));
    }
    @Transactional
    public Occurrence reconcile(UUID owner,UUID id,LocalDate month,String version,Reconcile input) {
        var d=change(owner,id,month,version,input.definitionVersion());var before=state(id,month);
        if(input.skipped() && input.operationId()!=null) throw new IllegalArgumentException("A skipped occurrence cannot have a transaction.");
        if(input.operationId()!=null) {
            var op=operation(owner,input.operationId(),true);
            if(op==null) throw new CategoryFailure(404,"Activity not found.");
            if(input.operationVersion()==null || input.operationVersion()!=op.version()) throw new CategoryFailure(412,"Activity changed. Reload suggestions.");
            if(!ExpectedPolicy.compatible(d,op)) throw new IllegalArgumentException("Choose activity with matching type, currency and accounts.");
            if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM expected_occurrences WHERE operation_id=? AND NOT(expectation_id=? AND month=?))",Boolean.class,op.id(),id,month)))
                throw new CategoryFailure(409,"This transaction already satisfies another expectation.");
        }
        write(owner,id,month,before,input.operationId(),input.skipped());return occurrence(owner,d,month);
    }
    @Transactional
    public Occurrence record(UUID owner,UUID id,LocalDate month,String version,RecordInput input) {
        var d=change(owner,id,month,version,input.definitionVersion());var before=state(id,month);
        if(!occurrence(owner,d,month).canRecord()) throw new CategoryFailure(409,"This occurrence cannot be recorded. Restore references or reload its status.");
        LedgerDtos.Operation op;
        if(d.kind()==Kind.TRANSFER) {
            if(input.categoryId()!=null) throw new IllegalArgumentException("Transfers cannot have a category.");
            op=ledger.transfer(owner,null,null,new LedgerDtos.TransferInput(d.accountId(),d.destinationAccountId(),input.amount(),input.transactionDate(),input.description(),input.notes()));
        } else op=ledger.transaction(owner,null,null,new LedgerDtos.TransactionInput(d.accountId(),LedgerDtos.Kind.valueOf(d.kind().name()),input.amount(),input.transactionDate(),input.valueDate(),input.payee(),input.description(),input.notes(),input.categoryId()));
        write(owner,id,month,before,op.id(),false);return occurrence(owner,d,month);
    }
    private record Change(Object before,Object after) {}
    private void audit(UUID owner,UUID id,String type,Object before,Object after) {
        jdbc.update("INSERT INTO audit_events(id,actor_id,event_type,resource_id,details) VALUES(?,?,?,?,CAST(? AS jsonb))",UUID.randomUUID(),owner,type,id,mapper.writeValueAsString(new Change(before,after)));
    }
}
