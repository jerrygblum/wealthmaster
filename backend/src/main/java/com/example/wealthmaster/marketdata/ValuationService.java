package com.example.wealthmaster.marketdata;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import com.example.wealthmaster.config.BusinessTime;
import java.math.*;
import java.time.*;
import java.util.*;
import static com.example.wealthmaster.marketdata.MarketDtos.*;

@Service
public class ValuationService {
    private final JdbcTemplate db;private final ObjectMapper mapper;private final BusinessTime time;
    public ValuationService(JdbcTemplate db,ObjectMapper mapper,BusinessTime time){this.db=db;this.mapper=mapper;this.time=time;}
    private static String number(BigDecimal n){return n==null?null:n.stripTrailingZeros().toPlainString();}
    record Saved(BigDecimal price,BigDecimal previous,Instant at,Instant fetched,String source,List<Point> series,LocalDate navDate,List<NavPoint> navHistory,String reference) {}
    private Saved saved(UUID owner,UUID security,String base,String quote) {
        var found=db.query("""
            SELECT * FROM market_quotes WHERE owner_id=? AND
            ((?::uuid IS NOT NULL AND security_id=? AND quote_currency=? AND symbol=(SELECT market_symbol FROM investment_securities WHERE id=? AND owner_id=?)) OR
             (?::uuid IS NULL AND security_id IS NULL AND base_currency=? AND quote_currency=?))
            AND quoted_at<=? ORDER BY quoted_at DESC,fetched_at DESC LIMIT 1
            """,(r,n)->new Saved(r.getBigDecimal("price"),r.getBigDecimal("previous_close"),r.getTimestamp("quoted_at").toInstant(),r.getTimestamp("fetched_at").toInstant(),r.getString("source"),Arrays.asList(mapper.readValue(r.getString("series"),Point[].class)),null,List.of(),null),owner,security,security,base,security,owner,security,base,quote,java.sql.Timestamp.from(time.now()));
        return found.isEmpty()?null:found.getFirst();
    }
    private Saved manual(UUID owner,UUID security,String currency) {
        var rows=db.queryForList("""
            SELECT DISTINCT ON(nav_date) nav_date,price,fetched_at,manual_reference FROM market_quotes
            WHERE owner_id=? AND security_id=? AND source='MANUAL_NAV' AND quote_currency=? AND nav_date<=?
            ORDER BY nav_date DESC,fetched_at DESC,id DESC LIMIT 30
            """,owner,security,currency,time.today());
        if(rows.isEmpty())return null;
        var latest=rows.getFirst();var history=new ArrayList<NavPoint>();
        for(var row:rows)history.add(new NavPoint(((java.sql.Date)row.get("nav_date")).toLocalDate(),number((BigDecimal)row.get("price"))));
        Collections.reverse(history);
        return new Saved((BigDecimal)latest.get("price"),rows.size()<2?null:(BigDecimal)rows.get(1).get("price"),null,
            ((java.sql.Timestamp)latest.get("fetched_at")).toInstant(),"MANUAL_NAV",List.of(),
            ((java.sql.Date)latest.get("nav_date")).toLocalDate(),List.copyOf(history),(String)latest.get("manual_reference"));
    }
    private boolean stale(Saved quote) {
        if(quote==null)return false;
        if(quote.navDate()!=null)return quote.navDate().isBefore(time.today().minusDays(7));
        return quote.at().isBefore(time.now().minus(Duration.ofDays(7)))||quote.fetched().isBefore(time.now().minus(Duration.ofDays(1)));
    }
    public Valuation value(UUID owner,UUID account,String currency,BigDecimal cash,LocalDate day) {
        var positions=db.queryForList("""
          SELECT s.id,s.name,s.symbol,s.market_symbol,s.currency,s.type,s.isin,SUM(CASE WHEN i.kind='SELL' THEN -i.quantity ELSE i.quantity END) quantity
          FROM investment_activities i JOIN investment_securities s ON s.id=i.security_id AND s.owner_id=i.owner_id
          WHERE i.owner_id=? AND i.account_id=? AND NOT i.reversed AND i.trade_date<=?
          GROUP BY s.id HAVING SUM(CASE WHEN i.kind='SELL' THEN -i.quantity ELSE i.quantity END)>0 ORDER BY lower(s.name),s.id
          """,owner,account,day);
        var holdings=new ArrayList<HoldingValue>();var total=BigDecimal.ZERO;int missing=0;boolean stale=false;
        for(var position:positions) {
            var id=(UUID)position.get("id");String nativeCurrency=(String)position.get("currency");var qty=(BigDecimal)position.get("quantity");
            var quote=position.get("type").equals("FUND")?manual(owner,id,nativeCurrency):saved(owner,id,nativeCurrency,nativeCurrency);var fx=nativeCurrency.equals(currency)?null:saved(owner,null,nativeCurrency,currency);
            var rate=nativeCurrency.equals(currency)?BigDecimal.ONE:fx==null?null:fx.price();
            BigDecimal nativeValue=quote==null?null:qty.multiply(quote.price());
            BigDecimal value=nativeValue==null||rate==null?null:nativeValue.multiply(rate).setScale(8,RoundingMode.HALF_UP);
            if(value==null)missing++;else total=total.add(value);
            boolean old=stale(quote)||stale(fx);stale|=old;
            var change=quote==null||quote.previous()==null?null:quote.price().subtract(quote.previous()).multiply(new BigDecimal("100")).divide(quote.previous(),4,RoundingMode.HALF_UP);
            holdings.add(new HoldingValue(id,(String)position.get("name"),Objects.toString(position.get("market_symbol"),(String)position.get("symbol")),number(qty),nativeCurrency,
                quote==null?null:number(quote.price()),quote==null?null:number(quote.previous()),number(change),quote==null?List.of():quote.series(),quote==null?null:quote.at(),quote==null?null:quote.fetched(),quote==null?null:quote.source(),number(nativeValue),number(rate),fx==null?null:fx.at(),number(value),old,quote==null?null:quote.navDate(),quote==null?List.of():quote.navHistory(),quote==null?null:quote.reference()));
        }
        return new Valuation(currency,number(cash),number(total),number(cash.add(total)),missing,stale,List.copyOf(holdings));
    }
}
