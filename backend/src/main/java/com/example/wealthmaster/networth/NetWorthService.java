package com.example.wealthmaster.networth;

import com.example.wealthmaster.accounts.*;
import com.example.wealthmaster.accounts.AccountDtos.AccountResponse;
import com.example.wealthmaster.config.BusinessTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.math.BigDecimal;
import java.util.*;
import static com.example.wealthmaster.networth.NetWorthDtos.*;

@Service
public class NetWorthService {
    private final AccountService accounts;
    private final BusinessTime time;
    public NetWorthService(AccountService accounts, BusinessTime time) { this.accounts = accounts; this.time = time; }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public CurrentNetWorth current(UUID owner) {
        // AccountService joins this transaction: all balances share the same database snapshot.
        var balances = accounts.list(owner).stream().sorted(Comparator.comparing(AccountResponse::currency)
                .thenComparing(AccountResponse::name, String.CASE_INSENSITIVE_ORDER).thenComparing(AccountResponse::id)).toList();
        var calculatedAt = time.now();
        var date = time.dateAt(calculatedAt);
        var included = new ArrayList<AccountContribution>();
        var future = new ArrayList<FutureAccount>();
        var groups = new TreeMap<String, List<AccountResponse>>();
        for (var account : balances) {
            if (account.openingDate().isAfter(date)) {
                future.add(new FutureAccount(account.id(), account.name(), account.type(), account.currency(), account.active(), account.openingDate()));
            } else {
                included.add(new AccountContribution(account.id(), account.name(), account.type(), account.currency(), account.active(), account.currentBalance()));
                groups.computeIfAbsent(account.currency(), ignored -> new ArrayList<>()).add(account);
            }
        }
        var currencies = new ArrayList<CurrencyTotal>();
        groups.forEach((currency, entries) -> {
            var totals = totals(entries);
            var types = new TreeMap<AccountType, List<AccountResponse>>();
            entries.forEach(a -> types.computeIfAbsent(a.type(), ignored -> new ArrayList<>()).add(a));
            var breakdown = new ArrayList<TypeTotal>();
            types.forEach((type, members) -> {
                var values = totals(members);
                breakdown.add(new TypeTotal(type, values.assets().toPlainString(), values.liabilities().toPlainString(), values.netWorth().toPlainString()));
            });
            currencies.add(new CurrencyTotal(currency, totals.assets().toPlainString(), totals.liabilities().toPlainString(), totals.netWorth().toPlainString(), List.copyOf(breakdown)));
        });
        return new CurrentNetWorth(date, calculatedAt, List.copyOf(currencies), List.copyOf(included), List.copyOf(future));
    }
    private record Totals(BigDecimal assets, BigDecimal liabilities) {
        BigDecimal netWorth() { return assets.subtract(liabilities); }
    }
    private Totals totals(List<AccountResponse> entries) {
        var assets = BigDecimal.ZERO;
        var liabilities = BigDecimal.ZERO;
        for (var entry : entries) {
            var amount = new BigDecimal(entry.currentBalance());
            if (amount.signum() < 0) liabilities = liabilities.add(amount.negate());
            else assets = assets.add(amount);
        }
        return new Totals(assets, liabilities);
    }
}
