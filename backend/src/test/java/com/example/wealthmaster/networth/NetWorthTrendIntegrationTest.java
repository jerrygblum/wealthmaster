package com.example.wealthmaster.networth;
import com.example.wealthmaster.ledger.LedgerService;
import com.example.wealthmaster.accounts.*;
import java.util.UUID;
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
class NetWorthTrendIntegrationTest {
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
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean LedgerService ledger;
    @Autowired NetWorthService netWorth;
    @Autowired AccountService accountService;
    UUID owner() { return users.findByEmail("owner@example.test").orElseThrow().getId(); }
    FinancialAccount account(AccountType type) { return accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic",type,null,"CHF",BigDecimal.ZERO,LocalDate.of(2020,1,1))); }
    TransactionInput input(UUID account,Kind kind,String amount) { return new TransactionInput(account,kind,amount,ledger.today(),null,"Synthetic payee","Synthetic activity",null); }
    void balance(UUID id,String value) { assertEquals(0,new BigDecimal(value).compareTo(new BigDecimal(accountService.detail(owner(),id).currentBalance()))); }
    BigDecimal worth() { return new BigDecimal(netWorth.current(owner()).currencies().getFirst().netWorth()); }
    void worth(String value) { assertEquals(0, new BigDecimal(value).compareTo(worth())); }
    @Autowired NetWorthTrendService trends;
    @Autowired com.example.wealthmaster.investments.InvestmentService investments;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean com.example.wealthmaster.marketdata.HistoricalPrices historicalPrices;
    @org.springframework.test.context.bean.override.mockito.MockitoBean com.example.wealthmaster.marketdata.MarketProvider provider;
    final LocalDate jan=LocalDate.of(2024,1,1);
    TrendDtos.Trend trend(java.util.List<UUID> ids,LocalDate start,LocalDate end) {return trends.trend(owner(),ids,start,end,TrendDtos.Bucket.MONTH);}
    FinancialAccount cash(String currency,String amount,LocalDate opening) {
        return accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic "+currency,AccountType.CASH,null,currency,new BigDecimal(amount),opening));
    }
    void transaction(FinancialAccount account,Kind kind,String amount,LocalDate date) {
        ledger.transaction(owner(),null,null,new TransactionInput(account.getId(),kind,amount,date,null,null,"Synthetic trend",null));
    }
    com.example.wealthmaster.investments.InvestmentDtos.Activity activity(UUID account,UUID security,com.example.wealthmaster.investments.InvestmentDtos.Kind kind,String qty,String cash,LocalDate trade,LocalDate booked) {
        var input=new com.example.wealthmaster.investments.InvestmentDtos.Input(UUID.randomUUID(),account,security,kind,qty,kind==com.example.wealthmaster.investments.InvestmentDtos.Kind.OPENING?null:"10",trade,booked,null,cash,null,kind==com.example.wealthmaster.investments.InvestmentDtos.Kind.OPENING,java.util.List.of(),null,null,true,null);
        var preview=investments.preview(owner(),input);assertTrue(preview.errors().isEmpty(),preview.errors().toString());
        return investments.commit(owner(),new com.example.wealthmaster.investments.InvestmentDtos.Commit(input,preview.token(),true));
    }
    void quote(UUID security,String symbol,String base,String currency,String price,String at,String series) {
        jdbc.update("INSERT INTO market_quotes(id,owner_id,security_id,symbol,base_currency,quote_currency,price,quoted_at,fetched_at,source,series) VALUES (?,?,?,?,?,?,?,? ,CURRENT_TIMESTAMP,'SYNTHETIC',CAST(? AS jsonb))",
            UUID.randomUUID(),owner(),security,symbol,base,currency,new BigDecimal(price),java.sql.Timestamp.from(java.time.Instant.parse(at)),series);
    }
    @Test void exactCashHistoryTransfersCorrectionsArchivesAndCurrencies() {
        var bank=cash("CHF","100.12345678",jan.plusDays(14));var card=cash("CHF","-20",jan);var euro=cash("EUR","5",jan);var future=cash("CHF","999",jan.plusMonths(2));
        transaction(bank,Kind.INCOME,"10",jan.minusDays(2)); // opening date is not a movement cutoff
        ledger.transfer(owner(),null,null,new TransferInput(bank.getId(),card.getId(),"25",jan.plusDays(20),"Synthetic transfer",null));
        var edit=ledger.transaction(owner(),null,null,new TransactionInput(bank.getId(),Kind.EXPENSE,"7",jan.plusMonths(1),null,null,"Synthetic editable",null));
        transaction(bank,Kind.EXPENSE,"999",ledger.today().plusDays(1));
        accountService.setActive(owner(),card.getId(),"\"0\"",false);
        var result=trend(java.util.List.of(bank.getId(),card.getId(),euro.getId(),future.getId()),jan,jan.plusMonths(2).minusDays(1));
        assertEquals("90.12345678",result.points().getFirst().currencies().getFirst().value());
        assertEquals("83.12345678",result.points().getLast().currencies().getFirst().value());
        assertEquals("5",result.points().getFirst().currencies().getLast().value());
        assertFalse(result.points().getFirst().accounts().stream().filter(a->a.accountId().equals(future.getId())).findFirst().orElseThrow().opened());
        var beforeOpening=trends.trend(owner(),java.util.List.of(bank.getId()),jan,jan.plusDays(10),TrendDtos.Bucket.DAY);
        assertNull(beforeOpening.points().getFirst().currencies().getFirst().value());
        ledger.delete(owner(),edit.id(),"\"0\"",false);
        assertEquals("90.12345678",trend(java.util.List.of(bank.getId(),card.getId()),jan,jan.plusMonths(2).minusDays(1)).points().getLast().currencies().getFirst().value());
        accountService.update(owner(),bank.getId(),"\"0\"",new AccountDtos.CreateAccount("Synthetic corrected opening",AccountType.CASH,null,"CHF","100.12345678",AccountDtos.BalanceMeaning.BALANCE,jan.plusDays(4)));
        assertEquals("110.12345678",trends.trend(owner(),java.util.List.of(bank.getId()),jan.plusDays(9),jan.plusDays(9),TrendDtos.Bucket.DAY).points().getFirst().currencies().getFirst().value());
        org.mockito.Mockito.verifyNoInteractions(provider);
    }
    @Test void historicalSeriesFxAndSeparateCashDatesNeverUseLaterPrices() {
        var broker=accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic broker",AccountType.INVESTMENT,null,"CHF",new BigDecimal("1000"),jan));
        var security=investments.createSecurity(owner(),new com.example.wealthmaster.investments.InvestmentDtos.SecurityInput("Synthetic stock","SYN","SYNTHETIC",null,"STOCK","USD"));
        jdbc.update("UPDATE investment_securities SET market_symbol='SYN' WHERE id=?",security.id());
        var buy=activity(broker.getId(),security.id(),com.example.wealthmaster.investments.InvestmentDtos.Kind.BUY,"2","20",jan.plusDays(15),jan.plusMonths(1));
        quote(security.id(),"SYN","USD","USD","50","2024-03-01T12:00:00Z","[{\"at\":\"2024-01-30T12:00:00Z\",\"close\":\"10\"}]");
        quote(null,"USDCHF=X","USD","CHF","0.9","2024-01-30T12:00:00Z","[]");
        var points=trend(java.util.List.of(broker.getId()),jan,jan.plusMonths(3).minusDays(1)).points();
        assertEquals("1018",points.getFirst().currencies().getFirst().value());
        assertEquals("998",points.get(1).currencies().getFirst().value());
        assertEquals("1070",points.getLast().currencies().getFirst().value());
        assertTrue(points.getLast().currencies().getFirst().stale());
        var noQuote=trends.trend(owner(),java.util.List.of(broker.getId()),jan.plusDays(15),jan.plusDays(15),TrendDtos.Bucket.DAY).points().getFirst();
        assertNull(noQuote.currencies().getFirst().value());assertEquals("1000",noQuote.currencies().getFirst().knownSubtotal());assertEquals(1,noQuote.currencies().getFirst().missingPositions());
        var reversed=investments.reversalPreview(owner(),buy.id());
        investments.reverse(owner(),buy.id(),new com.example.wealthmaster.investments.InvestmentDtos.Reversal(0,reversed.token(),true));
        assertEquals("1000",trend(java.util.List.of(broker.getId()),jan,jan.plusMonths(1).minusDays(1)).points().getFirst().currencies().getFirst().value());
        org.mockito.Mockito.verifyNoInteractions(provider);
    }
    @Test void manualNavCorrectionsAreDatedAndMissingFxKeepsTotalsIncomplete() {
        var broker=accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic fund broker",AccountType.INVESTMENT,null,"CHF",BigDecimal.ZERO,jan));
        var security=investments.createSecurity(owner(),new com.example.wealthmaster.investments.InvestmentDtos.SecurityInput("Synthetic fund","CH0000000007","NAV","CH0000000007","FUND","USD"));
        activity(broker.getId(),security.id(),com.example.wealthmaster.investments.InvestmentDtos.Kind.OPENING,"1.123456789012",null,jan,null);
        for (var nav : new String[][]{{"2024-01-15","10"},{"2024-02-15","20"},{"2024-01-15","12"}}) {
            jdbc.update("INSERT INTO market_quotes(id,owner_id,security_id,symbol,base_currency,quote_currency,price,fetched_at,source,nav_date,request_id,input_hash) VALUES (?,?,?,'NAV','USD','USD',?,CURRENT_TIMESTAMP,'MANUAL_NAV',?,?,?)",
                UUID.randomUUID(),owner(),security.id(),new BigDecimal(nav[1]),LocalDate.parse(nav[0]),UUID.randomUUID(),"synthetic");
        }
        assertNull(trend(java.util.List.of(broker.getId()),jan,jan.plusMonths(1).minusDays(1)).points().getFirst().currencies().getFirst().value());
        quote(null,"USDCHF=X","USD","CHF","0.9","2024-01-01T12:00:00Z","[]");
        var points=trend(java.util.List.of(broker.getId()),jan,jan.plusMonths(2).minusDays(1)).points();
        assertEquals("12.13333332",points.getFirst().currencies().getFirst().value());
        assertEquals("20.2222222",points.getLast().currencies().getFirst().value());
    }
    @Test void endpointAuthorizesEveryIdAndValidatesParametersWithoutWrites() throws Exception {
        var account=cash("CHF","10",jan);var session=login("owner@example.test");
        var other=users.findByEmail("trend.other@example.test").orElseGet(()->users.save(new AppUser("trend.other@example.test",encoder.encode("synthetic-password"))));
        var foreign=accounts.saveAndFlush(new FinancialAccount(other.getId(),"Synthetic foreign trend",AccountType.CASH,null,"CHF",new BigDecimal("99999"),jan));
        assertEquals(1,trends.options(owner()).accounts().size());
        assertEquals(404,assertThrows(AccountFailure.class,()->trend(java.util.List.of(account.getId(),foreign.getId()),jan,jan)).status());
        mvc.perform(get("/api/v1/net-worth/trend/options")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/net-worth/trend/options").session(session)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        mvc.perform(get("/api/v1/net-worth/trend").session(session).param("accountIds",account.getId().toString()).param("startDate","2024-01-01").param("endDate","2024-02-01").param("bucket","MONTH"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.points[0].currencies[0].value").value("10"));
        mvc.perform(get("/api/v1/net-worth/trend").session(session).param("accountIds",account.getId().toString(),UUID.randomUUID().toString()).param("startDate","2024-01-01").param("endDate","2024-02-01").param("bucket","MONTH")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/net-worth/trend").session(session).param("accountIds",account.getId().toString()).param("startDate","2024-01-01").param("endDate","2024-02-01").param("bucket","INVALID")).andExpect(status().isBadRequest());
        assertThrows(IllegalArgumentException.class,()->trends.trend(owner(),java.util.List.of(),jan,jan,TrendDtos.Bucket.DAY));
    }
    @Test void salesUseTradeDateForSharesAndCashDateForProceedsAndRespectListingChanges() {
        var broker=accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic sale broker",AccountType.INVESTMENT,null,"CHF",new BigDecimal("100"),jan));
        var security=investments.createSecurity(owner(),new com.example.wealthmaster.investments.InvestmentDtos.SecurityInput("Synthetic sale stock","SYN","SYNTHETIC",null,"STOCK","USD"));
        jdbc.update("UPDATE investment_securities SET market_symbol='SYN' WHERE id=?",security.id());
        activity(broker.getId(),security.id(),com.example.wealthmaster.investments.InvestmentDtos.Kind.OPENING,"2",null,jan,null);
        var sale=activity(broker.getId(),security.id(),com.example.wealthmaster.investments.InvestmentDtos.Kind.SELL,"1","9",jan.plusMonths(1),jan.plusMonths(2));
        quote(security.id(),"SYN","USD","USD","10","2024-01-01T12:00:00Z","[]");
        quote(null,"USDCHF=X","USD","CHF","0.9","2024-01-01T12:00:00Z","[]");
        var points=trend(java.util.List.of(broker.getId()),jan,jan.plusMonths(3).minusDays(1)).points();
        assertEquals("118",points.getFirst().currencies().getFirst().value());
        assertEquals("109",points.get(1).currencies().getFirst().value());
        assertEquals("118",points.getLast().currencies().getFirst().value());
        var preview=investments.reversalPreview(owner(),sale.id());
        investments.reverse(owner(),sale.id(),new com.example.wealthmaster.investments.InvestmentDtos.Reversal(0,preview.token(),true));
        assertEquals("118",trend(java.util.List.of(broker.getId()),jan,jan.plusMonths(2).minusDays(1)).points().getLast().currencies().getFirst().value());
        jdbc.update("UPDATE investment_securities SET market_symbol='SYN2' WHERE id=?",security.id());
        assertNull(trend(java.util.List.of(broker.getId()),jan,jan.plusMonths(1).minusDays(1)).points().getFirst().currencies().getFirst().value());
    }
    @Test void reportKeepsOneSnapshotWhenTransferCommitsBeforeQuoteRead() throws Exception {
        var a=cash("CHF","100",jan);var b=cash("CHF","0",jan);var owner=owner();
        var reached=new java.util.concurrent.CountDownLatch(1);var committed=new java.util.concurrent.CountDownLatch(1);
        org.mockito.Mockito.doAnswer(invocation->{
            if(Thread.currentThread().getName().equals("synthetic-trend-reader")) {reached.countDown();assertTrue(committed.await(15,java.util.concurrent.TimeUnit.SECONDS));}
            return invocation.callRealMethod();
        }).when(historicalPrices).load(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.anyMap());
        try(var executor=java.util.concurrent.Executors.newSingleThreadExecutor(r->new Thread(r,"synthetic-trend-reader"))) {
            var reading=executor.submit(()->trend(java.util.List.of(a.getId(),b.getId()),jan,jan.plusMonths(1).minusDays(1)));
            assertTrue(reached.await(15,java.util.concurrent.TimeUnit.SECONDS));
            try {ledger.transfer(owner,null,null,new TransferInput(a.getId(),b.getId(),"25",jan,"Synthetic concurrent",null));} finally {committed.countDown();}
            var point=reading.get(15,java.util.concurrent.TimeUnit.SECONDS).points().getFirst();
            assertEquals("100",point.currencies().getFirst().value());
            assertEquals("0",point.accounts().stream().filter(v->v.accountId().equals(b.getId())).findFirst().orElseThrow().value());
        }
    }
}
