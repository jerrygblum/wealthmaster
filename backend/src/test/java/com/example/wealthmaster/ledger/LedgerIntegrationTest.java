package com.example.wealthmaster.ledger;
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
class LedgerIntegrationTest {
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
    @Autowired LedgerService ledger;
    @Autowired AccountService accountService;
    UUID owner() { return users.findByEmail("owner@example.test").orElseThrow().getId(); }
    FinancialAccount account(AccountType type) { return accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic",type,null,"CHF",BigDecimal.ZERO,LocalDate.of(2020,1,1))); }
    TransactionInput input(UUID account,Kind kind,String amount) { return new TransactionInput(account,kind,amount,ledger.today(),null,"Synthetic payee","Synthetic activity",null); }
    void balance(UUID id,String value) { assertEquals(0,new BigDecimal(value).compareTo(new BigDecimal(accountService.detail(owner(),id).currentBalance()))); }
    @Test void historicalDatesBeforeOpeningContributeToBalances() {
        var a=account(AccountType.CASH);var b=account(AccountType.CHECKING);
        var historical=LocalDate.of(2019,1,15);
        var op=ledger.transaction(owner(),null,null,new TransactionInput(a.getId(),Kind.EXPENSE,"12",historical,historical.minusDays(1),null,"Synthetic historical expense",null));
        assertEquals(historical,op.transactionDate());assertEquals(historical.minusDays(1),op.valueDate());
        ledger.transfer(owner(),null,null,new TransferInput(a.getId(),b.getId(),"5",historical,"Synthetic historical transfer",null));
        balance(a.getId(),"-17");balance(b.getId(),"5");
        ledger.transaction(owner(),op.id(),"\"0\"",new TransactionInput(a.getId(),Kind.EXPENSE,"12",a.getOpeningDate(),null,null,"Synthetic corrected expense",null));
        balance(a.getId(),"-17");
    }
    @Test void exactIncomeExpenseRefundDeletionAndCreditCardRepayment() {
        var bank=account(AccountType.CHECKING); var card=account(AccountType.CREDIT_CARD); var investment=account(AccountType.INVESTMENT);
        ledger.transaction(owner(),null,null,input(bank.getId(),Kind.INCOME,"99999999999999999999.12345678"));
        ledger.transaction(owner(),null,null,input(card.getId(),Kind.EXPENSE,"100.12345678")); balance(card.getId(),"-100.12345678");
        var refund=ledger.transaction(owner(),null,null,input(card.getId(),Kind.REFUND,"10.12345678")); balance(card.getId(),"-90");
        ledger.transfer(owner(),null,null,new TransferInput(bank.getId(),card.getId(),"100",ledger.today(),"Synthetic repayment",null));
        balance(card.getId(),"10"); balance(bank.getId(),"99999999999999999899.12345678");
        ledger.transfer(owner(),null,null,new TransferInput(bank.getId(),investment.getId(),"0.00000001",ledger.today(),"Synthetic funding",null)); balance(investment.getId(),"0.00000001");
        ledger.delete(owner(),refund.id(),"\"0\"",false); balance(card.getId(),"-0.12345678");
        assertEquals(0,jdbc.queryForObject("SELECT SUM(m.amount) FROM ledger_movements m JOIN ledger_operations o ON o.id=m.operation_id WHERE o.kind='TRANSFER'",BigDecimal.class).signum());
    }
    @Test void accountChangesAndSoftDeletionPermanentlyRetainHistory() {
        var a=account(AccountType.CASH); var b=account(AccountType.CASH);
        var op=ledger.transaction(owner(),null,null,input(a.getId(),Kind.EXPENSE,"12")); balance(a.getId(),"-12");
        op=ledger.transaction(owner(),op.id(),"\"0\"",input(b.getId(),Kind.REFUND,"5")); balance(a.getId(),"0"); balance(b.getId(),"5");
        ledger.delete(owner(),op.id(),"\"1\"",false); balance(b.getId(),"0");
        for(var account:java.util.List.of(a,b)) {
            assertTrue(ledger.hasActivity(account.getId()));
            assertEquals(409,assertThrows(AccountFailure.class,()->accountService.delete(owner(),account.getId(),"\"0\"")).status());
            assertEquals(409,assertThrows(AccountFailure.class,()->accountService.update(owner(),account.getId(),"\"0\"",new AccountDtos.CreateAccount("Synthetic",AccountType.CASH,null,"CHF","1",AccountDtos.BalanceMeaning.BALANCE,account.getOpeningDate()))).status());
        }
    }
    @Test void pairedEditingVersionsArchivedDatesCurrencyAndOwnership() {
        var a=account(AccountType.CHECKING);var b=account(AccountType.CASH);var c=account(AccountType.INVESTMENT);
        var op=ledger.transfer(owner(),null,null,new TransferInput(a.getId(),b.getId(),"1",ledger.today(),"Synthetic transfer",null));
        var id=op.id();
        assertEquals(404,assertThrows(AccountFailure.class,()->ledger.delete(owner(),id,"\"0\"",false)).status());
        assertEquals(428,assertThrows(AccountFailure.class,()->ledger.delete(owner(),id,null,true)).status());
        assertEquals(412,assertThrows(AccountFailure.class,()->ledger.delete(owner(),id,"\"2\"",true)).status());
        assertEquals(404,assertThrows(AccountFailure.class,()->ledger.delete(UUID.randomUUID(),id,"\"0\"",true)).status());
        op=ledger.transfer(owner(),id,"\"0\"",new TransferInput(c.getId(),a.getId(),"2",ledger.today(),"Synthetic edit",null));
        balance(a.getId(),"2");balance(b.getId(),"0");balance(c.getId(),"-2");
        accountService.setActive(owner(),c.getId(),"\"0\"",false);
        assertEquals(409,assertThrows(AccountFailure.class,()->ledger.delete(owner(),id,"\"1\"",true)).status());
        assertThrows(IllegalArgumentException.class,()->ledger.transaction(owner(),null,null,new TransactionInput(a.getId(),Kind.INCOME,"1",LocalDate.of(0,1,1),null,null,"Synthetic",null)));
        var eur=accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic EUR",AccountType.CASH,null,"EUR",BigDecimal.ZERO,LocalDate.of(2020,1,1)));
        assertThrows(IllegalArgumentException.class,()->ledger.transfer(owner(),null,null,new TransferInput(a.getId(),eur.getId(),"1",ledger.today(),"Synthetic",null)));
        assertThrows(IllegalArgumentException.class,()->ledger.transfer(owner(),null,null,new TransferInput(a.getId(),a.getId(),"1",ledger.today(),"Synthetic",null)));
        assertEquals(1,ledger.list(owner(),a.getId(),0).items().size());
    }
    @Test void auditFailureRollsBackBothMovementsAndHistory() {
        var a=account(AccountType.CASH);var b=account(AccountType.CASH);
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT synthetic_reject_ledger CHECK (event_type NOT LIKE 'LEDGER_%')");
        try {
            assertThrows(Exception.class,()->ledger.transfer(owner(),null,null,new TransferInput(a.getId(),b.getId(),"1",ledger.today(),"Synthetic",null)));
            assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));
            assertFalse(ledger.hasActivity(a.getId()));balance(a.getId(),"0");balance(b.getId(),"0");
        } finally {jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT synthetic_reject_ledger");}
    }
    @Test void httpOwnershipCsrfAndVersions() throws Exception {
        var a=account(AccountType.CASH);var session=login("owner@example.test");
        String body=mapper.writeValueAsString(input(a.getId(),Kind.EXPENSE,"2"));
        mvc.perform(post("/api/v1/transactions").session(session).contentType("application/json").content(body)).andExpect(status().isForbidden());
        var response=mvc.perform(post("/api/v1/transactions").session(session).header("X-CSRF-TOKEN",csrf(session)).contentType("application/json").content(body)).andExpect(status().isCreated()).andReturn();
        var id=mapper.readTree(response.getResponse().getContentAsString()).get("id").asString();
        mvc.perform(delete("/api/v1/transactions/"+id).session(session).header("X-CSRF-TOKEN",csrf(session))).andExpect(status().is(428));
        mvc.perform(get("/api/v1/accounts/"+a.getId()).session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.currentBalance").value("-2.00000000"));
    }

    @Test void foreignEndpointsAndAccountActivityCannotBeForged() {
        var a=account(AccountType.CASH);
        var other=users.findByEmail("ledger.other@example.test").orElseGet(()->users.save(new AppUser("ledger.other@example.test",encoder.encode("synthetic-password"))));
        var foreign=accounts.saveAndFlush(new FinancialAccount(other.getId(),"Synthetic foreign",AccountType.CASH,null,"CHF",BigDecimal.ZERO,LocalDate.of(2020,1,1)));
        for(var transfer:java.util.List.of(new TransferInput(a.getId(),foreign.getId(),"1",ledger.today(),"Synthetic",null),new TransferInput(foreign.getId(),a.getId(),"1",ledger.today(),"Synthetic",null)))
            assertEquals(404,assertThrows(AccountFailure.class,()->ledger.transfer(owner(),null,null,transfer)).status());
        assertEquals(404,assertThrows(AccountFailure.class,()->ledger.transaction(owner(),null,null,input(foreign.getId(),Kind.INCOME,"1"))).status());
        assertEquals(404,assertThrows(AccountFailure.class,()->ledger.list(owner(),foreign.getId(),0)).status());
        assertEquals(404,assertThrows(AccountFailure.class,()->accountService.detail(owner(),foreign.getId())).status());
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));
    }
    @Test void paginationKeepsTransferTogetherAndOrdersByDate() {
        var a=account(AccountType.CASH);
        for(int i=0;i<51;i++) ledger.transaction(owner(),null,null,new TransactionInput(a.getId(),Kind.INCOME,"1",ledger.today().minusDays(i),null,null,"Synthetic "+i,null));
        var first=ledger.list(owner(),a.getId(),0);var last=ledger.list(owner(),a.getId(),1);
        assertEquals(50,first.items().size());assertTrue(first.hasMore());assertEquals("Synthetic 0",first.items().getFirst().description());
        assertEquals(1,last.items().size());assertFalse(last.hasMore());assertEquals("Synthetic 50",last.items().getFirst().description());
    }
    @Test void concurrentLedgerCreationAndAccountDeletionHaveOnlyOneWinner() throws Exception {
        var a=account(AccountType.CASH);var owner=owner();var start=new java.util.concurrent.CountDownLatch(1);
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var creation=executor.submit(()->{start.await();try{ledger.transaction(owner,null,null,input(a.getId(),Kind.INCOME,"1"));return 200;}catch(AccountFailure e){return e.status();}});
            var deletion=executor.submit(()->{start.await();try{accountService.delete(owner,a.getId(),"\"0\"");return 204;}catch(AccountFailure e){return e.status();}});
            start.countDown();var made=creation.get(15,java.util.concurrent.TimeUnit.SECONDS);var removed=deletion.get(15,java.util.concurrent.TimeUnit.SECONDS);
            assertTrue((made==200 && removed==409) || (made==404 && removed==204));
            assertEquals(made==200,accounts.existsById(a.getId()));
        }
    }
    @Test void concurrentTransferEditsSerializeAndHaveOneVersionWinner() throws Exception {
        var a=account(AccountType.CASH);var b=account(AccountType.CASH);var owner=owner();
        var op=ledger.transfer(owner,null,null,new TransferInput(a.getId(),b.getId(),"1",ledger.today(),"Synthetic",null));
        var start=new java.util.concurrent.CountDownLatch(1);
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Integer> edit=()->{start.await();try{ledger.transfer(owner,op.id(),"\"0\"",new TransferInput(b.getId(),a.getId(),"2",ledger.today(),"Synthetic edit",null));return 200;}catch(AccountFailure e){return e.status();}};
            var first=executor.submit(edit);var second=executor.submit(edit);start.countDown();
            var statuses=java.util.List.of(first.get(15,java.util.concurrent.TimeUnit.SECONDS),second.get(15,java.util.concurrent.TimeUnit.SECONDS));
            assertTrue(statuses.contains(200));assertTrue(statuses.contains(412));balance(a.getId(),"2");balance(b.getId(),"-2");
        }
    }

    @Test void auditFailureRollsBackPairedEditAndDeletion() {
        var a=account(AccountType.CASH);var b=account(AccountType.CASH);
        var op=ledger.transfer(owner(),null,null,new TransferInput(a.getId(),b.getId(),"3",ledger.today(),"Synthetic",null));
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT synthetic_reject_ledger_changes CHECK (event_type NOT IN ('LEDGER_UPDATED','LEDGER_DELETED'))");
        try {
            assertThrows(Exception.class,()->ledger.transfer(owner(),op.id(),"\"0\"",new TransferInput(b.getId(),a.getId(),"5",ledger.today(),"Synthetic edit",null)));
            assertThrows(Exception.class,()->ledger.delete(owner(),op.id(),"\"0\"",true));
            balance(a.getId(),"-3");balance(b.getId(),"3");assertEquals(0,ledger.list(owner(),a.getId(),0).items().getFirst().version());
        } finally {jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT synthetic_reject_ledger_changes");}
    }
    @Test void concurrentCreationAndArchivingNeverWriteIntoAlreadyArchivedAccounts() throws Exception {
        var a=account(AccountType.CASH);var owner=owner();var start=new java.util.concurrent.CountDownLatch(1);
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var creation=executor.submit(()->{start.await();try{ledger.transaction(owner,null,null,input(a.getId(),Kind.EXPENSE,"1"));return 200;}catch(AccountFailure e){return e.status();}});
            var archive=executor.submit(()->{start.await();accountService.setActive(owner,a.getId(),"\"0\"",false);return 200;});
            start.countDown();var made=creation.get(15,java.util.concurrent.TimeUnit.SECONDS);assertEquals(200,archive.get(15,java.util.concurrent.TimeUnit.SECONDS));
            assertTrue(made==200 || made==409);assertFalse(accountService.detail(owner,a.getId()).active());balance(a.getId(),made==200?"-1":"0");
        }
    }

    @Test void concurrentTransferAndFinancialSetupEditCannotMixCurrencies() throws Exception {
        var a=account(AccountType.CASH);var b=account(AccountType.CASH);var owner=owner();var start=new java.util.concurrent.CountDownLatch(1);
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var creation=executor.submit(()->{start.await();try{ledger.transfer(owner,null,null,new TransferInput(a.getId(),b.getId(),"1",ledger.today(),"Synthetic",null));return 200;}catch(AccountFailure e){return e.status();}catch(IllegalArgumentException e){return 400;}});
            var edit=executor.submit(()->{start.await();try{accountService.update(owner,a.getId(),"\"0\"",new AccountDtos.CreateAccount("Synthetic",AccountType.CASH,null,"EUR","0",AccountDtos.BalanceMeaning.BALANCE,a.getOpeningDate()));return 200;}catch(AccountFailure e){return e.status();}});
            start.countDown();var made=creation.get(15,java.util.concurrent.TimeUnit.SECONDS);var changed=edit.get(15,java.util.concurrent.TimeUnit.SECONDS);
            assertTrue((made==200 && changed==409) || (made==400 && changed==200));
            assertEquals(made==200?"CHF":"EUR",accountService.detail(owner,a.getId()).currency());
            balance(a.getId(),made==200?"-1":"0");balance(b.getId(),made==200?"1":"0");
        }
    }
    @Test void futureTransactionsTransfersAndValueDatesCanBeRecordedAndCorrected() {
        var a=account(AccountType.CASH);var b=account(AccountType.CASH);var future=ledger.today().plusDays(10);
        var income=ledger.transaction(owner(),null,null,new TransactionInput(a.getId(),Kind.INCOME,"20",future,future.plusDays(1),null,"Synthetic future income",null));
        var expense=ledger.transaction(owner(),null,null,new TransactionInput(a.getId(),Kind.EXPENSE,"3",future,null,null,"Synthetic future expense",null));
        var refund=ledger.transaction(owner(),null,null,new TransactionInput(a.getId(),Kind.REFUND,"1",future,null,null,"Synthetic future refund",null));
        var transfer=ledger.transfer(owner(),null,null,new TransferInput(a.getId(),b.getId(),"5",future,"Synthetic future transfer",null));
        balance(a.getId(),"0");balance(b.getId(),"0");assertEquals(4,ledger.list(owner(),a.getId(),0).items().size());
        income=ledger.transaction(owner(),income.id(),"\"0\"",new TransactionInput(a.getId(),Kind.INCOME,"20",ledger.today(),future,null,"Synthetic corrected income",null));
        balance(a.getId(),"20");
        transfer=ledger.transfer(owner(),transfer.id(),"\"0\"",new TransferInput(a.getId(),b.getId(),"5",ledger.today(),"Synthetic corrected transfer",null));
        balance(a.getId(),"15");balance(b.getId(),"5");
        transfer=ledger.transfer(owner(),transfer.id(),"\"1\"",new TransferInput(a.getId(),b.getId(),"5",future,"Synthetic rescheduled transfer",null));
        balance(a.getId(),"20");balance(b.getId(),"0");
        ledger.delete(owner(),expense.id(),"\"0\"",false);ledger.delete(owner(),refund.id(),"\"0\"",false);ledger.delete(owner(),transfer.id(),"\"2\"",true);
        balance(a.getId(),"20");assertEquals(1,ledger.list(owner(),a.getId(),0).items().size());
    }

}
