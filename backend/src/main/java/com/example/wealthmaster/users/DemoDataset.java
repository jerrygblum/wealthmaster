package com.example.wealthmaster.users;

import com.example.wealthmaster.accounts.*;
import com.example.wealthmaster.budgets.*;
import com.example.wealthmaster.config.BusinessTime;
import com.example.wealthmaster.investments.*;
import com.example.wealthmaster.ledger.*;
import com.example.wealthmaster.marketdata.*;
import org.springframework.stereotype.Service;
import java.time.*;
import java.util.*;

/** Financial fixtures are created through the same application services as ordinary activity. */
@Service
public class DemoDataset {
    public static final int VERSION=1;
    private final AccountService accounts;
    private final CategoryService categories;
    private final LedgerService ledger;
    private final ExpectedService expected;
    private final InvestmentService investments;
    private final ManualNavService nav;
    private final DemoMarketData prices;
    private final PreferencesService preferences;
    private final BusinessTime time;
    public DemoDataset(AccountService accounts,CategoryService categories,LedgerService ledger,ExpectedService expected,
            InvestmentService investments,ManualNavService nav,DemoMarketData prices,PreferencesService preferences,BusinessTime time) {
        this.accounts=accounts;this.categories=categories;this.ledger=ledger;this.expected=expected;this.investments=investments;
        this.nav=nav;this.prices=prices;this.preferences=preferences;this.time=time;
    }
    public void seed(UUID owner) {
        preferences.save(owner,new PreferencesService.Input("CHF",0L));
        var today=time.today();var first=today.withDayOfMonth(1).minusMonths(11);var opening=first.minusDays(1);
        var checking=account(owner,"Everyday checking",AccountType.CHECKING,"CHF","8500",opening);
        var savings=account(owner,"Savings",AccountType.SAVINGS,"CHF","25000",opening);
        var card=account(owner,"Credit card",AccountType.CREDIT_CARD,"CHF","320",opening);
        var wallet=account(owner,"Cash wallet",AccountType.CASH,"CHF","180",opening);
        var broker=account(owner,"Investment portfolio",AccountType.INVESTMENT,"CHF","4500",opening);
        var euro=account(owner,"Euro travel",AccountType.CHECKING,"EUR","1250",opening);
        var archived=account(owner,"Previous savings",AccountType.SAVINGS,"CHF","800",opening);
        var income=category(owner,"Income",CategoryDtos.Type.INCOME,null);
        var salary=category(owner,"Salary",CategoryDtos.Type.INCOME,income);
        var interest=category(owner,"Interest",CategoryDtos.Type.INCOME,income);
        var home=category(owner,"Home",CategoryDtos.Type.SPENDING,null);
        var rent=category(owner,"Rent",CategoryDtos.Type.SPENDING,home);
        var utilities=category(owner,"Utilities",CategoryDtos.Type.SPENDING,home);
        var food=category(owner,"Food",CategoryDtos.Type.SPENDING,null);
        var groceries=category(owner,"Groceries",CategoryDtos.Type.SPENDING,food);
        var dining=category(owner,"Dining",CategoryDtos.Type.SPENDING,food);
        var shopping=category(owner,"Shopping",CategoryDtos.Type.SPENDING,null);
        var travel=category(owner,"Travel",CategoryDtos.Type.SPENDING,null);
        var fees=category(owner,"Investment fees",CategoryDtos.Type.SPENDING,null);
        var salaryExpected=definition(owner,"Monthly salary",ExpectedDtos.Kind.INCOME,checking,null,salary,"6800",1,first);
        var rentExpected=definition(owner,"Monthly rent",ExpectedDtos.Kind.EXPENSE,checking,null,rent,"1850",2,first);
        var savingsExpected=definition(owner,"Savings deposit",ExpectedDtos.Kind.TRANSFER,checking,savings,null,"1000",3,first);
        definition(owner,"Insurance premium",ExpectedDtos.Kind.EXPENSE,checking,null,utilities,"120",25,first);
        int monthIndex=0;
        for(var month=first;!month.isAfter(today);month=month.plusMonths(1)) {
            var paid=transaction(owner,checking,LedgerDtos.Kind.INCOME,"6800",month.plusDays(0),salary,"Salary",today);
            var rentPaid=transaction(owner,checking,LedgerDtos.Kind.EXPENSE,"1850",month.plusDays(1),rent,"Rent",today);
            LedgerDtos.Operation saved=null;
            if(!month.plusDays(2).isAfter(today)) saved=ledger.transfer(owner,null,null,new LedgerDtos.TransferInput(checking,savings,"1000",month.plusDays(2),"Synthetic savings deposit",null));
            match(owner,salaryExpected,month,paid);match(owner,rentExpected,month,rentPaid);match(owner,savingsExpected,month,saved);
            transaction(owner,card,LedgerDtos.Kind.EXPENSE,Integer.toString(120+monthIndex*3)+".45",month.plusDays(3),groceries,"Groceries",today);
            transaction(owner,checking,LedgerDtos.Kind.EXPENSE,"92.30",month.plusDays(5),utilities,"Electricity",today);
            transaction(owner,wallet,LedgerDtos.Kind.EXPENSE,"8.50",month.plusDays(6),dining,"Coffee",today);
            transaction(owner,card,LedgerDtos.Kind.EXPENSE,"149.90",month.plusDays(8),shopping,"Clothing",today);
            transaction(owner,card,LedgerDtos.Kind.REFUND,"49.90",month.plusDays(9),shopping,"Clothing refund",today);
            transaction(owner,checking,LedgerDtos.Kind.EXPENSE,"104.20",month.plusDays(12),groceries,"Groceries",today);
            transaction(owner,euro,LedgerDtos.Kind.EXPENSE,"32.50",month.plusDays(15),travel,"Travel lunch",today);
            transaction(owner,savings,LedgerDtos.Kind.INCOME,"8.25",month.plusDays(23),interest,"Savings interest",today);
            if(!month.plusDays(19).isAfter(today)) ledger.transfer(owner,null,null,new LedgerDtos.TransferInput(checking,card,"400",month.plusDays(19),"Synthetic card payment",null));
            monthIndex++;
        }
        var stock=investments.createSecurity(owner,new InvestmentDtos.SecurityInput("Synthetic world ETF","WMDEMO","DEMO",null,"ETF","USD"));
        var fund=investments.createSecurity(owner,new InvestmentDtos.SecurityInput("Synthetic balanced fund","CH0000000007","NAV","CH0000000007","FUND","CHF"));
        var missing=investments.createSecurity(owner,new InvestmentDtos.SecurityInput("Unpriced example stock","UNPRICED","DEMO",null,"STOCK","CHF"));
        activity(owner,broker,stock.id(),InvestmentDtos.Kind.OPENING,"25",null,null,first);
        activity(owner,broker,fund.id(),InvestmentDtos.Kind.OPENING,"12.5",null,null,first);
        activity(owner,broker,stock.id(),InvestmentDtos.Kind.BUY,"2.5","100","220",first.plusMonths(2));
        activity(owner,broker,stock.id(),InvestmentDtos.Kind.SELL,"1","110","95",first.plusMonths(5));
        transaction(owner,broker,LedgerDtos.Kind.EXPENSE,"4.50",first.plusMonths(2),fees,"Broker fee",today);
        activity(owner,broker,missing.id(),InvestmentDtos.Kind.OPENING,"3",null,null,today);
        prices.seed(owner,stock.id(),first,today);
        for(var date=first;!date.isAfter(today);date=date.plusMonths(1)) {
            var value=new java.math.BigDecimal("100").add(new java.math.BigDecimal(java.time.temporal.ChronoUnit.MONTHS.between(first,date)).multiply(new java.math.BigDecimal("0.75")));
            nav.record(owner,fund.id(),new MarketDtos.NavInput(UUID.randomUUID(),broker,date,value.toPlainString(),"Fictional demo NAV"));
        }
        nav.record(owner,fund.id(),new MarketDtos.NavInput(UUID.randomUUID(),broker,today,"109.25","Fictional demo NAV"));
        accounts.setActive(owner,archived,"\"0\"",false);
        // An uncategorized and a future-dated entry make correction/scheduling behavior discoverable.
        transaction(owner,wallet,LedgerDtos.Kind.EXPENSE,"12",today,null,"Uncategorized example",today);
        ledger.transaction(owner,null,null,new LedgerDtos.TransactionInput(checking,LedgerDtos.Kind.EXPENSE,"59.90",today.plusDays(7),null,"Fictional provider","Scheduled internet bill","Synthetic demonstration only."));
    }
    private UUID account(UUID owner,String name,AccountType type,String currency,String amount,LocalDate date) {
        return accounts.create(owner,new AccountDtos.CreateAccount(name,type,"Fictional Demo Bank",currency,amount,type==AccountType.CREDIT_CARD?AccountDtos.BalanceMeaning.AMOUNT_OWED:AccountDtos.BalanceMeaning.BALANCE,date)).id();
    }
    private UUID category(UUID owner,String name,CategoryDtos.Type type,UUID parent) {return categories.create(owner,new CategoryDtos.Input(name,type,parent)).id();}
    private ExpectedDtos.Definition definition(UUID owner,String name,ExpectedDtos.Kind kind,UUID account,UUID destination,UUID category,String amount,int day,LocalDate first) {
        return expected.save(owner,null,null,new ExpectedDtos.Input(name,kind,account,destination,category,amount,day,first,null,"Fictional provider","Synthetic demonstration only."));
    }
    private void match(UUID owner,ExpectedDtos.Definition definition,LocalDate month,LedgerDtos.Operation actual) {
        if(actual!=null)expected.reconcile(owner,definition.id(),month,"\"0\"",new ExpectedDtos.Reconcile(definition.version(),actual.id(),actual.version(),false));
    }
    private LedgerDtos.Operation transaction(UUID owner,UUID account,LedgerDtos.Kind kind,String amount,LocalDate date,UUID category,String description,LocalDate today) {
        if(date.isAfter(today))return null;
        return ledger.transaction(owner,null,null,new LedgerDtos.TransactionInput(account,kind,amount,date,null,"Fictional provider","Synthetic "+description,"Synthetic demonstration only.",category));
    }
    private void activity(UUID owner,UUID account,UUID security,InvestmentDtos.Kind kind,String quantity,String price,String cash,LocalDate date) {
        var input=new InvestmentDtos.Input(UUID.randomUUID(),account,security,kind,quantity,price,date,kind==InvestmentDtos.Kind.OPENING?null:date,null,cash,null,kind==InvestmentDtos.Kind.OPENING,List.of(),"Synthetic trade","Synthetic demonstration only.",true,null);
        var preview=investments.preview(owner,input);
        if(!preview.errors().isEmpty()) throw new IllegalStateException("Synthetic investment fixture is invalid.");
        investments.commit(owner,new InvestmentDtos.Commit(input,preview.token(),true));
    }
}
