package com.example.wealthmaster.marketdata;

import com.example.wealthmaster.config.BusinessTime;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

/** Saved data only. Later fetches may supply earlier dated observations, never later prices. */
@Service
public class HistoricalPrices {
    private final NamedParameterJdbcTemplate db;
    private final ObjectMapper mapper;
    private final BusinessTime time;
    public HistoricalPrices(NamedParameterJdbcTemplate db, ObjectMapper mapper, BusinessTime time) {
        this.db = db; this.mapper = mapper; this.time = time;
    }
    public record Security(UUID id, String name, String currency, String type, String symbol) {}
    public record Price(BigDecimal amount, LocalDate date, Instant quotedAt, Instant fetchedAt, String source) {
        public boolean stale(LocalDate day, Instant cutoff) {
            return quotedAt == null ? date.isBefore(day.minusDays(7))
                : quotedAt.isBefore(cutoff.minus(Duration.ofDays(7))) || fetchedAt.isBefore(cutoff.minus(Duration.ofDays(1)));
        }
    }
    public static final class History {
        private final Map<String, NavigableMap<Instant, Price>> timed = new HashMap<>();
        private final Map<UUID, NavigableMap<LocalDate, Price>> navs = new HashMap<>();
        private void add(String key, Price price) {
            timed.computeIfAbsent(key, ignored -> new TreeMap<>()).put(price.quotedAt(), price);
        }
        public Price security(Security security, LocalDate day, Instant cutoff) {
            if (security.type().equals("FUND")) {
                var dates = navs.get(security.id());
                var entry = dates == null ? null : dates.floorEntry(day);
                return entry == null ? null : entry.getValue();
            }
            return at("S:" + security.id(), cutoff);
        }
        public Price fx(String from, String to, Instant cutoff) { return at("F:" + from + ":" + to, cutoff); }
        private Price at(String key, Instant cutoff) {
            var series = timed.get(key);
            var entry = series == null ? null : series.floorEntry(cutoff);
            return entry == null ? null : entry.getValue();
        }
    }
    public History load(UUID owner, Map<UUID, Security> securities) {
        var history = new History();
        if (securities.isEmpty()) return history;
        db.query("""
            SELECT * FROM market_quotes WHERE owner_id=:owner AND (security_id IN (:ids) OR security_id IS NULL)
            ORDER BY fetched_at,id
            """, Map.of("owner", owner, "ids", securities.keySet()), (org.springframework.jdbc.core.RowCallbackHandler) row -> {
            var securityId = row.getObject("security_id", UUID.class);
            var security = securities.get(securityId);
            String source = row.getString("source"), currency = row.getString("quote_currency");
            if (securityId != null && (security == null || !security.currency().equals(currency))) return;
            var fetched = row.getTimestamp("fetched_at").toInstant();
            if (source.equals("MANUAL_NAV")) {
                if (security == null || !security.type().equals("FUND")) return;
                var date = row.getObject("nav_date", LocalDate.class);
                history.navs.computeIfAbsent(securityId, ignored -> new TreeMap<>()).put(date,
                    new Price(row.getBigDecimal("price"), date, null, fetched, source));
                return;
            }
            if (securityId != null && (security.type().equals("FUND") || !Objects.equals(security.symbol(), row.getString("symbol")))) return;
            String key = securityId == null ? "F:" + row.getString("base_currency") + ":" + currency : "S:" + securityId;
            var quoted = row.getTimestamp("quoted_at").toInstant();
            // Stored series are normalized decimal strings from the same listing/currency as the quote.
            for (var point : mapper.readTree(row.getString("series"))) {
                var at = Instant.parse(point.path("at").asText());
                var amount = new BigDecimal(point.path("close").asText());
                if (amount.signum() > 0 && !at.isAfter(quoted))
                    history.add(key, new Price(amount, time.dateAt(at), at, fetched, source));
            }
            history.add(key, new Price(row.getBigDecimal("price"), time.dateAt(quoted), quoted, fetched, source));
        });
        return history;
    }
}
