package com.example.wealthmaster.budgets;

import com.example.wealthmaster.ledger.LedgerDtos;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import static com.example.wealthmaster.budgets.ExpectedDtos.*;

/** Read-only forecasts. Expectations never create cash or reconciliation state here. */
@Service
public class ExpectedProjectionService {
    private final ExpectedService expected;
    private final JdbcTemplate db;
    public ExpectedProjectionService(ExpectedService expected,JdbcTemplate db) {this.expected=expected;this.db=db;}
    public record Contribution(UUID expectationId,LocalDate month,LocalDate date,String name,BigDecimal amount,String kind) {}
    public record Review(UUID expectationId,String name,LocalDate month,String reason) {}
    public record Projection(BigDecimal adjustment,List<Contribution> entries,List<Review> reviews,long overdueCount) {}
    private record Key(UUID id,LocalDate month) {}
    private record Link(UUID operationId,boolean skipped,LedgerDtos.Operation actual) {}
    public Projection project(UUID owner,UUID account,LocalDate today,LocalDate end) {
        if(end.isBefore(today))return new Projection(BigDecimal.ZERO,List.of(),List.of(),0);
        var definitions=expected.projectionDefinitions(owner,account);
        var links=new HashMap<Key,Link>();
        db.query("""
            SELECT s.expectation_id,s.month,s.skipped,s.operation_id,o.id actual_id,o.kind,o.account_id,o.destination_id,o.currency,o.amount
            FROM expected_occurrences s JOIN expected_transactions e ON e.id=s.expectation_id AND e.owner_id=s.owner_id
            LEFT JOIN ledger_operations o ON o.id=s.operation_id AND o.owner_id=s.owner_id AND NOT o.deleted
            WHERE s.owner_id=? AND NOT e.deleted AND (e.account_id=? OR e.destination_id=?) AND s.month<=?
            """,(org.springframework.jdbc.core.RowCallbackHandler)r->{
                var operation=r.getObject("actual_id",UUID.class);
                var actual=operation==null?null:new LedgerDtos.Operation(operation,LedgerDtos.Kind.valueOf(r.getString("kind")),r.getObject("account_id",UUID.class),r.getObject("destination_id",UUID.class),r.getBigDecimal("amount").toPlainString(),r.getString("currency"),null,null,null,null,null,null,0,null,null,null);
                links.put(new Key(r.getObject("expectation_id",UUID.class),r.getObject("month",LocalDate.class)),new Link(r.getObject("operation_id",UUID.class),r.getBoolean("skipped"),actual));
            },owner,account,account,end.withDayOfMonth(1));
        var candidates=new HashSet<Key>();
        var firstMonth=today.withDayOfMonth(1);var lastMonth=end.withDayOfMonth(1);
        for(var d:definitions) {
            var first=d.firstMonth().isAfter(firstMonth)?d.firstMonth():firstMonth;
            var last=d.lastMonth()!=null && d.lastMonth().isBefore(lastMonth)?d.lastMonth():lastMonth;
            if(first.isAfter(last))continue;
            if(ExpectedPolicy.due(first,d.dayOfMonth()).isBefore(today))first=first.plusMonths(1);
            if(ExpectedPolicy.due(last,d.dayOfMonth()).isAfter(end))last=last.minusMonths(1);
            if(first.isAfter(last))continue;
            long count=ChronoUnit.MONTHS.between(first,last)+1;
            if(count>2000)throw limit();
            for(var month=first;;month=month.plusMonths(1)) {
                var due=ExpectedPolicy.due(month,d.dayOfMonth());
                if(!due.isBefore(today) && !due.isAfter(end))candidates.add(new Key(d.id(),month));
                if(candidates.size()>2000)throw limit();
                if(month.equals(last))break;
            }
        }
        // Retained links outside an edited schedule still need review in the requested window.
        var byId=new HashMap<UUID,Definition>();definitions.forEach(d->byId.put(d.id(),d));
        for(var entry:links.entrySet()) {
            var d=byId.get(entry.getKey().id());var due=ExpectedPolicy.due(entry.getKey().month(),d.dayOfMonth());
            if(entry.getValue().operationId()!=null && !due.isBefore(today) && !due.isAfter(end))candidates.add(entry.getKey());
            if(candidates.size()>2000)throw limit();
        }
        var contributions=new ArrayList<Contribution>();var reviews=new ArrayList<Review>();var adjustment=BigDecimal.ZERO;
        for(var key:candidates) {
            var d=byId.get(key.id());var link=links.get(key);
            if(link!=null && link.skipped())continue;
            if(link!=null && link.operationId()!=null) {
                if(!ExpectedPolicy.applies(d,key.month()) || !ExpectedPolicy.compatible(d,link.actual()))
                    reviews.add(new Review(d.id(),d.name(),key.month(),"The confirmed transaction or recurrence needs review."));
                // Any valid confirmed match is represented exclusively by its actual ledger date/amount.
                continue;
            }
            if(!ExpectedPolicy.applies(d,key.month()))continue;
            if(!d.available()) {reviews.add(new Review(d.id(),d.name(),key.month(),"An account or category is unavailable."));continue;}
            var amount=new BigDecimal(d.amount());
            if(d.kind()==Kind.EXPENSE || d.kind()==Kind.TRANSFER && d.accountId().equals(account))amount=amount.negate();
            adjustment=adjustment.add(amount);
            contributions.add(new Contribution(d.id(),key.month(),ExpectedPolicy.due(key.month(),d.dayOfMonth()),d.name(),amount,d.kind().name()));
        }
        // Count historical unrecorded occurrences arithmetically, rather than expanding years of reminders.
        long overdue=0;
        for(var d:definitions) {
            var last=today.withDayOfMonth(1);
            if(!ExpectedPolicy.due(last,d.dayOfMonth()).isBefore(today))last=last.minusMonths(1);
            if(d.lastMonth()!=null && d.lastMonth().isBefore(last))last=d.lastMonth();
            if(last.isBefore(d.firstMonth()))continue;
            overdue+=ChronoUnit.MONTHS.between(d.firstMonth(),last)+1;
            for(var entry:links.entrySet()) {
                var key=entry.getKey();var link=entry.getValue();
                if(key.id().equals(d.id()) && !key.month().isBefore(d.firstMonth()) && !key.month().isAfter(last)
                    && (link.skipped() || link.operationId()!=null))overdue--;
            }
        }
        contributions.sort(Comparator.comparing(Contribution::date).thenComparing(e->e.expectationId().toString()));
        reviews.sort(Comparator.comparing(Review::month).thenComparing(e->e.expectationId().toString()));
        return new Projection(adjustment,List.copyOf(contributions),List.copyOf(reviews),overdue);
    }
    private IllegalArgumentException limit() {return new IllegalArgumentException("Expected projection exceeds 2,000 candidate occurrences. Shorten the range or switch expected transactions off.");}
}
