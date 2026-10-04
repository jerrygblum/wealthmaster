package com.example.wealthmaster.ledger;

import com.example.wealthmaster.accounts.*;
import com.example.wealthmaster.config.BusinessTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static com.example.wealthmaster.ledger.LedgerDtos.*;

@Service
public class LedgerService implements AccountUsagePolicy.ActivitySource {
    private final JdbcTemplate jdbc;
    private final AccountRepository accounts;
    private final ObjectMapper mapper;
    private final BusinessTime time;
    public LedgerService(JdbcTemplate jdbc, AccountRepository accounts, ObjectMapper mapper,
            BusinessTime time) {
        this.jdbc=jdbc; this.accounts=accounts; this.mapper=mapper; this.time=time;
    }
    public LocalDate today() { return time.today(); }
    public boolean hasActivity(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM ledger_account_history WHERE account_id=?)", Boolean.class,id));
    }
    public BigDecimal movements(UUID id) {
        return jdbc.queryForObject("SELECT COALESCE(SUM(m.amount),0) FROM ledger_movements m JOIN ledger_operations o ON o.id=m.operation_id WHERE m.account_id=? AND NOT o.deleted", BigDecimal.class,id);
    }
    private Operation row(java.sql.ResultSet r, int n) throws java.sql.SQLException {
        return new Operation(r.getObject("id",UUID.class),Kind.valueOf(r.getString("kind")),r.getObject("account_id",UUID.class),
            r.getObject("destination_id",UUID.class),r.getBigDecimal("amount").toPlainString(),r.getString("currency"),
            r.getObject("transaction_date",LocalDate.class),r.getObject("value_date",LocalDate.class),r.getString("payee"),
            r.getString("description"),r.getString("notes"),r.getTimestamp("created_at").toInstant(),r.getLong("version"));
    }
    @Transactional(readOnly=true)
    public ActivityPage list(UUID owner, UUID account, int page) {
        if(page<0 || page>1000000) throw new IllegalArgumentException("Invalid page.");
        if(account!=null && !jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM financial_accounts WHERE id=? AND owner_id=?)",Boolean.class,account,owner))
            throw new AccountFailure(404,"Account not found.");
        var items=jdbc.query("SELECT * FROM ledger_operations WHERE owner_id=? AND NOT deleted AND (?::uuid IS NULL OR account_id=? OR destination_id=?) ORDER BY transaction_date DESC, created_at DESC, id LIMIT 51 OFFSET ?",this::row,owner,account,account,account,page*50);
        return new ActivityPage(items.stream().limit(50).toList(),page,items.size()>50);
    }
    private Operation owned(UUID owner, UUID id, String match, boolean transfer) {
        var results=jdbc.query("SELECT * FROM ledger_operations WHERE id=? AND owner_id=? AND NOT deleted FOR UPDATE",this::row,id,owner);
        if(results.isEmpty() || (results.getFirst().kind()==Kind.TRANSFER)!=transfer) throw new AccountFailure(404,"Activity not found.");
        var op=results.getFirst();
        if(match==null) throw new AccountFailure(428,"Reload activity before making this change.");
        if(!match.matches("\"[0-9]+\"")) throw new AccountFailure(400,"If-Match must contain a quoted operation version.");
        if(!match.equals("\""+op.version()+"\"")) throw new AccountFailure(412,"This activity changed. Reload and try again.");
        return op;
    }
    private Map<UUID,FinancialAccount> lock(UUID owner, Operation before, UUID source, UUID destination) {
        var ids=new TreeSet<UUID>(); ids.add(source); if(destination!=null) ids.add(destination);
        if(before!=null) { ids.add(before.accountId()); if(before.destinationAccountId()!=null) ids.add(before.destinationAccountId()); }
        var result=new HashMap<UUID,FinancialAccount>();
        for(var id:ids) result.put(id,accounts.findByIdAndOwnerId(id,owner).orElseThrow(()->new AccountFailure(404,"Account not found.")));
        for(var account:result.values()) if(!account.isActive()) throw new AccountFailure(409,"Restore all affected accounts before changing activity.");
        return result;
    }
    static BigDecimal amount(String value) {
        if(value==null || !value.matches("[0-9]{1,20}(\\.[0-9]{1,8})?")) throw new IllegalArgumentException("Enter a positive decimal with at most 20 integer digits and 8 decimal places.");
        var amount=new BigDecimal(value); if(amount.signum()<=0) throw new IllegalArgumentException("Amount must be positive."); return amount;
    }
    private void date(LocalDate date, Collection<FinancialAccount> accounts) {
        if(date==null || date.isAfter(today()) || accounts.stream().anyMatch(a->date.isBefore(a.getOpeningDate())))
            throw new IllegalArgumentException("Dates must be between account opening and today.");
    }
    @Transactional
    public Operation transaction(UUID owner, UUID id, String match, TransactionInput input) {
        if(input.kind()==Kind.TRANSFER) throw new IllegalArgumentException("Use the transfer endpoint.");
        return save(owner,id,match,input.kind(),input.accountId(),null,input.amount(),input.transactionDate(),input.valueDate(),input.payee(),input.description(),input.notes());
    }
    @Transactional
    public Operation transfer(UUID owner, UUID id, String match, TransferInput input) {
        if(input.sourceAccountId().equals(input.destinationAccountId())) throw new IllegalArgumentException("Choose distinct accounts.");
        return save(owner,id,match,Kind.TRANSFER,input.sourceAccountId(),input.destinationAccountId(),input.amount(),input.transactionDate(),null,null,input.description(),input.notes());
    }
    private Operation save(UUID owner,UUID id,String match,Kind kind,UUID source,UUID destination,String value,LocalDate date,LocalDate valueDate,String payee,String description,String notes) {
        var before=id==null?null:owned(owner,id,match,kind==Kind.TRANSFER);
        var locked=lock(owner,before,source,destination); var currency=locked.get(source).getCurrency();
        if(destination!=null && !currency.equals(locked.get(destination).getCurrency())) throw new IllegalArgumentException("Transfers require matching currencies.");
        var affected=destination==null?List.of(locked.get(source)):List.of(locked.get(source),locked.get(destination));
        date(date,affected); if(valueDate!=null) date(valueDate,affected); var amount=amount(value);
        if(id==null) {
            id=UUID.randomUUID();
            jdbc.update("INSERT INTO ledger_operations(id,owner_id,kind,account_id,destination_id,amount,currency,transaction_date,value_date,payee,description,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",id,owner,kind.name(),source,destination,amount,currency,date,valueDate,payee,description.strip(),notes);
        } else {
            jdbc.update("UPDATE ledger_operations SET kind=?,account_id=?,destination_id=?,amount=?,currency=?,transaction_date=?,value_date=?,payee=?,description=?,notes=?,version=version+1 WHERE id=?",kind.name(),source,destination,amount,currency,date,valueDate,payee,description.strip(),notes,id);
            jdbc.update("DELETE FROM ledger_movements WHERE operation_id=?",id);
        }
        movement(id,source,kind==Kind.EXPENSE || kind==Kind.TRANSFER?amount.negate():amount,currency);
        if(destination!=null) movement(id,destination,amount,currency);
        var after=jdbc.queryForObject("SELECT * FROM ledger_operations WHERE id=?",this::row,id);
        audit(owner,id,before==null?"LEDGER_CREATED":"LEDGER_UPDATED",before,after); return after;
    }
    private void movement(UUID id,UUID account,BigDecimal amount,String currency) {
        jdbc.update("INSERT INTO ledger_movements(id,operation_id,account_id,amount,currency) VALUES(?,?,?,?,?)",UUID.randomUUID(),id,account,amount,currency);
        jdbc.update("INSERT INTO ledger_account_history(operation_id,account_id) VALUES(?,?) ON CONFLICT DO NOTHING",id,account);
    }
    @Transactional
    public void delete(UUID owner,UUID id,String match,boolean transfer) {
        var before=owned(owner,id,match,transfer); lock(owner,before,before.accountId(),before.destinationAccountId());
        jdbc.update("UPDATE ledger_operations SET deleted=TRUE,version=version+1 WHERE id=?",id);
        audit(owner,id,"LEDGER_DELETED",before,null);
    }
    private record Change(Operation before,Operation after) {}
    private void audit(UUID owner,UUID id,String event,Operation before,Operation after) {
        jdbc.update("INSERT INTO audit_events(id,actor_id,event_type,resource_id,details) VALUES(?,?,?,?,CAST(? AS jsonb))",UUID.randomUUID(),owner,event,id,mapper.writeValueAsString(new Change(before,after)));
    }
}
