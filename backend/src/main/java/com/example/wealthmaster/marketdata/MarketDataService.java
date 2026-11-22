package com.example.wealthmaster.marketdata;

import com.example.wealthmaster.accounts.AccountFailure;
import com.example.wealthmaster.config.BusinessTime;
import com.example.wealthmaster.investments.InvestmentDtos;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.time.*;
import java.util.*;
import static com.example.wealthmaster.marketdata.MarketDtos.*;

@Service
public class MarketDataService {
    private final MarketProvider provider;private final MarketQuoteStore store;private final JdbcTemplate db;private final BusinessTime time;
    public MarketDataService(MarketProvider provider,MarketQuoteStore store,JdbcTemplate db,BusinessTime time){this.provider=provider;this.store=store;this.db=db;this.time=time;}
    public List<Listing> search(String query){return provider.search(query);}
    public InvestmentDtos.Security create(UUID owner,String symbol){return store.create(owner,provider.quote(symbol));}
    public void bind(UUID owner,UUID security,String symbol) {
        if(!db.queryForObject("SELECT EXISTS(SELECT 1 FROM investment_securities WHERE id=? AND owner_id=?)",Boolean.class,security,owner))throw new AccountFailure(404,"Security not found.");
        store.bind(owner,security,provider.quote(symbol));
    }
    private boolean recent(UUID owner,UUID security,String base,String quote) {
        return db.queryForObject("SELECT EXISTS(SELECT 1 FROM market_quotes WHERE owner_id=? AND ((?::uuid IS NOT NULL AND security_id=? AND symbol=(SELECT market_symbol FROM investment_securities WHERE id=? AND owner_id=?)) OR (?::uuid IS NULL AND security_id IS NULL AND base_currency=? AND quote_currency=?)) AND fetched_at>?)",Boolean.class,owner,security,security,security,owner,security,base,quote,java.sql.Timestamp.from(time.now().minus(Duration.ofMinutes(15))));
    }
    public Refresh refresh(UUID owner,UUID account) {
        var accounts=db.queryForList("SELECT currency,active,type FROM financial_accounts WHERE id=? AND owner_id=?",account,owner);
        if(accounts.isEmpty())throw new AccountFailure(404,"Account not found.");var a=accounts.getFirst();
        if(!a.get("type").equals("INVESTMENT"))throw new IllegalArgumentException("Choose an investment account.");
        if(!Boolean.TRUE.equals(a.get("active")))throw new AccountFailure(409,"Archived investment accounts are read-only.");
        var securities=db.queryForList("""
            SELECT s.id,s.name,s.market_symbol,s.currency,s.type FROM investment_securities s JOIN investment_activities i ON i.security_id=s.id AND i.owner_id=s.owner_id
            WHERE i.owner_id=? AND i.account_id=? AND NOT i.reversed AND i.trade_date<=?
            GROUP BY s.id HAVING SUM(CASE WHEN i.kind='SELL' THEN -i.quantity ELSE i.quantity END)>0 ORDER BY s.id
            """,owner,account,time.today());
        var messages=new ArrayList<String>();int requests=0;
        for(var security:securities) {
            var id=(UUID)security.get("id");String symbol=(String)security.get("market_symbol"),currency=(String)security.get("currency"),cash=(String)a.get("currency");
            boolean manual=security.get("type").equals("FUND");
            if(manual)messages.add(security.get("name")+": uses a manually entered NAV. Update its dated NAV when a new value is published.");
            if(symbol==null&&!manual){messages.add(security.get("name")+": choose an online listing to get prices.");continue;}
            try {
                if(!manual&&!recent(owner,id,currency,currency)){if(++requests>20){messages.add("Refresh limited to 20 requests. Wait 15 minutes, then refresh remaining holdings.");break;}store.save(owner,id,currency,provider.quote(symbol));}
                if(!currency.equals(cash)&&!recent(owner,null,currency,cash)) {
                    if(++requests>20){messages.add("Refresh limited to 20 requests. Wait 15 minutes, then refresh remaining holdings.");break;}
                    var fx=provider.quote(currency+cash+"=X");if(!fx.currency().equals(cash))throw new IllegalArgumentException("Unexpected FX currency.");store.save(owner,null,currency,fx);
                }
            }catch(AccountFailure e){messages.add(security.get("name")+": "+e.getMessage());}
            catch(IllegalArgumentException e){messages.add(security.get("name")+": unsupported quote or currency. Saved data retained.");}
        }
        if(messages.isEmpty())messages.add("Prices refreshed. Recent quotes are reused for 15 minutes.");
        return new Refresh(List.copyOf(messages));
    }
}
