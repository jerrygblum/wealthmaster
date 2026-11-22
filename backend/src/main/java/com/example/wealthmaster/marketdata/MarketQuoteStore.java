package com.example.wealthmaster.marketdata;

import com.example.wealthmaster.accounts.*;
import com.example.wealthmaster.investments.*;
import com.example.wealthmaster.config.BusinessTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.*;
import static com.example.wealthmaster.marketdata.MarketDtos.*;

@Service
public class MarketQuoteStore {
    private final JdbcTemplate db;private final InvestmentService investments;private final ObjectMapper mapper;private final BusinessTime time;
    public MarketQuoteStore(JdbcTemplate db,InvestmentService investments,ObjectMapper mapper,BusinessTime time){this.db=db;this.investments=investments;this.mapper=mapper;this.time=time;}
    @Transactional
    public InvestmentDtos.Security create(UUID owner,Quote quote) {
        if(quote.symbol().length()>32)throw new IllegalArgumentException("This listing symbol is too long. Add it manually instead.");
        if(quote.type()==null)throw new IllegalArgumentException("Choose a stock or ETF listing.");
        var existing=db.queryForList("SELECT id FROM investment_securities WHERE owner_id=? AND market_symbol=?",UUID.class,owner,quote.symbol());
        if(!existing.isEmpty())return investments.securities(owner).stream().filter(s->s.id().equals(existing.getFirst())).findFirst().orElseThrow();
        var security=investments.createSecurity(owner,new InvestmentDtos.SecurityInput(quote.name().substring(0,Math.min(100,quote.name().length())),quote.symbol(),quote.exchange(),null,quote.type(),quote.currency()));
        bind(owner,security.id(),quote);return security;
    }
    @Transactional
    public void bind(UUID owner,UUID security,Quote quote) {
        var rows=db.queryForList("SELECT * FROM investment_securities WHERE id=? AND owner_id=? FOR UPDATE",security,owner);
        if(rows.isEmpty())throw new AccountFailure(404,"Security not found.");var before=rows.getFirst();
        if(quote.type()==null||!quote.type().equals(before.get("type"))||!quote.currency().equals(before.get("currency")))throw new IllegalArgumentException("The selected listing must match this security's type and currency.");
        db.update("UPDATE investment_securities SET market_symbol=? WHERE id=? AND owner_id=?",quote.symbol(),security,owner);
        // Preserve earlier listing quotes for audit/history; current valuation filters the selected symbol.
        db.update("INSERT INTO audit_events(id,actor_id,event_type,resource_id,details) VALUES(?,?,?,?,CAST(? AS jsonb))",UUID.randomUUID(),owner,"SECURITY_MARKET_LINKED",security,mapper.writeValueAsString(Map.of("before",before,"marketSymbol",quote.symbol())));
        save(owner,security,quote.currency(),quote);
    }
    @Transactional
    public void save(UUID owner,UUID security,String base,Quote quote) {
        if(security!=null) {
            var row=db.queryForList("SELECT market_symbol,currency FROM investment_securities WHERE id=? AND owner_id=? FOR UPDATE",security,owner);
            if(row.isEmpty()||!Objects.equals(row.getFirst().get("market_symbol"),quote.symbol())||!Objects.equals(row.getFirst().get("currency"),quote.currency()))throw new AccountFailure(409,"Security listing changed. Refresh again.");
        }
        db.update("INSERT INTO market_quotes(id,owner_id,security_id,symbol,base_currency,quote_currency,price,previous_close,quoted_at,fetched_at,source,series) VALUES(?,?,?,?,?,?,?,?,?,?,?,CAST(? AS jsonb))",UUID.randomUUID(),owner,security,quote.symbol(),base,quote.currency(),new BigDecimal(quote.price()),quote.previousClose()==null?null:new BigDecimal(quote.previousClose()),java.sql.Timestamp.from(quote.quotedAt()),java.sql.Timestamp.from(time.now()),"YAHOO",mapper.writeValueAsString(quote.series()));
    }
}
