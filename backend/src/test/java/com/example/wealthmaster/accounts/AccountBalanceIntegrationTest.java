package com.example.wealthmaster.accounts;

import com.example.wealthmaster.budgets.*;
import com.example.wealthmaster.ledger.*;
import com.example.wealthmaster.users.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ActiveProfiles("dev")
@SpringBootTest(properties={"app.initial-owner.email=owner@example.test","app.initial-owner.password=synthetic-password",
    "app.mfa.encryption-password=synthetic-test-encryption-password-only","app.mfa.encryption-salt=0123456789abcdef0123456789abcdef"})
@Import(AccountBalanceIntegrationTest.TestTime.class)
class AccountBalanceIntegrationTest {
    static final LocalDate TODAY=LocalDate.of(2026,11,9);
    @TestConfiguration static class TestTime {@Bean @Primary Clock clock(){return Clock.fixed(Instant.parse("2026-11-09T12:00:00Z"),ZoneOffset.UTC);}}
    static final PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:18-alpine");
    @BeforeAll static void start(){Assumptions.assumeTrue(DockerClientFactory.instance().isDockerAvailable());postgres.start();}
    @AfterAll static void stop(){if(postgres.isRunning())postgres.stop();}
    @DynamicPropertySource static void db(DynamicPropertyRegistry r){r.add("spring.datasource.url",postgres::getJdbcUrl);r.add("spring.datasource.username",postgres::getUsername);r.add("spring.datasource.password",postgres::getPassword);}
    @Autowired AccountBalanceService balances;
    @Autowired AccountService accounts;
    @Autowired AccountRepository repository;
    @Autowired ExpectedService expected;
    @Autowired CategoryService categories;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;
    @Autowired WebApplicationContext context;
    @Autowired ObjectMapper mapper;
    @MockitoSpyBean LedgerService ledger;
    UUID owner;
    @BeforeEach void setup(){
        jdbc.execute("TRUNCATE demo_installation,market_quotes,investment_sale_allocations,investment_lots,investment_activities,investment_securities,expected_occurrences,expected_account_history,expected_category_history,expected_transactions,import_operation_links,import_batches,ledger_category_history,ledger_account_history,ledger_movements,ledger_operations,financial_accounts,categories,category_owner_state CASCADE");
        jdbc.update("DELETE FROM audit_events");owner=users.findByEmail("owner@example.test").orElseThrow().getId();
    }
    FinancialAccount account(String amount,AccountType type){return repository.saveAndFlush(new FinancialAccount(owner,"Synthetic "+type,type,null,"CHF",new BigDecimal(amount),LocalDate.of(2020,1,1)));}
    LedgerDtos.Operation transaction(UUID account,LedgerDtos.Kind kind,String amount,LocalDate date){return ledger.transaction(owner,null,null,new LedgerDtos.TransactionInput(account,kind,amount,date,date.plusDays(1),null,"Synthetic dated balance",null));}
    ExpectedDtos.Definition definition(UUID account,UUID destination,ExpectedDtos.Kind kind,String amount,int day,LocalDate first,LocalDate last){return expected.save(owner,null,null,new ExpectedDtos.Input("Synthetic expectation",kind,account,destination,null,amount,day,first,last,null,null));}
    AccountBalanceDtos.Balance balance(UUID account,LocalDate date,boolean forecast){return balances.balance(owner,account,date,forecast,0);}
    @Test void cashHistoryFutureMovementsCorrectionsAndOpeningDatesUseExactDates(){
        var a=account("100.12345678",AccountType.CASH);var b=account("0",AccountType.SAVINGS);
        transaction(a.getId(),LedgerDtos.Kind.INCOME,"10",LocalDate.of(2019,1,1));
        transaction(a.getId(),LedgerDtos.Kind.EXPENSE,"5.00000001",TODAY);
        var future=transaction(a.getId(),LedgerDtos.Kind.EXPENSE,"20",TODAY.plusDays(2));
        ledger.transfer(owner,null,null,new LedgerDtos.TransferInput(a.getId(),b.getId(),"7",TODAY.plusDays(3),"Synthetic future transfer",null));
        assertEquals("105.12345677",balance(a.getId(),TODAY,false).recordedBalance());
        assertEquals("85.12345677",balance(a.getId(),TODAY.plusDays(2),false).recordedBalance());
        assertEquals("78.12345677",balance(a.getId(),TODAY.plusDays(3),false).recordedBalance());
        assertEquals("7",balance(b.getId(),TODAY.plusDays(3),false).recordedBalance());
        assertEquals("110.12345678",balance(a.getId(),TODAY.minusDays(1),false).recordedBalance());
        assertFalse(balance(a.getId(),LocalDate.of(2019,1,1),false).available());
        ledger.delete(owner,future.id(),"\"0\"",false);
        assertEquals("105.12345677",balance(a.getId(),TODAY.plusDays(2),false).recordedBalance());
        accounts.update(owner,a.getId(),"\"0\"",new AccountDtos.CreateAccount("Synthetic corrected opening",AccountType.CASH,null,"CHF","100.12345678",AccountDtos.BalanceMeaning.BALANCE,TODAY.plusDays(1)));
        assertFalse(balance(a.getId(),TODAY,false).available());
        assertEquals("98.12345677",balance(a.getId(),TODAY.plusDays(3),false).recordedBalance());
        assertEquals("100.12345678",balance(a.getId(),LocalDate.of(9999,12,31),false).openingBalance());
    }
    @Test void expectationsCountTodayForwardButNeverOverdueSkippedOrConfirmedMatches(){
        var a=account("1000",AccountType.CHECKING);var b=account("0",AccountType.SAVINGS);var month=TODAY.withDayOfMonth(1);
        definition(a.getId(),null,ExpectedDtos.Kind.EXPENSE,"100",9,month,month);
        definition(a.getId(),null,ExpectedDtos.Kind.EXPENSE,"200",8,month,month);
        var matched=definition(a.getId(),null,ExpectedDtos.Kind.INCOME,"500",10,month,month);
        var actual=transaction(a.getId(),LedgerDtos.Kind.INCOME,"450",TODAY.plusDays(20));
        expected.reconcile(owner,matched.id(),month,"\"0\"",new ExpectedDtos.Reconcile(0L,actual.id(),actual.version(),false));
        var skipped=definition(a.getId(),null,ExpectedDtos.Kind.EXPENSE,"50",10,month,month);
        expected.reconcile(owner,skipped.id(),month,"\"0\"",new ExpectedDtos.Reconcile(0L,null,null,true));
        definition(a.getId(),b.getId(),ExpectedDtos.Kind.TRANSFER,"75",11,month,month);
        var report=balance(a.getId(),TODAY.plusDays(3),true);
        assertEquals("1000",report.recordedBalance());assertEquals("-175",report.forecast().adjustment());assertEquals("825",report.forecast().balance());
        assertEquals(1,report.forecast().overdueCount());assertTrue(report.forecast().complete());
        assertEquals("75",balance(b.getId(),TODAY.plusDays(3),true).forecast().adjustment());
        assertEquals("900",balance(a.getId(),TODAY,true).forecast().balance());
        assertNull(balance(a.getId(),TODAY.minusDays(1),true).forecast());
        assertEquals("1275",balance(a.getId(),TODAY.plusDays(20),true).forecast().balance());
        ledger.transaction(owner,actual.id(),"\"0\"",new LedgerDtos.TransactionInput(a.getId(),LedgerDtos.Kind.INCOME,"475",TODAY.plusDays(1),null,null,"Synthetic corrected income",null));
        assertEquals("1300",balance(a.getId(),TODAY.plusDays(3),true).forecast().balance());
    }
    @Test void invalidLinksUnavailableReferencesAndEditedSchedulesProduceIncompleteForecasts(){
        var a=account("500",AccountType.CASH);var month=TODAY.withDayOfMonth(1);
        var d=definition(a.getId(),null,ExpectedDtos.Kind.EXPENSE,"100",10,month,month);
        var op=transaction(a.getId(),LedgerDtos.Kind.EXPENSE,"80",TODAY.plusDays(1));
        expected.reconcile(owner,d.id(),month,"\"0\"",new ExpectedDtos.Reconcile(0L,op.id(),op.version(),false));
        ledger.delete(owner,op.id(),"\"0\"",false);
        var report=balance(a.getId(),TODAY.plusDays(2),true);
        assertFalse(report.forecast().complete());assertEquals("0",report.forecast().adjustment());assertEquals(1,report.forecast().reviews().size());
        expected.save(owner,d.id(),"\"0\"",new ExpectedDtos.Input(d.name(),d.kind(),a.getId(),null,null,d.amount(),10,month.plusMonths(1),month.plusMonths(1),null,null));
        assertFalse(balance(a.getId(),TODAY.plusDays(2),true).forecast().complete());
        definition(a.getId(),null,ExpectedDtos.Kind.INCOME,"200",11,month,month);
        accounts.setActive(owner,a.getId(),"\"0\"",false);
        report=balance(a.getId(),TODAY.plusDays(2),true);
        assertFalse(report.forecast().complete());assertEquals(2,report.forecast().reviews().size());assertEquals("500",report.forecast().balance());
    }
    @Test void recurrenceBoundariesLeapDaysAndLimitsAreRespectedWithoutWritingState(){
        var a=account("0",AccountType.CASH);var first=LocalDate.of(2028,2,1);
        definition(a.getId(),null,ExpectedDtos.Kind.INCOME,"1.12345678",31,first,first);
        long audits=jdbc.queryForObject("SELECT count(*) FROM audit_events",Long.class);
        assertEquals("0",balance(a.getId(),LocalDate.of(2028,2,28),true).forecast().adjustment());
        assertEquals("1.12345678",balance(a.getId(),LocalDate.of(2028,2,29),true).forecast().adjustment());
        assertEquals("1.12345678",balance(a.getId(),LocalDate.of(2028,3,31),true).forecast().adjustment());
        definition(a.getId(),null,ExpectedDtos.Kind.EXPENSE,"2",10,TODAY.withDayOfMonth(1),null);
        assertThrows(IllegalArgumentException.class,()->balance(a.getId(),LocalDate.of(9999,12,31),true));
        assertNotNull(balance(a.getId(),LocalDate.of(9999,12,31),false).recordedBalance());
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM expected_occurrences",Integer.class));
        assertEquals(audits+1,jdbc.queryForObject("SELECT count(*) FROM audit_events",Long.class));
    }
    @Test void mergedPaginationIsChronologicalAndNeverTruncatesTotals(){
        var a=account("0",AccountType.CASH);var month=TODAY.withDayOfMonth(1);
        for(int i=0;i<61;i++)transaction(a.getId(),LedgerDtos.Kind.INCOME,"1",TODAY.plusDays(1));
        for(int i=0;i<53;i++)definition(a.getId(),null,ExpectedDtos.Kind.EXPENSE,"2",10,month,month);
        var all=new ArrayList<AccountBalanceDtos.Entry>();
        for(int page=0;page<3;page++){
            var r=balances.balance(owner,a.getId(),TODAY.plusDays(2),true,page);
            assertEquals("61",r.recordedBalance());assertEquals("-45",r.forecast().balance());
            assertEquals(page<2,r.hasMore());all.addAll(r.entries());
        }
        assertEquals(114,all.size());assertEquals(114,all.stream().map(e->e.source()+e.id()).distinct().count());
        assertEquals("EXPECTED",all.getFirst().source());assertEquals("RECORDED",all.getLast().source());
    }
    @Test void signedCardsAndReadOnlyArchivedAccountsKeepTheirCashMeaning(){
        var card=account("-100",AccountType.CREDIT_CARD);
        transaction(card.getId(),LedgerDtos.Kind.REFUND,"125.00000001",TODAY.plusDays(1));
        assertEquals("-100",balance(card.getId(),TODAY,false).recordedBalance());assertEquals("25.00000001",balance(card.getId(),TODAY.plusDays(1),false).recordedBalance());
        accounts.setActive(owner,card.getId(),"\"0\"",false);
        assertEquals("25.00000001",balance(card.getId(),TODAY.plusDays(1),false).recordedBalance());
        assertThrows(IllegalArgumentException.class,()->balance(card.getId(),LocalDate.of(0,1,1),false));
    }
    @Test void endpointIsOwnerScopedNoStoreAndRejectsInvalidInputs()throws Exception {
        var a=account("1",AccountType.CASH);
        var other=users.findByEmail("balance.other@example.test").orElseGet(()->users.save(new AppUser("balance.other@example.test",users.findById(owner).orElseThrow().getPasswordHash())));
        var foreign=repository.saveAndFlush(new FinancialAccount(other.getId(),"Synthetic foreign cash",AccountType.CASH,null,"CHF",BigDecimal.ONE,TODAY));
        assertEquals(404,assertThrows(AccountFailure.class,()->balance(foreign.getId(),TODAY,false)).status());
        var mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        mvc.perform(get("/api/v1/accounts/"+a.getId()+"/balance").param("date",TODAY.toString())).andExpect(status().isUnauthorized());
        var session=new MockHttpSession();var token=mapper.readTree(mvc.perform(get("/api/v1/auth/csrf").session(session)).andReturn().getResponse().getContentAsString()).get("token").asString();
        mvc.perform(post("/api/v1/auth/login").session(session).header("X-CSRF-TOKEN",token).param("email","owner@example.test").param("password","synthetic-password")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/accounts/"+a.getId()+"/balance").session(session).param("date",TODAY.toString())).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.recordedBalance").value("1"));
        mvc.perform(get("/api/v1/accounts/"+UUID.randomUUID()+"/balance").session(session).param("date",TODAY.toString())).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/accounts/"+a.getId()+"/balance").session(session).param("date","2026-02-30")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/accounts/"+a.getId()+"/balance").session(session).param("date",TODAY.toString()).param("page","-1")).andExpect(status().isBadRequest());
    }
    @Test void projectionLimitCountsOnlyOccurrencesWithinPartialBoundaryMonths() {
        var a=account("0",AccountType.CASH);
        definition(a.getId(),null,ExpectedDtos.Kind.INCOME,"1",8,TODAY.withDayOfMonth(1),null);
        var end=TODAY.withDayOfMonth(1).plusMonths(2001);
        assertEquals("2000",balance(a.getId(),end,true).forecast().adjustment());
        assertThrows(IllegalArgumentException.class,()->balance(a.getId(),end.plusDays(7),true));
    }
    @Test void longOverdueHistoryIsCountedWithoutExpandingTheProjectionWindow() {
        var a=account("100",AccountType.CASH);
        definition(a.getId(),null,ExpectedDtos.Kind.EXPENSE,"1",8,LocalDate.of(1,1,1),null);
        var report=balance(a.getId(),TODAY,true);
        assertEquals("0",report.forecast().adjustment());
        assertEquals(java.time.temporal.ChronoUnit.MONTHS.between(LocalDate.of(1,1,1),TODAY.withDayOfMonth(1))+1,report.forecast().overdueCount());
        assertTrue(report.entries().isEmpty());
    }
    @Test void totalsAndBreakdownShareOneSnapshotWhileATransferCommits()throws Exception {
        var a=account("100",AccountType.CASH);var b=account("0",AccountType.SAVINGS);
        var read=new java.util.concurrent.CountDownLatch(1);var committed=new java.util.concurrent.CountDownLatch(1);
        org.mockito.Mockito.doAnswer(call->{var result=call.callRealMethod();if(Thread.currentThread().getName().equals("balance-reader")){read.countDown();assertTrue(committed.await(15,java.util.concurrent.TimeUnit.SECONDS));}return result;})
            .when(ledger).cashTotals(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any());
        try(var pool=java.util.concurrent.Executors.newSingleThreadExecutor(r->new Thread(r,"balance-reader"))){
            var result=pool.submit(()->balance(a.getId(),TODAY.plusDays(1),false));assertTrue(read.await(15,java.util.concurrent.TimeUnit.SECONDS));
            try{ledger.transfer(owner,null,null,new LedgerDtos.TransferInput(a.getId(),b.getId(),"20",TODAY.plusDays(1),"Synthetic concurrent transfer",null));}finally{committed.countDown();}
            var before=result.get(15,java.util.concurrent.TimeUnit.SECONDS);assertEquals("100",before.recordedBalance());assertTrue(before.entries().isEmpty());
            assertEquals("80",balance(a.getId(),TODAY.plusDays(1),false).recordedBalance());
        }
    }
}
