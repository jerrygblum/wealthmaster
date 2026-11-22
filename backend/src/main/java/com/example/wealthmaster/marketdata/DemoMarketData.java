package com.example.wealthmaster.marketdata;

import com.example.wealthmaster.users.DemoConfig;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

/** Deterministic synthetic observations for demo installation only; never contacts a provider. */
@Service
public class DemoMarketData {
    private final JdbcTemplate db;
    private final DemoConfig config;
    public DemoMarketData(JdbcTemplate db,DemoConfig config) {this.db=db;this.config=config;}
    @Transactional
    public void seed(UUID owner,UUID security,LocalDate first,LocalDate today) {
        if(!config.enabled()) throw new IllegalStateException("Synthetic market data requires demo mode.");
        db.update("UPDATE investment_securities SET market_symbol='WMDEMO' WHERE id=? AND owner_id=?",security,owner);
        int index=0;
        for(var day=first;!day.isAfter(today);day=day.plusDays(1)) {
            var quoted=day.atStartOfDay(ZoneOffset.UTC).toInstant();
            var price=new BigDecimal("90").add(new BigDecimal(index%31).multiply(new BigDecimal("0.21"))).add(new BigDecimal(index).multiply(new BigDecimal("0.04")));
            observation(owner,security,"WMDEMO","USD","USD",price,quoted);
            observation(owner,null,"USDCHF=X","USD","CHF",new BigDecimal("0.88").add(new BigDecimal(index%20).multiply(new BigDecimal("0.001"))),quoted);
            index++;
        }
        db.update("INSERT INTO audit_events(id,actor_id,event_type,resource_id) VALUES(?,?,?,?)",UUID.randomUUID(),owner,"DEMO_QUOTES_SEEDED",security);
    }
    private void observation(UUID owner,UUID security,String symbol,String base,String currency,BigDecimal value,Instant at) {
        db.update("INSERT INTO market_quotes(id,owner_id,security_id,symbol,base_currency,quote_currency,price,quoted_at,fetched_at,source) VALUES(?,?,?,?,?,?,?,?,?,'DEMO')",
            UUID.randomUUID(),owner,security,symbol,base,currency,value,java.sql.Timestamp.from(at),java.sql.Timestamp.from(at));
    }
}
