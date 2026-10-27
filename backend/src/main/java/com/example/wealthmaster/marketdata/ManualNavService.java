package com.example.wealthmaster.marketdata;

import com.example.wealthmaster.accounts.*;
import com.example.wealthmaster.config.BusinessTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.*;
import java.time.*;
import java.util.*;
import static com.example.wealthmaster.marketdata.MarketDtos.*;

@Service
public class ManualNavService {
    private final JdbcTemplate db;private final AccountRepository accounts;private final BusinessTime time;private final ObjectMapper mapper;
    public ManualNavService(JdbcTemplate db,AccountRepository accounts,BusinessTime time,ObjectMapper mapper){this.db=db;this.accounts=accounts;this.time=time;this.mapper=mapper;}
    private NavEntry row(ResultSet r,int n)throws SQLException {
        return new NavEntry(r.getObject("id",UUID.class),r.getObject("security_id",UUID.class),r.getObject("nav_date",LocalDate.class),r.getBigDecimal("price").stripTrailingZeros().toPlainString(),r.getString("quote_currency"),r.getTimestamp("fetched_at").toInstant(),r.getString("manual_reference"));
    }
    private Map<String,Object> fund(UUID owner,UUID id,boolean lock) {
        var rows=db.queryForList("SELECT * FROM investment_securities WHERE owner_id=? AND id=?"+(lock?" FOR UPDATE":""),owner,id);
        if(rows.isEmpty())throw new AccountFailure(404,"Fund not found.");
        if(!rows.getFirst().get("type").equals("FUND"))throw new IllegalArgumentException("Manual NAV entries are for fund holdings.");
        return rows.getFirst();
    }
    private String hash(NavInput input) {
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsString(input).getBytes(StandardCharsets.UTF_8)));}
        catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public List<NavEntry> history(UUID owner,UUID security) {
        fund(owner,security,false);
        return db.query("SELECT * FROM market_quotes WHERE owner_id=? AND security_id=? AND source='MANUAL_NAV' ORDER BY nav_date DESC,fetched_at DESC,id DESC LIMIT 100",this::row,owner,security);
    }
    @Transactional
    public NavEntry record(UUID owner,UUID security,NavInput input) {
        var account=accounts.findByIdAndOwnerId(input.accountId(),owner).orElseThrow(()->new AccountFailure(404,"Account not found."));
        if(!account.isActive())throw new AccountFailure(409,"Restore the investment account before recording a NAV.");
        if(account.getType()!=AccountType.INVESTMENT)throw new IllegalArgumentException("Choose an investment account.");
        var fund=fund(owner,security,true);
        if(!db.queryForObject("SELECT EXISTS(SELECT 1 FROM investment_activities WHERE owner_id=? AND account_id=? AND security_id=?)",Boolean.class,owner,input.accountId(),security))throw new AccountFailure(404,"Fund holding not found in this account.");
        if(input.date()==null||input.date().getYear()<1||input.date().getYear()>9999||input.date().isAfter(time.today()))throw new IllegalArgumentException("Enter a published NAV date on or before today (years 1–9999).");
        if(input.nav()==null||!input.nav().matches("[0-9]{1,26}(\\.[0-9]{1,12})?"))throw new IllegalArgumentException("Enter an exact NAV with at most 26 integer and 12 fractional digits.");
        var nav=new BigDecimal(input.nav());if(nav.signum()<=0)throw new IllegalArgumentException("NAV must be positive.");
        if(input.reference()!=null&&input.reference().length()>500)throw new IllegalArgumentException("Source reference allows at most 500 characters.");
        var prior=db.query("SELECT * FROM market_quotes WHERE owner_id=? AND security_id=? AND request_id=?",this::row,owner,security,input.requestId());
        var fingerprint=hash(input);
        if(!prior.isEmpty()) {
            var original=db.queryForObject("SELECT input_hash FROM market_quotes WHERE id=?",String.class,prior.getFirst().id());
            if(!fingerprint.equals(original))throw new AccountFailure(409,"Submission ID already belongs to another NAV entry. Reload the history before entering a correction.");
            return prior.getFirst();
        }
        var id=UUID.randomUUID();var currency=(String)fund.get("currency");
        db.update("""
            INSERT INTO market_quotes(id,owner_id,security_id,symbol,base_currency,quote_currency,price,quoted_at,fetched_at,source,nav_date,manual_reference,request_id,input_hash)
            VALUES(?,?,?,?,?,?,?,NULL,?,'MANUAL_NAV',?,?,?,?)
            """,id,owner,security,fund.get("isin"),currency,currency,nav,Timestamp.from(time.now()),input.date(),input.reference(),input.requestId(),fingerprint);
        var after=db.queryForObject("SELECT * FROM market_quotes WHERE id=?",this::row,id);
        db.update("INSERT INTO audit_events(id,actor_id,event_type,resource_id,details) VALUES(?,?,?,?,CAST(? AS jsonb))",UUID.randomUUID(),owner,"FUND_NAV_RECORDED",id,mapper.writeValueAsString(Map.of("entry",after,"accountId",input.accountId())));
        return after;
    }
}
