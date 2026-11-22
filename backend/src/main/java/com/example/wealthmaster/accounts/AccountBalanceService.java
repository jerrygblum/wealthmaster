package com.example.wealthmaster.accounts;

import com.example.wealthmaster.budgets.ExpectedProjectionService;
import com.example.wealthmaster.config.BusinessTime;
import com.example.wealthmaster.ledger.LedgerService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static com.example.wealthmaster.accounts.AccountBalanceDtos.*;

@Service
public class AccountBalanceService {
    private final AccountRepository accounts;
    private final LedgerService ledger;
    private final ExpectedProjectionService expected;
    private final BusinessTime time;
    public AccountBalanceService(AccountRepository accounts,LedgerService ledger,ExpectedProjectionService expected,BusinessTime time) {
        this.accounts=accounts;this.ledger=ledger;this.expected=expected;this.time=time;
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Balance balance(UUID owner,UUID id,LocalDate date,boolean includeExpected,int page) {
        if(date==null || date.getYear()<1 || date.getYear()>9999)throw new IllegalArgumentException("Choose a valid date in years 1–9999.");
        if(page<0 || page>1_000_000)throw new IllegalArgumentException("Invalid breakdown page.");
        var account=accounts.findById(id).filter(a->a.getOwnerId().equals(owner)).orElseThrow(()->new AccountFailure(404,"Account not found."));
        var now=time.now();var today=time.dateAt(now);
        var totals=ledger.cashTotals(owner,id,date,today);
        var current=account.getOpeningBalance().add(totals.throughToday());
        boolean available=!date.isBefore(account.getOpeningDate());
        var recorded=available?account.getOpeningBalance().add(totals.throughDate()):null;
        var entries=new ArrayList<Entry>();Forecast forecast=null;
        if(available && includeExpected && !date.isBefore(today)) {
            var projection=expected.project(owner,id,today,date);
            forecast=new Forecast(number(projection.adjustment()),number(recorded.add(projection.adjustment())),projection.reviews().isEmpty(),projection.overdueCount(),
                projection.reviews().stream().map(r->new Review(r.expectationId(),r.name(),r.month(),r.reason())).toList());
            projection.entries().forEach(e->entries.add(new Entry(e.expectationId()+":"+e.month(),e.date(),e.name(),number(e.amount()),"EXPECTED",e.kind(),null,e.expectationId())));
        }
        int offset=page*50;
        // At most all expected entries can precede a recorded row. Fetch only the bounded recorded slice needed for the merged page.
        int skippedRecords=Math.max(0,offset-entries.size());
        if(available && date.isAfter(today)) {
            ledger.futureCashChanges(owner,id,today,date,skippedRecords,51+entries.size()).forEach(e->entries.add(
                new Entry(e.id().toString(),e.date(),e.description(),number(e.amount()),"RECORDED",e.kind(),e.id(),null)));
        }
        entries.sort(Comparator.comparing(Entry::date).thenComparing(Entry::source).thenComparing(Entry::id));
        int from=Math.min(offset-skippedRecords,entries.size());int to=Math.min(from+50,entries.size());
        return new Balance(id,account.getName(),account.getType(),account.getCurrency(),account.isActive(),account.getOpeningDate(),date,today,now,available,
            number(account.getOpeningBalance()),number(current),number(recorded),recorded==null?null:number(recorded.subtract(current)),forecast,
            List.copyOf(entries.subList(from,to)),page,entries.size()>to);
    }
    private static String number(BigDecimal value) {return value==null?null:value.stripTrailingZeros().toPlainString();}
}
