package com.example.wealthmaster.networth;

import com.example.wealthmaster.accounts.*;
import com.example.wealthmaster.config.BusinessTime;
import com.example.wealthmaster.marketdata.HistoricalPrices;
import com.example.wealthmaster.marketdata.HistoricalPrices.Security;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.math.*;
import java.time.*;
import java.util.*;
import static com.example.wealthmaster.networth.TrendDtos.*;

@Service
public class NetWorthTrendService {
    private final NamedParameterJdbcTemplate db;
    private final BusinessTime time;
    private final HistoricalPrices prices;
    public NetWorthTrendService(NamedParameterJdbcTemplate db, BusinessTime time, HistoricalPrices prices) {
        this.db = db; this.time = time; this.prices = prices;
    }
    private record Setup(Account account, BigDecimal opening) {}
    private record Movement(LocalDate date, BigDecimal amount) {}
    private record Activity(LocalDate date, UUID security, BigDecimal quantity) {}
    private List<Setup> setups(UUID owner) {
        return db.query("SELECT * FROM financial_accounts WHERE owner_id=:owner ORDER BY display_order,lower(name),id",
            Map.of("owner", owner), (r,n) -> new Setup(new Account(r.getObject("id",UUID.class), r.getString("name"),
                AccountType.valueOf(r.getString("type")), r.getString("currency"), r.getObject("opening_date",LocalDate.class),
                r.getBoolean("active")), r.getBigDecimal("opening_balance")));
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Options options(UUID owner) { return new Options(time.today(), setups(owner).stream().map(Setup::account).toList()); }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Trend trend(UUID owner, List<UUID> ids, LocalDate start, LocalDate end, Bucket bucket) {
        if (ids == null || ids.isEmpty()) throw new IllegalArgumentException("Select at least one account.");
        var selected = new HashSet<>(ids);
        var setup = setups(owner).stream().filter(a -> selected.contains(a.account().id())).toList();
        if (setup.size() != selected.size()) throw new AccountFailure(404,"One or more selected accounts are unavailable.");
        var now = time.now(); var today = time.dateAt(now);
        var periods = TrendPeriods.between(start,end,bucket,today,setup.size());
        var parameters = Map.<String,Object>of("owner",owner,"ids",selected,"end",end);
        var movements = new HashMap<UUID,List<Movement>>();
        db.query("""
            SELECT m.account_id,o.transaction_date,m.amount FROM ledger_movements m
            JOIN ledger_operations o ON o.id=m.operation_id
            WHERE o.owner_id=:owner AND m.account_id IN (:ids) AND NOT o.deleted AND o.transaction_date<=:end
            ORDER BY o.transaction_date,o.id,m.id
            """,parameters,(org.springframework.jdbc.core.RowCallbackHandler) r -> movements.computeIfAbsent(r.getObject("account_id",UUID.class),ignored->new ArrayList<>())
                .add(new Movement(r.getObject("transaction_date",LocalDate.class),r.getBigDecimal("amount"))));
        var activities = new HashMap<UUID,List<Activity>>();
        var securities = new HashMap<UUID,Security>();
        db.query("""
            SELECT i.account_id,i.security_id,i.trade_date,i.kind,i.quantity,s.name,s.currency,s.type,s.market_symbol
            FROM investment_activities i JOIN investment_securities s ON s.id=i.security_id AND s.owner_id=i.owner_id
            WHERE i.owner_id=:owner AND i.account_id IN (:ids) AND NOT i.reversed AND i.trade_date<=:end
            ORDER BY i.trade_date,i.id
            """,parameters,(org.springframework.jdbc.core.RowCallbackHandler) r -> {
                var id = r.getObject("security_id",UUID.class);
                securities.put(id,new Security(id,r.getString("name"),r.getString("currency"),r.getString("type"),r.getString("market_symbol")));
                activities.computeIfAbsent(r.getObject("account_id",UUID.class),ignored->new ArrayList<>()).add(new Activity(
                    r.getObject("trade_date",LocalDate.class),id,r.getBigDecimal("quantity").multiply(r.getString("kind").equals("SELL")?BigDecimal.ONE.negate():BigDecimal.ONE)));
            });
        var history = prices.load(owner,securities);
        var states = setup.stream().map(s -> new State(s,movements.getOrDefault(s.account().id(),List.of()),activities.getOrDefault(s.account().id(),List.of()))).toList();
        var points = new ArrayList<Point>();
        for (var period : periods) {
            var day = period.endDate();
            var cutoff = day.equals(today) ? now : time.startOfDay(day.plusDays(1)).minusNanos(1);
            var values = new ArrayList<Value>();
            var totals = new TreeMap<String,Aggregate>();
            for (var state : states) {
                state.advance(day);
                var account = state.setup.account();
                var aggregate = totals.computeIfAbsent(account.currency(),ignored->new Aggregate());
                if (day.isBefore(account.openingDate())) {
                    values.add(new Value(account.id(),false,null,null,0,false,List.of())); continue;
                }
                var known = state.cash; int missing = 0; boolean stale = false;
                var sources = new ArrayList<PriceSource>();
                for (var entry : state.quantities.entrySet()) {
                    if (entry.getValue().signum() <= 0) continue;
                    var security = securities.get(entry.getKey());
                    var price = history.security(security,day,cutoff);
                    var fx = account.currency().equals(security.currency()) ? null : history.fx(security.currency(),account.currency(),cutoff);
                    boolean needsFx = !account.currency().equals(security.currency());
                    sources.add(source(security,security.currency(),price,day,cutoff));
                    if (needsFx) sources.add(source(security,account.currency(),fx,day,cutoff));
                    boolean old = price != null && price.stale(day,cutoff) || fx != null && fx.stale(day,cutoff);
                    stale |= old;
                    if (price == null || needsFx && fx == null) { missing++; continue; }
                    known = known.add(entry.getValue().multiply(price.amount()).multiply(needsFx?fx.amount():BigDecimal.ONE).setScale(8,RoundingMode.HALF_UP));
                }
                values.add(new Value(account.id(),true,missing==0?number(known):null,number(known),missing,stale,List.copyOf(sources)));
                aggregate.opened = true; aggregate.known = aggregate.known.add(known); aggregate.missing += missing; aggregate.stale |= stale;
            }
            var currencyValues = totals.entrySet().stream().map(e -> {
                var a = e.getValue(); return new Total(e.getKey(),a.opened && a.missing==0?number(a.known):null,
                    a.opened?number(a.known):null,a.missing,a.stale);
            }).toList();
            points.add(new Point(period,List.copyOf(values),currencyValues));
        }
        return new Trend(start,end,bucket,today,now,setup.stream().map(Setup::account).toList(),List.copyOf(points));
    }
    private PriceSource source(Security security, String currency, HistoricalPrices.Price price, LocalDate day, Instant cutoff) {
        return price == null ? new PriceSource(security.id(),security.name(),currency,null,null,null,null,false,true)
            : new PriceSource(security.id(),security.name(),currency,price.date(),price.quotedAt(),price.fetchedAt(),price.source(),price.stale(day,cutoff),false);
    }
    private static String number(BigDecimal amount) { return amount.stripTrailingZeros().toPlainString(); }
    private static final class Aggregate { BigDecimal known=BigDecimal.ZERO; int missing; boolean stale,opened; }
    private static final class State {
        final Setup setup; final List<Movement> movements; final List<Activity> activities;
        BigDecimal cash; int movementIndex,activityIndex;
        final Map<UUID,BigDecimal> quantities = new TreeMap<>();
        State(Setup setup,List<Movement> movements,List<Activity> activities) { this.setup=setup;this.movements=movements;this.activities=activities;cash=setup.opening(); }
        void advance(LocalDate day) {
            while (movementIndex<movements.size() && !movements.get(movementIndex).date().isAfter(day)) cash=cash.add(movements.get(movementIndex++).amount());
            while (activityIndex<activities.size() && !activities.get(activityIndex).date().isAfter(day)) {
                var activity=activities.get(activityIndex++); quantities.merge(activity.security(),activity.quantity(),BigDecimal::add);
            }
        }
    }
}
