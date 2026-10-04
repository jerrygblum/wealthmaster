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
class NetWorthIntegrationTest {
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
        jdbc.update("DELETE FROM audit_events"); jdbc.update("DELETE FROM ledger_account_history"); jdbc.update("DELETE FROM ledger_movements"); jdbc.update("DELETE FROM ledger_operations"); accounts.deleteAll();
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
    @Test void ledgerActivityCorrectionsAndTransfersFeedTheReportExactlyOnce() {
        var bank=account(AccountType.CHECKING); var card=account(AccountType.CREDIT_CARD); var investment=account(AccountType.INVESTMENT);
        var income=ledger.transaction(owner(),null,null,input(bank.getId(),Kind.INCOME,"500.12345678")); worth("500.12345678");
        ledger.transaction(owner(),null,null,input(card.getId(),Kind.EXPENSE,"100")); worth("400.12345678");
        var refund=ledger.transaction(owner(),null,null,input(card.getId(),Kind.REFUND,"10")); worth("410.12345678");
        ledger.transfer(owner(),null,null,new TransferInput(bank.getId(),card.getId(),"100",ledger.today(),"Synthetic repayment",null)); worth("410.12345678");
        ledger.transfer(owner(),null,null,new TransferInput(bank.getId(),investment.getId(),"25",ledger.today(),"Synthetic funding",null)); worth("410.12345678");
        ledger.transaction(owner(),income.id(),"\"0\"",input(bank.getId(),Kind.INCOME,"600.12345678")); worth("510.12345678");
        ledger.delete(owner(),refund.id(),"\"0\"",false); worth("500.12345678");
        accountService.setActive(owner(),investment.getId(),"\"0\"",false); worth("500.12345678");
        assertTrue(netWorth.current(owner()).accounts().stream().anyMatch(a->a.id().equals(investment.getId()) && !a.active()));
        var future=accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic future",AccountType.CASH,null,"EUR",new BigDecimal("999"),ledger.today().plusDays(10)));
        worth("500.12345678"); assertEquals(future.getId(),netWorth.current(owner()).excludedFutureAccounts().getFirst().id());
    }
    @Test void reportIsOwnerScopedReadOnlyAndUnavailableToAnonymousSessions() throws Exception {
        var a=account(AccountType.CASH);ledger.transaction(owner(),null,null,input(a.getId(),Kind.INCOME,"12.12345678"));
        var other=users.findByEmail("worth.other@example.test").orElseGet(()->users.save(new AppUser("worth.other@example.test",encoder.encode("synthetic-password"))));
        accounts.saveAndFlush(new FinancialAccount(other.getId(),"Synthetic foreign",AccountType.CASH,null,"CHF",new BigDecimal("99999"),ledger.today()));
        mvc.perform(get("/api/v1/net-worth/current")).andExpect(status().isUnauthorized());
        int audits=jdbc.queryForObject("SELECT count(*) FROM audit_events",Integer.class);
        mvc.perform(get("/api/v1/net-worth/current").session(login("owner@example.test")).param("userId",other.getId().toString()))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.currencies[0].netWorth").value("12.12345678")).andExpect(jsonPath("$.accounts.length()").value(1));
        mvc.perform(get("/api/v1/net-worth/current").session(login("worth.other@example.test")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.currencies[0].netWorth").value("99999.00000000"));
        assertEquals(audits,jdbc.queryForObject("SELECT count(*) FROM audit_events",Integer.class));
    }
    @Test void oneSnapshotPreventsMixedBalancesWhileATransferCommits() throws Exception {
        var a=accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic source",AccountType.CASH,null,"CHF",new BigDecimal("100"),LocalDate.of(2020,1,1)));
        var b=account(AccountType.INVESTMENT);var owner=owner();
        var firstRead=new java.util.concurrent.CountDownLatch(1);var committed=new java.util.concurrent.CountDownLatch(1);
        var first=new java.util.concurrent.atomic.AtomicBoolean(true);
        org.mockito.Mockito.doAnswer(invocation->{
            var amount=invocation.callRealMethod();
            if(Thread.currentThread().getName().equals("synthetic-worth-reader") && first.compareAndSet(true,false)) {
                firstRead.countDown();assertTrue(committed.await(15,java.util.concurrent.TimeUnit.SECONDS));
            }
            return amount;
        }).when(ledger).movements(org.mockito.ArgumentMatchers.any());
        try(var executor=java.util.concurrent.Executors.newSingleThreadExecutor(r->new Thread(r,"synthetic-worth-reader"))) {
            var reading=executor.submit(()->netWorth.current(owner));
            assertTrue(firstRead.await(15,java.util.concurrent.TimeUnit.SECONDS));
            try {ledger.transfer(owner,null,null,new TransferInput(a.getId(),b.getId(),"25",ledger.today(),"Synthetic concurrent transfer",null));}
            finally {committed.countDown();}
            var before=reading.get(15,java.util.concurrent.TimeUnit.SECONDS);
            assertEquals(0,new BigDecimal("100").compareTo(new BigDecimal(before.currencies().getFirst().netWorth())));
            assertEquals("0.00000000",before.accounts().stream().filter(c->c.id().equals(b.getId())).findFirst().orElseThrow().currentBalance());
            assertEquals("25.00000000",netWorth.current(owner).accounts().stream().filter(c->c.id().equals(b.getId())).findFirst().orElseThrow().currentBalance());
        }
    }
}
