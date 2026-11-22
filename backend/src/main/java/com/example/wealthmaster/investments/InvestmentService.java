package com.example.wealthmaster.investments;

import com.example.wealthmaster.accounts.*;
import com.example.wealthmaster.config.BusinessTime;
import com.example.wealthmaster.ledger.LedgerService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.math.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import static com.example.wealthmaster.investments.InvestmentDtos.*;

@Service
public class InvestmentService implements AccountUsagePolicy.ActivitySource {
    private final JdbcTemplate db;
    private final AccountRepository accounts;
    private final LedgerService ledger;
    private final BusinessTime time;
    private final ObjectMapper mapper;
    public InvestmentService(JdbcTemplate db,AccountRepository accounts,LedgerService ledger,BusinessTime time,ObjectMapper mapper) {
        this.db=db;this.accounts=accounts;this.ledger=ledger;this.time=time;this.mapper=mapper;
    }
    private static String number(BigDecimal value) {return value==null?null:value.stripTrailingZeros().toPlainString();}
    private static BigDecimal decimal(String value,int integerDigits,int scale,boolean positive) {
        if(value==null || !value.matches("[0-9]{1,"+integerDigits+"}(\\.[0-9]{1,"+scale+"})?"))throw new IllegalArgumentException("Use an exact nonnegative decimal with at most "+integerDigits+" integer and "+scale+" fractional digits.");
        var result=new BigDecimal(value);if(positive && result.signum()<=0)throw new IllegalArgumentException("Quantity, price and settlement must be positive.");return result;
    }
    private static BigDecimal optional(String value,int digits,int scale) {return value==null||value.isBlank()?null:decimal(value,digits,scale,false);}
    private static void date(LocalDate value) {if(value==null||value.getYear()<1||value.getYear()>9999)throw new IllegalArgumentException("Use a date in years 1–9999.");}
    private static void currency(String value) {try {if(value==null||!value.matches("[A-Z]{3}"))throw new IllegalArgumentException();Currency.getInstance(value);}catch(RuntimeException e){throw new IllegalArgumentException("Choose a valid ISO currency.");}}
    private String json(Object value) {return mapper.writeValueAsString(value);}
    private String hash(Object value) {
        try {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json(value).getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    }
    public boolean hasActivity(UUID accountId) {return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM investment_activities WHERE account_id=?)",Boolean.class,accountId));}
    public int unvaluedHoldings(UUID owner,LocalDate date) {
        return db.queryForObject("""
            SELECT count(*) FROM (SELECT i.account_id,i.security_id FROM investment_activities i
              JOIN financial_accounts a ON a.id=i.account_id AND a.owner_id=i.owner_id
              WHERE i.owner_id=? AND a.active AND a.opening_date<=? AND NOT i.reversed AND i.trade_date<=?
              GROUP BY i.account_id,i.security_id HAVING SUM(CASE WHEN i.kind='SELL' THEN -i.quantity ELSE i.quantity END)>0) positions
            """,Integer.class,owner,date,date);
    }
    private Security securityRow(java.sql.ResultSet r,int n) throws java.sql.SQLException {
        return new Security(r.getObject("id",UUID.class),r.getString("name"),r.getString("symbol"),r.getString("exchange"),r.getString("isin"),r.getString("type"),r.getString("currency"));
    }
    @Transactional(readOnly=true)
    public List<Security> securities(UUID owner) {return db.query("SELECT * FROM investment_securities WHERE owner_id=? ORDER BY lower(name),id",this::securityRow,owner);}
    @Transactional
    public Security createSecurity(UUID owner,SecurityInput input) {
        currency(input.currency());
        if(!Set.of("STOCK","ETF","FUND").contains(input.type()))throw new IllegalArgumentException("Choose Stock, ETF or Fund.");
        if(input.isin()!=null&&!input.isin().isBlank()&&!input.isin().matches("[A-Z]{2}[A-Z0-9]{9}[0-9]"))throw new IllegalArgumentException("ISIN must have 12 characters, for example two letters followed by its identifier and check digit.");
        if(input.name().strip().isEmpty()||input.symbol().strip().isEmpty()||input.exchange().strip().isEmpty())throw new IllegalArgumentException("Enter name, symbol and exchange.");
        if(input.type().equals("FUND")&&(input.isin()==null||!validIsin(input.isin())))throw new IllegalArgumentException("Enter a valid fund ISIN including its check digit.");
        var symbol=input.type().equals("FUND")?input.isin():input.symbol().strip();
        var exchange=input.type().equals("FUND")?"NAV":input.exchange().strip();
        var id=UUID.randomUUID();
        int inserted=db.update("INSERT INTO investment_securities(id,owner_id,name,symbol,exchange,isin,type,currency) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING",id,owner,input.name().strip(),symbol,exchange,input.isin()==null||input.isin().isBlank()?null:input.isin(),input.type(),input.currency());
        if(inserted!=1)throw new AccountFailure(409,"This listing or fund ISIN already exists. Select the existing security.");
        var after=security(owner,id);audit(owner,id,"SECURITY_CREATED",null,after);return after;
    }
    private static boolean validIsin(String isin) {
        if(!isin.matches("[A-Z]{2}[A-Z0-9]{9}[0-9]"))return false;
        var digits=new StringBuilder();
        for(char c:isin.toCharArray())digits.append(Character.isDigit(c)?String.valueOf(c):String.valueOf(c-'A'+10));
        int sum=0;boolean doubled=false;
        for(int i=digits.length()-1;i>=0;i--){int n=digits.charAt(i)-'0';if(doubled)n*=2;sum+=n/10+n%10;doubled=!doubled;}
        return sum%10==0;
    }
    private Security security(UUID owner,UUID id) {
        var found=db.query("SELECT * FROM investment_securities WHERE id=? AND owner_id=?",this::securityRow,id,owner);
        if(found.isEmpty())throw new AccountFailure(404,"Security not found.");return found.getFirst();
    }
    private Map<String,Object> account(UUID owner,UUID id) {
        var rows=db.queryForList("SELECT * FROM financial_accounts WHERE id=? AND owner_id=?",id,owner);
        if(rows.isEmpty())throw new AccountFailure(404,"Account not found.");
        var account=rows.getFirst();if(!account.get("type").equals("INVESTMENT"))throw new AccountFailure(400,"Choose an investment account.");return account;
    }
    private void active(Map<String,Object> account) {if(!Boolean.TRUE.equals(account.get("active")))throw new AccountFailure(409,"Restore the investment account before changing holdings.");}
    private List<Charge> charges(String raw) {return Arrays.asList(mapper.readValue(raw,Charge[].class));}
    private Activity activityRow(java.sql.ResultSet r,int n) throws java.sql.SQLException {
        return new Activity(r.getObject("id",UUID.class),r.getObject("account_id",UUID.class),r.getObject("security_id",UUID.class),Kind.valueOf(r.getString("kind")),number(r.getBigDecimal("quantity")),number(r.getBigDecimal("unit_price")),number(r.getBigDecimal("gross")),r.getObject("trade_date",LocalDate.class),r.getObject("cash_date",LocalDate.class),r.getObject("acquired_on",LocalDate.class),number(r.getBigDecimal("settlement")),number(r.getBigDecimal("acquisition_cost")),r.getString("cash_currency"),r.getString("trade_currency"),r.getBoolean("aggregate_opening"),charges(r.getString("charges")),r.getString("reference"),r.getString("notes"),r.getObject("cash_operation_id",UUID.class),r.getLong("version"),r.getBoolean("reversed"),r.getTimestamp("created_at").toInstant(),db.query("SELECT * FROM investment_sale_allocations WHERE sale_id=? ORDER BY lot_id",(a,index)->new Allocation(a.getObject("lot_id",UUID.class),number(a.getBigDecimal("quantity")),number(a.getBigDecimal("cash_cost"))),r.getObject("id",UUID.class)));
    }
    private Activity activity(UUID owner,UUID id) {
        var found=db.query("SELECT * FROM investment_activities WHERE id=? AND owner_id=?",this::activityRow,id,owner);
        if(found.isEmpty())throw new AccountFailure(404,"Investment activity not found.");return found.getFirst();
    }
    private List<Activity> activities(UUID owner,UUID account) {return db.query("SELECT * FROM investment_activities WHERE owner_id=? AND account_id=? ORDER BY trade_date DESC,created_at DESC,id",this::activityRow,owner,account);}
    private List<Lot> lots(UUID owner,UUID account,UUID security,LocalDate asOf,boolean reserveFuture) {
        return db.query("""
            SELECT l.*,i.security_id,i.trade_date,i.acquired_on,i.aggregate_opening,
              l.quantity-COALESCE(used.quantity,0) AS remaining,l.cash_cost-COALESCE(used.cost,0) AS remaining_cost
            FROM investment_lots l JOIN investment_activities i ON i.id=l.activity_id AND i.owner_id=l.owner_id
            LEFT JOIN (SELECT x.lot_id,SUM(x.quantity) quantity,SUM(x.cash_cost) cost
              FROM investment_sale_allocations x JOIN investment_activities sale ON sale.id=x.sale_id AND sale.owner_id=x.owner_id
              WHERE NOT sale.reversed AND sale.trade_date<=? GROUP BY x.lot_id) used ON used.lot_id=l.id
            WHERE i.owner_id=? AND i.account_id=? AND i.security_id=? AND NOT i.reversed AND i.trade_date<=?
            ORDER BY COALESCE(i.acquired_on,i.trade_date),i.trade_date,i.created_at,i.id
            """,(r,n)->new Lot(r.getObject("id",UUID.class),r.getObject("activity_id",UUID.class),r.getObject("security_id",UUID.class),r.getObject("trade_date",LocalDate.class),r.getObject("acquired_on",LocalDate.class),r.getBoolean("aggregate_opening"),number(r.getBigDecimal("quantity")),number(r.getBigDecimal("remaining")),number(r.getBigDecimal("remaining_cost"))),reserveFuture?LocalDate.of(9999,12,31):asOf,owner,account,security,asOf).stream().filter(l->new BigDecimal(l.remaining()).signum()>0).toList();
    }
    private BigDecimal cash(UUID owner,UUID account,LocalDate date) {
        return db.queryForObject("SELECT a.opening_balance+COALESCE((SELECT SUM(m.amount) FROM ledger_movements m JOIN ledger_operations o ON o.id=m.operation_id WHERE m.account_id=a.id AND o.owner_id=a.owner_id AND NOT o.deleted AND o.transaction_date<=?),0) FROM financial_accounts a WHERE a.id=? AND a.owner_id=?",BigDecimal.class,date,account,owner);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public AccountView view(UUID owner,UUID accountId) {
        var account=account(owner,accountId);var asOf=time.today();var all=securities(owner);var holdings=new ArrayList<Holding>();
        for(var security:all) {
            var lots=lots(owner,accountId,security.id(),asOf,false);if(lots.isEmpty())continue;
            BigDecimal quantity=BigDecimal.ZERO,cost=BigDecimal.ZERO;boolean complete=true;
            for(var lot:lots){quantity=quantity.add(new BigDecimal(lot.remaining()));if(lot.remainingCost()==null)complete=false;else cost=cost.add(new BigDecimal(lot.remainingCost()));}
            holdings.add(new Holding(security,number(quantity),number(cost),complete,complete?number(cost.divide(quantity,12,RoundingMode.HALF_UP)):null,lots));
        }
        return new AccountView(accountId,(String)account.get("currency"),number(cash(owner,accountId,asOf)),asOf,(Boolean)account.get("active"),all,holdings,activities(owner,accountId));
    }
    private String snapshot(UUID owner,UUID accountId,Object input) {
        var account=account(owner,accountId);
        var cash=db.queryForList("SELECT id,version,kind,amount,transaction_date,deleted FROM ledger_operations WHERE owner_id=? AND (account_id=? OR destination_id=?) ORDER BY id",owner,accountId,accountId);
        var allocations=db.queryForList("SELECT x.* FROM investment_sale_allocations x JOIN investment_activities i ON i.id=x.sale_id WHERE i.owner_id=? AND i.account_id=? ORDER BY x.sale_id,x.lot_id",owner,accountId);
        return hash(List.of(input,account,activities(owner,accountId),cash,allocations));
    }
    private void timeline(UUID owner,UUID account,UUID security,LocalDate day,BigDecimal delta,UUID exclude) {
        var dates=new TreeMap<LocalDate,BigDecimal>();
        for(var op:activities(owner,account))if(!op.reversed()&&op.securityId().equals(security)&&!op.id().equals(exclude))dates.merge(op.tradeDate(),new BigDecimal(op.quantity()).multiply(op.kind()==Kind.SELL?BigDecimal.ONE.negate():BigDecimal.ONE),BigDecimal::add);
        if(day!=null)dates.merge(day,delta,BigDecimal::add);
        BigDecimal balance=BigDecimal.ZERO;
        for(var entry:dates.entrySet()){balance=balance.add(entry.getValue());if(balance.signum()<0)throw new AccountFailure(409,"Holdings would be negative on "+entry.getKey()+". Review later sales first.");}
    }
    private void cashTimeline(UUID owner,UUID account,LocalDate day,BigDecimal delta) {
        if(delta.signum()>=0)return;
        var opening=(BigDecimal)account(owner,account).get("opening_balance");
        var dates=new TreeMap<LocalDate,BigDecimal>();
        db.query("SELECT o.transaction_date,SUM(m.amount) amount FROM ledger_movements m JOIN ledger_operations o ON o.id=m.operation_id WHERE o.owner_id=? AND m.account_id=? AND NOT o.deleted GROUP BY o.transaction_date",r->{dates.put(r.getObject("transaction_date",LocalDate.class),r.getBigDecimal("amount"));},owner,account);
        dates.merge(day,delta,BigDecimal::add);var balance=opening;
        for(var entry:dates.entrySet()){balance=balance.add(entry.getValue());if(!entry.getKey().isBefore(day)&&balance.signum()<0)throw new AccountFailure(409,"Insufficient cash on "+entry.getKey()+". Record the actual funding first.");}
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Preview preview(UUID owner,Input input) {
        var account=account(owner,input.accountId());active(account);var security=security(owner,input.securityId());
        var errors=new ArrayList<String>();var warnings=new ArrayList<String>();var allocations=new ArrayList<Allocation>();var available=new ArrayList<Lot>();
        BigDecimal quantity=decimal(input.quantity(),16,12,true),price=optional(input.unitPrice(),16,12),gross=price==null?null:quantity.multiply(price),movement=BigDecimal.ZERO;
        date(input.tradeDate());if(input.acquiredOn()!=null){date(input.acquiredOn());if(input.acquiredOn().isAfter(input.tradeDate()))throw new IllegalArgumentException("Acquisition date cannot follow the opening snapshot.");}
        if(!input.cashOnlyConfirmed())errors.add("Confirm this account holds uninvested cash only and the entered settlement includes all charges.");
        if(input.charges()!=null)for(var charge:input.charges()){if(!Set.of("FEE","TAX").contains(charge.type()))throw new IllegalArgumentException("Choose Fee or Tax.");decimal(charge.amount(),20,8,false);currency(charge.currency());}
        if(input.kind()==Kind.OPENING) {
            optional(input.acquisitionCost(),20,8);
            if(input.cashDate()!=null || input.settlement()!=null&&!input.settlement().isBlank())throw new IllegalArgumentException("Opening holdings do not create cash movements.");
            if(input.acquiredOn()==null)warnings.add("Original acquisition date is unknown; review this lot's order when selling.");
            if(input.acquisitionCost()==null||input.acquisitionCost().isBlank())warnings.add("Acquisition cost is unknown; complete average cost and performance cannot be shown.");
            if(input.aggregateOpening())warnings.add("This opening holding is an aggregate, not a reconstruction of historical acquisition lots.");
        } else {
            if(price==null||price.signum()<=0)throw new IllegalArgumentException("Enter a positive execution price.");date(input.cashDate());
            if(input.acquiredOn()!=null || input.aggregateOpening() || input.acquisitionCost()!=null&&!input.acquisitionCost().isBlank())throw new IllegalArgumentException("Opening acquisition fields are only valid for existing holdings.");
            movement=decimal(input.settlement(),20,8,true).multiply(input.kind()==Kind.BUY?BigDecimal.ONE.negate():BigDecimal.ONE);
        }
        try {timeline(owner,input.accountId(),input.securityId(),input.tradeDate(),input.kind()==Kind.SELL?quantity.negate():quantity,null);if(input.kind()!=Kind.OPENING)cashTimeline(owner,input.accountId(),input.cashDate(),movement);}
        catch(AccountFailure e){errors.add(e.getMessage());}
        if(input.kind()==Kind.SELL) {
            available.addAll(lots(owner,input.accountId(),input.securityId(),input.tradeDate(),true));
            var remaining=quantity;var selections=new LinkedHashMap<UUID,BigDecimal>();
            if(input.allocations()!=null)for(var choice:input.allocations()) {
                var value=decimal(choice.quantity(),16,12,false);
                if(selections.put(choice.lotId(),value)!=null)throw new IllegalArgumentException("Select a lot only once.");
                if(available.stream().noneMatch(l->l.id().equals(choice.lotId())))throw new IllegalArgumentException("Choose a remaining lot from this account/security, available by the trade date.");
            }
            for(var lot:available) {
                var availableQuantity=new BigDecimal(lot.remaining());
                var take=input.allocations()==null?remaining.min(availableQuantity):selections.getOrDefault(lot.id(),BigDecimal.ZERO);
                if(take.compareTo(availableQuantity)>0){errors.add("Lot "+lot.id()+": allocated quantity exceeds unreserved shares.");continue;}
                if(take.signum()==0)continue;
                BigDecimal cost=lot.remainingCost()==null?null:new BigDecimal(lot.remainingCost());
                if(cost!=null && take.compareTo(availableQuantity)!=0)cost=cost.multiply(take).divide(availableQuantity,8,RoundingMode.HALF_UP);
                allocations.add(new Allocation(lot.id(),number(take),number(cost)));remaining=remaining.subtract(take);
                if(lot.acquiredOn()==null)warnings.add("Lot "+lot.id()+": acquisition date unknown. Explicitly review this allocation; it is not verified historical FIFO.");
                if(cost==null)warnings.add("Lot "+lot.id()+": acquisition cost is unknown.");
            }
            if(remaining.signum()!=0)errors.add("Allocate exactly "+number(quantity)+" shares. Shares reserved by later sales cannot be allocated again.");
        } else if(input.allocations()!=null&&!input.allocations().isEmpty())throw new IllegalArgumentException("Lot allocations apply only to sales.");
        warnings.add("Acquisition cost is not market value. These holdings remain unvalued in cash-only net worth.");
        return new Preview(snapshot(owner,input.accountId(),input),errors,warnings,number(gross),number(movement),(String)account.get("currency"),security.currency(),available,allocations);
    }
    @Transactional
    public Activity commit(UUID owner,Commit commit) {
        var input=commit.input();
        var account=accounts.findByIdAndOwnerId(input.accountId(),owner).orElseThrow(()->new AccountFailure(404,"Account not found."));
        var prior=db.query("SELECT * FROM investment_activities WHERE owner_id=? AND request_id=?",this::activityRow,owner,input.requestId());
        if(!prior.isEmpty()) {
            var originalHash=db.queryForObject("SELECT input_hash FROM investment_activities WHERE id=?",String.class,prior.getFirst().id());
            if(!hash(input).equals(originalHash))throw new AccountFailure(409,"Submission ID already belongs to different activity.");return prior.getFirst();
        }
        if(!commit.approved())throw new IllegalArgumentException("Approve the reviewed trade and allocation before saving.");
        var preview=preview(owner,input);
        if(!preview.token().equals(commit.token()))throw new AccountFailure(412,"Cash or investment activity changed. Rebuild the preview.");
        if(!preview.errors().isEmpty())throw new AccountFailure(409,String.join(" ",preview.errors()));
        var id=UUID.randomUUID();var quantity=decimal(input.quantity(),16,12,true);var price=optional(input.unitPrice(),16,12);
        var settlement=input.kind()==Kind.OPENING?null:decimal(input.settlement(),20,8,true);
        var cost=input.kind()==Kind.OPENING?optional(input.acquisitionCost(),20,8):input.kind()==Kind.BUY?settlement:null;
        db.update("""
            INSERT INTO investment_activities(id,owner_id,account_id,security_id,kind,quantity,unit_price,gross,
              trade_date,cash_date,acquired_on,settlement,acquisition_cost,cash_currency,trade_currency,aggregate_opening,
              charges,reference,notes,request_id,input_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CAST(? AS jsonb),?,?,?,?)
            """,id,owner,input.accountId(),input.securityId(),input.kind().name(),quantity,price,price==null?null:quantity.multiply(price),input.tradeDate(),input.cashDate(),input.kind()==Kind.BUY?input.tradeDate():input.acquiredOn(),settlement,cost,account.getCurrency(),preview.tradeCurrency(),input.aggregateOpening(),json(input.charges()==null?List.of():input.charges()),input.reference(),input.notes(),input.requestId(),hash(input));
        if(input.kind()!=Kind.SELL)db.update("INSERT INTO investment_lots(id,owner_id,activity_id,quantity,cash_cost) VALUES(?,?,?,?,?)",id,owner,id,quantity,cost);
        else for(var allocation:preview.allocations())db.update("INSERT INTO investment_sale_allocations(sale_id,lot_id,owner_id,quantity,cash_cost) VALUES(?,?,?,?,?)",id,allocation.lotId(),owner,new BigDecimal(allocation.quantity()),allocation.cashCost()==null?null:new BigDecimal(allocation.cashCost()));
        if(input.kind()!=Kind.OPENING) {
            var security=security(owner,input.securityId());
            var cash=ledger.investmentCash(owner,input.accountId(),id,input.kind()==Kind.BUY,input.settlement(),input.cashDate(),(input.kind()==Kind.BUY?"Purchase ":"Sale ")+security.symbol(),input.notes());
            db.update("UPDATE investment_activities SET cash_operation_id=? WHERE id=?",cash.id(),id);
        }
        var after=activity(owner,id);audit(owner,id,"INVESTMENT_CREATED",null,Map.of("activity",after,"reviewedInput",input));return after;
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ReversalPreview reversalPreview(UUID owner,UUID id) {
        var activity=activity(owner,id);active(account(owner,activity.accountId()));var errors=new ArrayList<String>();
        if(activity.reversed())throw new AccountFailure(409,"This activity is already reversed.");
        if(activity.kind()!=Kind.SELL) {
            var dependent=db.queryForList("SELECT x.sale_id FROM investment_sale_allocations x JOIN investment_activities sale ON sale.id=x.sale_id WHERE x.lot_id=? AND NOT sale.reversed ORDER BY x.sale_id",UUID.class,id);
            if(!dependent.isEmpty())errors.add("Reverse dependent sales first: "+dependent);
        }
        try {timeline(owner,activity.accountId(),activity.securityId(),null,null,id);if(activity.kind()==Kind.SELL)cashTimeline(owner,activity.accountId(),activity.cashDate(),new BigDecimal(activity.settlement()).negate());}
        catch(AccountFailure e){errors.add(e.getMessage());}
        String movement=activity.settlement()==null?"0":number(new BigDecimal(activity.settlement()).multiply(activity.kind()==Kind.SELL?BigDecimal.ONE.negate():BigDecimal.ONE));
        return new ReversalPreview(snapshot(owner,activity.accountId(),List.of("reverse",id,activity.version())),errors,movement);
    }
    @Transactional
    public Activity reverse(UUID owner,UUID id,Reversal input) {
        var before=activity(owner,id);
        if(before.cashOperationId()!=null)db.queryForList("SELECT id FROM ledger_operations WHERE id=? AND owner_id=? FOR UPDATE",before.cashOperationId(),owner);
        accounts.findByIdAndOwnerId(before.accountId(),owner).orElseThrow(()->new AccountFailure(404,"Account not found."));
        before=activity(owner,id);if(before.reversed())return before;
        if(before.version()!=input.version())throw new AccountFailure(412,"Investment activity changed. Refresh and review again.");
        if(!input.approved())throw new IllegalArgumentException("Approve this reversal.");
        var preview=reversalPreview(owner,id);
        if(!preview.token().equals(input.token()))throw new AccountFailure(412,"Cash or investment activity changed. Rebuild the reversal preview.");
        if(!preview.errors().isEmpty())throw new AccountFailure(409,String.join(" ",preview.errors()));
        if(before.cashOperationId()!=null)ledger.reverseInvestmentCash(owner,before.cashOperationId());
        db.update("UPDATE investment_activities SET reversed=TRUE,version=version+1 WHERE id=?",id);
        var after=activity(owner,id);audit(owner,id,"INVESTMENT_REVERSED",before,after);return after;
    }
    private record Change(Object before,Object after) {}
    private void audit(UUID owner,UUID id,String event,Object before,Object after) {db.update("INSERT INTO audit_events(id,actor_id,event_type,resource_id,details) VALUES(?,?,?,?,CAST(? AS jsonb))",UUID.randomUUID(),owner,event,id,json(new Change(before,after)));}
}
