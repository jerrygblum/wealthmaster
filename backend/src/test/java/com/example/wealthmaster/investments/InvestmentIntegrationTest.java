package com.example.wealthmaster.investments;
import static com.example.wealthmaster.investments.InvestmentDtos.*;
import com.example.wealthmaster.budgets.*;
import static com.example.wealthmaster.budgets.CategoryDtos.*;
import com.example.wealthmaster.networth.NetWorthService;
import com.example.wealthmaster.ledger.LedgerService;
import com.example.wealthmaster.accounts.*;
import java.util.UUID;
import java.util.List;
import java.time.LocalDate;
import static com.example.wealthmaster.ledger.LedgerDtos.*;

import com.example.wealthmaster.users.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.AfterAll;
import org.testcontainers.DockerClientFactory;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ActiveProfiles("dev")
@SpringBootTest(properties = {"app.initial-owner.email=owner@example.test", "app.initial-owner.password=synthetic-password",
        "app.mfa.encryption-password=synthetic-test-encryption-password-only",
        "app.mfa.encryption-salt=0123456789abcdef0123456789abcdef"})
class InvestmentIntegrationTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean com.example.wealthmaster.marketdata.MarketProvider marketProvider;
    @Autowired com.example.wealthmaster.marketdata.MarketDataService marketData;
    @Autowired com.example.wealthmaster.marketdata.MarketQuoteStore quoteStore;
    @Autowired com.example.wealthmaster.marketdata.ManualNavService manualNav;
    static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18-alpine");
    @BeforeAll static void startDatabase() {
        if (System.getProperty("test.database.url") == null) {
            assumeTrue(DockerClientFactory.instance().isDockerAvailable(), "Docker or an explicit disposable test.database.url is required");
            postgres.start();
        }
    }
    @AfterAll static void stopDatabase() {
        if (postgres.isRunning()) postgres.stop();
    }
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getProperty("test.database.url", postgres.isRunning() ? postgres.getJdbcUrl() : ""));
        registry.add("spring.datasource.username", () -> System.getProperty("test.database.username", postgres.getUsername()));
        registry.add("spring.datasource.password", () -> System.getProperty("test.database.password", postgres.getPassword()));
    }
    @Autowired WebApplicationContext context;
    @Autowired UserRepository users;
    @Autowired AccountRepository accounts;
    @Autowired PasswordEncoder encoder;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    MockMvc mvc;
    @BeforeEach void setup() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        jdbc.execute("TRUNCATE investment_sale_allocations,investment_lots,investment_activities,investment_securities,ledger_category_history,ledger_account_history,ledger_movements,ledger_operations,expected_occurrences,expected_account_history,expected_category_history,expected_transactions,import_operation_links,import_batches CASCADE");
        jdbc.update("DELETE FROM audit_events"); jdbc.update("DELETE FROM ledger_category_history"); jdbc.update("DELETE FROM ledger_account_history"); jdbc.update("DELETE FROM ledger_movements"); jdbc.update("DELETE FROM ledger_operations"); accounts.deleteAll();
        jdbc.update("DELETE FROM categories WHERE parent_id IS NOT NULL"); jdbc.update("DELETE FROM categories"); jdbc.update("DELETE FROM category_owner_state");
    }
    String csrf(MockHttpSession session) throws Exception {
        var result = mvc.perform(get("/api/v1/auth/csrf").session(session)).andReturn();
        return mapper.readTree(result.getResponse().getContentAsString()).get("token").asString();
    }
    MockHttpSession login(String email) throws Exception {
        var session = new MockHttpSession();
        mvc.perform(post("/api/v1/auth/login").session(session).header("X-CSRF-TOKEN", csrf(session))
                .param("email", email).param("password", "synthetic-password")).andExpect(status().isOk());
        return session;
    }
    @Autowired CategoryService categories;
    @Autowired InvestmentService investments;
    @Autowired LedgerService ledger;
    @Autowired NetWorthService netWorth;
    @Autowired AccountService accountService;
    UUID owner() { return users.findByEmail("owner@example.test").orElseThrow().getId(); }
    FinancialAccount account() { return accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic cash",AccountType.CASH,null,"CHF",new BigDecimal("100"),LocalDate.of(2020,1,1))); }
    Security security() {return investments.createSecurity(owner(),new SecurityInput("Synthetic stock","SYN","NASDAQ",null,"STOCK","USD"));}
    FinancialAccount broker(String name,String cash) {return accounts.saveAndFlush(new FinancialAccount(owner(),name,AccountType.INVESTMENT,null,"CHF",new BigDecimal(cash),LocalDate.of(2020,1,1)));}
    InvestmentDtos.Input input(UUID account,UUID security,InvestmentDtos.Kind kind,String qty,String price,String settlement,LocalDate date) {
        return new InvestmentDtos.Input(UUID.randomUUID(),account,security,kind,qty,price,date,kind==InvestmentDtos.Kind.OPENING?null:date,null,settlement,null,kind==InvestmentDtos.Kind.OPENING,List.of(),"Synthetic reference","Synthetic notes",true,null);
    }
    InvestmentDtos.Activity save(InvestmentDtos.Input input) {var preview=investments.preview(owner(),input);assertTrue(preview.errors().isEmpty(),preview.errors().toString());return investments.commit(owner(),new Commit(input,preview.token(),true));}
    @Test void openingHoldingsPreserveUnknownCostsCashAndSeparateAccounts() {
        var s=security();var a=broker("Synthetic first","1000");var b=broker("Synthetic second","200");
        save(input(a.getId(),s.id(),InvestmentDtos.Kind.OPENING,"1.123456789012",null,null,ledger.today()));save(input(b.getId(),s.id(),InvestmentDtos.Kind.OPENING,"2",null,null,ledger.today()));
        var view=investments.view(owner(),a.getId());assertEquals("1000",view.cashBalance());assertEquals("1.123456789012",view.holdings().getFirst().quantity());assertFalse(view.holdings().getFirst().costComplete());assertNull(view.holdings().getFirst().averageCost());
        assertEquals("2",investments.view(owner(),b.getId()).holdings().getFirst().quantity());assertEquals(2,netWorth.current(owner()).unvaluedHoldings());assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));
        assertEquals(409,assertThrows(AccountFailure.class,()->accountService.delete(owner(),a.getId(),"\"0\"")).status());
    }
    @Test void purchasesDebitActualChfOnceAndSalesAllocateExactRemainingCost() {
        var a=broker("Synthetic broker","1000");var s=security();var buyInput=input(a.getId(),s.id(),InvestmentDtos.Kind.BUY,"10","50","455",ledger.today());var buy=save(buyInput);
        assertEquals(buy.id(),investments.commit(owner(),new Commit(buyInput,"retry-token",true)).id());
        assertEquals("545",investments.view(owner(),a.getId()).cashBalance());assertEquals("455",investments.view(owner(),a.getId()).holdings().getFirst().knownCost());
        var op=ledger.list(owner(),a.getId(),0).items().getFirst();assertEquals(com.example.wealthmaster.ledger.LedgerDtos.Kind.INVESTMENT_BUY,op.kind());assertEquals(buy.id(),op.investmentActivityId());assertEquals(409,assertThrows(AccountFailure.class,()->ledger.delete(owner(),op.id(),"\"0\"",false)).status());
        var sell=save(input(a.getId(),s.id(),InvestmentDtos.Kind.SELL,"3","60","160",ledger.today()));assertEquals("136.5",sell.allocations().getFirst().cashCost());
        var holding=investments.view(owner(),a.getId()).holdings().getFirst();assertEquals("7",holding.quantity());assertEquals("318.5",holding.knownCost());assertEquals("705",investments.view(owner(),a.getId()).cashBalance());assertFalse(investments.reversalPreview(owner(),buy.id()).errors().isEmpty());
        var reverse=investments.reversalPreview(owner(),sell.id());investments.reverse(owner(),sell.id(),new Reversal(sell.version(),reverse.token(),true));assertEquals("10",investments.view(owner(),a.getId()).holdings().getFirst().quantity());assertEquals("545",investments.view(owner(),a.getId()).cashBalance());
        reverse=investments.reversalPreview(owner(),buy.id());investments.reverse(owner(),buy.id(),new Reversal(buy.version(),reverse.token(),true));assertTrue(investments.view(owner(),a.getId()).holdings().isEmpty());assertEquals("1000",investments.view(owner(),a.getId()).cashBalance());
    }
    @Test void rejectsOversellingInsufficientCashAndChangedPreviewWithoutPartialWrites() {
        var a=broker("Synthetic broker","100");var s=security();assertFalse(investments.preview(owner(),input(a.getId(),s.id(),InvestmentDtos.Kind.BUY,"10","50","455",ledger.today())).errors().isEmpty());save(input(a.getId(),s.id(),InvestmentDtos.Kind.OPENING,"10",null,null,ledger.today()));
        var sell=input(a.getId(),s.id(),InvestmentDtos.Kind.SELL,"6","1","6",ledger.today());var old=investments.preview(owner(),sell);save(input(a.getId(),s.id(),InvestmentDtos.Kind.SELL,"5","1","5",ledger.today()));
        assertEquals(412,assertThrows(AccountFailure.class,()->investments.commit(owner(),new Commit(sell,old.token(),true))).status());assertFalse(investments.preview(owner(),sell).errors().isEmpty());assertEquals("5",investments.view(owner(),a.getId()).holdings().getFirst().quantity());
    }
    @Test void incomingFundingChangesInvalidateTradePreviews() {
        var a=broker("Synthetic broker","1000");var source=account();var s=security();
        var buy=input(a.getId(),s.id(),InvestmentDtos.Kind.BUY,"1","50","45",ledger.today());
        var reviewed=investments.preview(owner(),buy);
        var funding=ledger.transfer(owner(),null,null,new TransferInput(source.getId(),a.getId(),"50",ledger.today(),"Synthetic funding",null));
        assertEquals(412,assertThrows(AccountFailure.class,()->investments.commit(owner(),new Commit(buy,reviewed.token(),true))).status());
        var current=investments.preview(owner(),buy);
        ledger.delete(owner(),funding.id(),"\"0\"",true);
        assertEquals(412,assertThrows(AccountFailure.class,()->investments.commit(owner(),new Commit(buy,current.token(),true))).status());
        assertTrue(investments.view(owner(),a.getId()).holdings().isEmpty());
    }
    @Test void futureAndBackdatedActivityCannotConsumeUnavailableOrReservedLots() {
        var a=broker("Synthetic broker","1000");var s=security();var tomorrow=ledger.today().plusDays(1);save(input(a.getId(),s.id(),InvestmentDtos.Kind.OPENING,"5",null,null,ledger.today()));save(input(a.getId(),s.id(),InvestmentDtos.Kind.BUY,"5","1","5",tomorrow));assertEquals("5",investments.view(owner(),a.getId()).holdings().getFirst().quantity());save(input(a.getId(),s.id(),InvestmentDtos.Kind.SELL,"5","1","5",tomorrow));
        assertFalse(investments.preview(owner(),input(a.getId(),s.id(),InvestmentDtos.Kind.SELL,"1","1","1",ledger.today())).errors().isEmpty());assertFalse(investments.preview(owner(),input(a.getId(),s.id(),InvestmentDtos.Kind.SELL,"1","1","1",ledger.today().minusDays(1))).errors().isEmpty());
    }
    @Test void exactCostRoundingResidualsConserveTheOriginalAcquisitionCost() {
        var a=broker("Synthetic broker","1000");var s=security();save(input(a.getId(),s.id(),InvestmentDtos.Kind.BUY,"3","1","1",ledger.today()));BigDecimal allocated=BigDecimal.ZERO;
        for(int n=0;n<3;n++)allocated=allocated.add(new BigDecimal(save(input(a.getId(),s.id(),InvestmentDtos.Kind.SELL,"1","1","1",ledger.today())).allocations().getFirst().cashCost()));assertEquals(0,BigDecimal.ONE.compareTo(allocated));assertTrue(investments.view(owner(),a.getId()).holdings().isEmpty());
    }
    @Test void ownershipArchivedAccountsAndAuditFailureAreEnforced() throws Exception {
        var a=broker("Synthetic broker","1000");var s=security();var buy=input(a.getId(),s.id(),InvestmentDtos.Kind.BUY,"1","50","45",ledger.today());mvc.perform(get("/api/v1/investments/accounts/"+a.getId())).andExpect(status().isUnauthorized());var session=login("owner@example.test");
        mvc.perform(post("/api/v1/investments/preview").session(session).contentType("application/json").content(mapper.writeValueAsString(buy))).andExpect(status().isForbidden());mvc.perform(post("/api/v1/investments/preview").session(session).header("X-CSRF-TOKEN",csrf(session)).contentType("application/json").content(mapper.writeValueAsString(buy))).andExpect(status().isOk());
        var other=users.findByEmail("investment.other@example.test").orElseGet(()->users.save(new AppUser("investment.other@example.test",encoder.encode("synthetic-password"))));assertEquals(404,assertThrows(AccountFailure.class,()->investments.view(other.getId(),a.getId())).status());
        var foreign=investments.createSecurity(other.getId(),new SecurityInput("Foreign synthetic","OTHER","NASDAQ",null,"STOCK","USD"));assertEquals(404,assertThrows(AccountFailure.class,()->investments.preview(owner(),input(a.getId(),foreign.id(),InvestmentDtos.Kind.OPENING,"1",null,null,ledger.today()))).status());
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT synthetic_investment_failure CHECK(event_type<>'INVESTMENT_CREATED') NOT VALID");try {assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->save(buy));assertTrue(investments.view(owner(),a.getId()).holdings().isEmpty());assertEquals("1000",investments.view(owner(),a.getId()).cashBalance());}finally {jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT synthetic_investment_failure");}
        save(buy);accountService.setActive(owner(),a.getId(),"\"0\"",false);assertEquals(0,netWorth.current(owner()).unvaluedHoldings());assertFalse(investments.view(owner(),a.getId()).active());assertEquals(409,assertThrows(AccountFailure.class,()->investments.preview(owner(),input(a.getId(),s.id(),InvestmentDtos.Kind.OPENING,"1",null,null,ledger.today()))).status());
    }
    @Test void concurrentRepeatedSubmissionsReturnOneReceipt() throws Exception {
        var a=broker("Synthetic broker","1000");var s=security();save(input(a.getId(),s.id(),InvestmentDtos.Kind.OPENING,"10",null,null,ledger.today()));var input=input(a.getId(),s.id(),InvestmentDtos.Kind.SELL,"6","1","6",ledger.today());var preview=investments.preview(owner(),input);var owner=owner();
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {var gate=new java.util.concurrent.CountDownLatch(1);java.util.concurrent.Callable<UUID> submit=()->{gate.await();return investments.commit(owner,new Commit(input,preview.token(),true)).id();};var first=executor.submit(submit);var second=executor.submit(submit);gate.countDown();assertEquals(first.get(),second.get());}assertEquals("4",investments.view(owner(),a.getId()).holdings().getFirst().quantity());
    }
    @Test void concurrentDifferentSalesCannotConsumeTheSameShares() throws Exception {
        var a=broker("Synthetic broker","1000");var s=security();save(input(a.getId(),s.id(),InvestmentDtos.Kind.OPENING,"10",null,null,ledger.today()));
        var firstInput=input(a.getId(),s.id(),InvestmentDtos.Kind.SELL,"6","1","6",ledger.today());var secondInput=input(a.getId(),s.id(),InvestmentDtos.Kind.SELL,"6","1","6",ledger.today());
        var firstPreview=investments.preview(owner(),firstInput);var secondPreview=investments.preview(owner(),secondInput);var owner=owner();
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var gate=new java.util.concurrent.CountDownLatch(1);
            java.util.function.BiFunction<InvestmentDtos.Input,Preview,Boolean> submit=(in,preview)->{try{gate.await();investments.commit(owner,new Commit(in,preview.token(),true));return true;}catch(AccountFailure e){assertEquals(412,e.status());return false;}catch(InterruptedException e){throw new IllegalStateException(e);}};
            var first=executor.submit(()->submit.apply(firstInput,firstPreview));var second=executor.submit(()->submit.apply(secondInput,secondPreview));gate.countDown();assertNotEquals(first.get(),second.get());
        }
        assertEquals("4",investments.view(owner(),a.getId()).holdings().getFirst().quantity());assertEquals("1006",investments.view(owner(),a.getId()).cashBalance());
    }
    @Test void feesAreRecordedOnceAndLinkedCashCannotBeReclassifiedAsSpending() {
        var a=broker("Synthetic broker","1000");var s=security();var ordinary=input(a.getId(),s.id(),InvestmentDtos.Kind.BUY,"10","50","455",ledger.today());
        var charged=new InvestmentDtos.Input(ordinary.requestId(),ordinary.accountId(),ordinary.securityId(),ordinary.kind(),ordinary.quantity(),ordinary.unitPrice(),ordinary.tradeDate(),ordinary.cashDate(),null,ordinary.settlement(),null,false,List.of(new Charge("FEE","5","CHF"),new Charge("TAX","1","USD")),"Synthetic fees","Already included in 455 CHF",true,null);
        var activity=save(charged);assertEquals(2,activity.charges().size());assertEquals("500",activity.gross());assertEquals("545",investments.view(owner(),a.getId()).cashBalance());
        var op=ledger.list(owner(),a.getId(),0).items().getFirst();
        assertEquals(409,assertThrows(AccountFailure.class,()->ledger.transaction(owner(),op.id(),"\"0\"",new TransactionInput(a.getId(),com.example.wealthmaster.ledger.LedgerDtos.Kind.EXPENSE,"455",ledger.today(),null,null,"Synthetic reclassification",null,null))).status());
    }
    @Test void settlementDatesAreIndependentAndSaleAllocationsCanBeExplicitlyReviewed() {
        var a=broker("Synthetic broker","1000");var s=security();save(input(a.getId(),s.id(),InvestmentDtos.Kind.OPENING,"5",null,null,ledger.today().minusDays(1)));
        var buy=input(a.getId(),s.id(),InvestmentDtos.Kind.BUY,"2","10","18",ledger.today());
        buy=new InvestmentDtos.Input(buy.requestId(),buy.accountId(),buy.securityId(),buy.kind(),buy.quantity(),buy.unitPrice(),buy.tradeDate(),ledger.today().plusDays(2),null,buy.settlement(),null,false,List.of(),"Synthetic unsettled trade","",true,null);
        var bought=save(buy);assertEquals("1000",investments.view(owner(),a.getId()).cashBalance());assertEquals("7",investments.view(owner(),a.getId()).holdings().getFirst().quantity());
        var sell=input(a.getId(),s.id(),InvestmentDtos.Kind.SELL,"1","11","10",ledger.today());
        sell=new InvestmentDtos.Input(sell.requestId(),sell.accountId(),sell.securityId(),sell.kind(),sell.quantity(),sell.unitPrice(),sell.tradeDate(),sell.cashDate(),null,sell.settlement(),null,false,List.of(),"Synthetic selected lot","",true,List.of(new AllocationInput(bought.id(),"1")));
        var sold=save(sell);assertEquals(bought.id(),sold.allocations().getFirst().lotId());assertEquals("9",sold.allocations().getFirst().cashCost());
        var holding=investments.view(owner(),a.getId()).holdings().getFirst();assertFalse(holding.costComplete());assertNull(holding.averageCost());
    }
    private com.example.wealthmaster.marketdata.MarketDtos.Quote quote(String symbol,String currency,String price) {
        var now=java.time.Instant.now().minusSeconds(60);
        return new com.example.wealthmaster.marketdata.MarketDtos.Quote(symbol,"Synthetic listing","SYNTHETIC","STOCK",currency,price,"99",now,List.of(new com.example.wealthmaster.marketdata.MarketDtos.Point(now.minusSeconds(86400),"99"),new com.example.wealthmaster.marketdata.MarketDtos.Point(now,price)));
    }
    @Test void pricedHoldingsAndFxContributeOnceToAccountAndNetWorthWhileFeesRemainSpending() {
        var a=broker("Synthetic valued broker","1000");var s=security();save(input(a.getId(),s.id(),InvestmentDtos.Kind.OPENING,"2.5",null,null,ledger.today()));
        quoteStore.bind(owner(),s.id(),quote("SYN","USD","100"));
        assertEquals(1,accountService.detail(owner(),a.getId()).valuation().unvaluedHoldings());
        quoteStore.save(owner(),null,"USD",quote("USDCHF=X","CHF","0.9"));
        var valued=accountService.detail(owner(),a.getId());assertEquals("1000.00000000",valued.currentBalance());assertEquals("225",valued.valuation().holdingsValue());assertEquals("1225",valued.valuation().totalValue());assertEquals("1225",netWorth.current(owner()).accounts().getFirst().currentBalance());assertEquals(0,netWorth.current(owner()).unvaluedHoldings());
        ledger.transaction(owner(),null,null,new TransactionInput(a.getId(),com.example.wealthmaster.ledger.LedgerDtos.Kind.EXPENSE,"5",ledger.today(),null,null,"Synthetic brokerage fee",null));
        assertEquals("1220",accountService.detail(owner(),a.getId()).valuation().totalValue());assertEquals("1220",netWorth.current(owner()).currencies().getFirst().netWorth());
        accountService.setActive(owner(),a.getId(),"\"0\"",false);assertTrue(netWorth.current(owner()).currencies().isEmpty());assertEquals("1220",accountService.detail(owner(),a.getId()).valuation().totalValue());
    }
    @Test void refreshReusesCachedQuotesAndFailuresRetainOlderValues() {
        var a=broker("Synthetic valued broker","1000");var s=security();save(input(a.getId(),s.id(),InvestmentDtos.Kind.OPENING,"2",null,null,ledger.today()));
        quoteStore.bind(owner(),s.id(),quote("SYN","USD","100"));
        org.mockito.Mockito.when(marketProvider.quote("USDCHF=X")).thenReturn(quote("USDCHF=X","CHF","0.9"));
        marketData.refresh(owner(),a.getId());marketData.refresh(owner(),a.getId());
        org.mockito.Mockito.verify(marketProvider,org.mockito.Mockito.times(1)).quote("USDCHF=X");
        org.mockito.Mockito.verify(marketProvider,org.mockito.Mockito.never()).quote("SYN");
        assertEquals("1180",accountService.detail(owner(),a.getId()).valuation().totalValue());
        jdbc.update("UPDATE market_quotes SET fetched_at=CURRENT_TIMESTAMP-INTERVAL '2 days'");
        org.mockito.Mockito.when(marketProvider.quote("SYN")).thenThrow(new AccountFailure(502,"Synthetic unavailable source"));
        assertFalse(marketData.refresh(owner(),a.getId()).messages().isEmpty());
        var value=accountService.detail(owner(),a.getId()).valuation();assertTrue(value.stale());assertEquals("1180",value.totalValue());
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM market_quotes",Integer.class));
    }
    @Test void listingChangesPreserveQuoteHistoryAndCannotCrossOwnersOrCurrencies() throws Exception {
        var a=broker("Synthetic valued broker","1000");var s=security();save(input(a.getId(),s.id(),InvestmentDtos.Kind.OPENING,"1",null,null,ledger.today()));
        quoteStore.bind(owner(),s.id(),quote("SYN","USD","100"));
        quoteStore.bind(owner(),s.id(),quote("SYN2","USD","200"));
        quoteStore.save(owner(),null,"USD",quote("USDCHF=X","CHF","0.9"));
        assertEquals("1180",accountService.detail(owner(),a.getId()).valuation().totalValue());assertEquals(3,jdbc.queryForObject("SELECT count(*) FROM market_quotes",Integer.class));
        assertThrows(IllegalArgumentException.class,()->quoteStore.bind(owner(),s.id(),quote("WRONG","EUR","300")));
        assertEquals(404,assertThrows(AccountFailure.class,()->marketData.bind(UUID.randomUUID(),s.id(),"SYN")).status());
        assertEquals(404,assertThrows(AccountFailure.class,()->marketData.refresh(UUID.randomUUID(),a.getId())).status());
        mvc.perform(get("/api/v1/market-data/search").param("q","synthetic")).andExpect(status().isUnauthorized());
        var session=login("owner@example.test");mvc.perform(post("/api/v1/market-data/accounts/"+a.getId()+"/refresh").session(session)).andExpect(status().isForbidden());
    }
    @Test void marketLookupCreatesOnlyOwnedStockListingsAndRetainsQuoteMetadata() {
        org.mockito.Mockito.when(marketProvider.quote("SYN")).thenReturn(quote("SYN","USD","100"));
        var s=marketData.create(owner(),"SYN");assertEquals("USD",s.currency());assertEquals("Synthetic listing",s.name());
        assertEquals(s.id(),marketData.create(owner(),"SYN").id());
        assertEquals("SYN",jdbc.queryForObject("SELECT market_symbol FROM investment_securities WHERE id=?",String.class,s.id()));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM market_quotes",Integer.class));
        assertEquals("YAHOO",jdbc.queryForObject("SELECT source FROM market_quotes",String.class));
    }

    Security fund() {return investments.createSecurity(owner(),new SecurityInput("Synthetic Swiss fund","CH0000000007","NAV","CH0000000007","FUND","CHF"));}
    com.example.wealthmaster.marketdata.MarketDtos.NavInput navInput(UUID account,String value,LocalDate day) {
        return new com.example.wealthmaster.marketdata.MarketDtos.NavInput(UUID.randomUUID(),account,day,value,"Synthetic published NAV reference");
    }
    @Test void fundNavDatesCorrectionsAndHistoryValueUnitsWithoutChangingCash() {
        var a=broker("Synthetic fund broker","1000");var f=fund();save(input(a.getId(),f.id(),InvestmentDtos.Kind.OPENING,"2.5",null,null,ledger.today()));
        var day=ledger.today().minusDays(1);var first=navInput(a.getId(),"100.123456789012",day);
        var receipt=manualNav.record(owner(),f.id(),first);assertEquals(receipt.id(),manualNav.record(owner(),f.id(),first).id());
        var value=accountService.detail(owner(),a.getId()).valuation();assertEquals("1250.30864197",value.totalValue());assertEquals(0,value.unvaluedHoldings());assertEquals(day,value.holdings().getFirst().navDate());assertNull(value.holdings().getFirst().quotedAt());assertEquals("MANUAL_NAV",value.holdings().getFirst().source());
        assertEquals("1000",investments.view(owner(),a.getId()).cashBalance());assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));
        manualNav.record(owner(),f.id(),navInput(a.getId(),"90",day.minusDays(1)));
        assertEquals("1250.30864197",accountService.detail(owner(),a.getId()).valuation().totalValue());
        manualNav.record(owner(),f.id(),navInput(a.getId(),"110",day));value=accountService.detail(owner(),a.getId()).valuation();
        assertEquals("1275",value.totalValue());assertEquals("90",value.holdings().getFirst().previousClose());assertEquals(2,value.holdings().getFirst().navHistory().size());assertEquals("110",value.holdings().getFirst().navHistory().getLast().nav());
        assertEquals(3,manualNav.history(owner(),f.id()).size());assertEquals("1275",netWorth.current(owner()).accounts().getFirst().currentBalance());
        assertEquals(3,jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='FUND_NAV_RECORDED'",Integer.class));
        var changed=new com.example.wealthmaster.marketdata.MarketDtos.NavInput(first.requestId(),first.accountId(),first.date(),"200",first.reference());assertEquals(409,assertThrows(AccountFailure.class,()->manualNav.record(owner(),f.id(),changed)).status());
    }
    @Test void navIsSharedAcrossOwnedAccountsButArchivedAccountsCannotRecordIt() {
        var a=broker("Synthetic fund first","100");var b=broker("Synthetic fund second","200");var f=fund();
        save(input(a.getId(),f.id(),InvestmentDtos.Kind.OPENING,"2",null,null,ledger.today()));save(input(b.getId(),f.id(),InvestmentDtos.Kind.OPENING,"3",null,null,ledger.today()));
        manualNav.record(owner(),f.id(),navInput(a.getId(),"10",ledger.today().minusDays(8)));
        assertEquals("120",accountService.detail(owner(),a.getId()).valuation().totalValue());assertEquals("230",accountService.detail(owner(),b.getId()).valuation().totalValue());assertTrue(accountService.detail(owner(),a.getId()).valuation().stale());
        accountService.setActive(owner(),a.getId(),"\"0\"",false);assertEquals("230",netWorth.current(owner()).currencies().getFirst().netWorth());
        assertEquals(409,assertThrows(AccountFailure.class,()->manualNav.record(owner(),f.id(),navInput(a.getId(),"11",ledger.today()))).status());assertEquals(1,manualNav.history(owner(),f.id()).size());
        org.mockito.Mockito.clearInvocations(marketProvider);marketData.refresh(owner(),b.getId());org.mockito.Mockito.verifyNoInteractions(marketProvider);
        manualNav.record(owner(),f.id(),navInput(b.getId(),"11",ledger.today()));assertEquals("122",accountService.detail(owner(),a.getId()).valuation().totalValue());
    }
    @Test void navValidationOwnershipAndAuditRollbackPreservePreviousValues() throws Exception {
        var a=broker("Synthetic fund broker","1000");var f=fund();save(input(a.getId(),f.id(),InvestmentDtos.Kind.OPENING,"1",null,null,ledger.today()));
        assertThrows(IllegalArgumentException.class,()->manualNav.record(owner(),f.id(),navInput(a.getId(),"10",ledger.today().plusDays(1))));
        for(var value:List.of("0","-1","1e2","1.1234567890123"))assertThrows(IllegalArgumentException.class,()->manualNav.record(owner(),f.id(),navInput(a.getId(),value,ledger.today())));
        assertThrows(IllegalArgumentException.class,()->investments.createSecurity(owner(),new SecurityInput("Synthetic invalid fund","CH0000000008","NAV","CH0000000008","FUND","CHF")));
        assertEquals(409,assertThrows(AccountFailure.class,()->investments.createSecurity(owner(),new SecurityInput("Synthetic duplicate fund","CH0000000007","NAV","CH0000000007","FUND","EUR"))).status());
        assertEquals(404,assertThrows(AccountFailure.class,()->manualNav.history(UUID.randomUUID(),f.id())).status());
        assertEquals(404,assertThrows(AccountFailure.class,()->manualNav.record(UUID.randomUUID(),f.id(),navInput(a.getId(),"10",ledger.today()))).status());
        var stock=security();assertThrows(IllegalArgumentException.class,()->manualNav.history(owner(),stock.id()));
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT synthetic_nav_failure CHECK(event_type<>'FUND_NAV_RECORDED') NOT VALID");
        try{assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->manualNav.record(owner(),f.id(),navInput(a.getId(),"10",ledger.today())));assertTrue(manualNav.history(owner(),f.id()).isEmpty());assertEquals(1,accountService.detail(owner(),a.getId()).valuation().unvaluedHoldings());}finally{jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT synthetic_nav_failure");}
        mvc.perform(get("/api/v1/market-data/securities/"+f.id()+"/nav-history")).andExpect(status().isUnauthorized());
        var session=login("owner@example.test");var nav=navInput(a.getId(),"10",ledger.today());
        mvc.perform(post("/api/v1/market-data/securities/"+f.id()+"/nav").session(session).contentType("application/json").content(mapper.writeValueAsString(nav))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/market-data/securities/"+f.id()+"/nav").session(session).header("X-CSRF-TOKEN",csrf(session)).contentType("application/json").content(mapper.writeValueAsString(nav))).andExpect(status().isCreated()).andExpect(jsonPath("$.date").value(ledger.today().toString()));
    }
    @Test void concurrentNavRetriesWriteOneAuditedEntry() throws Exception {
        var a=broker("Synthetic fund broker","1000");var f=fund();save(input(a.getId(),f.id(),InvestmentDtos.Kind.OPENING,"1",null,null,ledger.today()));var nav=navInput(a.getId(),"10",ledger.today());var owner=owner();
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)){var gate=new java.util.concurrent.CountDownLatch(1);java.util.concurrent.Callable<UUID> submit=()->{gate.await();return manualNav.record(owner,f.id(),nav).id();};var first=executor.submit(submit);var second=executor.submit(submit);gate.countDown();assertEquals(first.get(),second.get());}
        assertEquals(1,manualNav.history(owner(),f.id()).size());assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='FUND_NAV_RECORDED'",Integer.class));
    }

}
