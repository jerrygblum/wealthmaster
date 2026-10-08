package com.example.wealthmaster.budgets;
import static com.example.wealthmaster.budgets.CategoryDtos.*;
import static com.example.wealthmaster.budgets.SpendingPeriod.*;
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
class ExpectedIntegrationTest {
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
    @org.springframework.test.context.bean.override.mockito.MockitoBean com.example.wealthmaster.config.BusinessTime time;
    @BeforeEach void setup() {
        clearExpected();
        org.mockito.Mockito.when(time.today()).thenReturn(LocalDate.of(2026,10,8));
        org.mockito.Mockito.when(time.now()).thenReturn(java.time.Instant.parse("2026-10-08T10:00:00Z"));
        org.mockito.Mockito.when(time.dateAt(org.mockito.ArgumentMatchers.any())).thenReturn(LocalDate.of(2026,10,8));
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        jdbc.update("DELETE FROM audit_events"); jdbc.update("DELETE FROM ledger_category_history"); jdbc.update("DELETE FROM ledger_account_history"); jdbc.update("DELETE FROM ledger_movements"); jdbc.update("DELETE FROM ledger_operations"); accounts.deleteAll();
        jdbc.update("DELETE FROM user_preferences");
        jdbc.update("INSERT INTO user_preferences(owner_id,default_currency) VALUES(?,?)",owner(),"CHF");
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

    @Autowired ExpectedService expected;
    @Autowired CategoryService categories;
    @Autowired LedgerService ledger;
    @Autowired AccountService accountService;
    @Autowired NetWorthService netWorth;
    UUID owner() { return users.findByEmail("owner@example.test").orElseThrow().getId(); }
    final LocalDate month=LocalDate.of(2026,10,1);
    @org.junit.jupiter.api.AfterEach void clearExpected() {
        jdbc.update("DELETE FROM expected_occurrences");jdbc.update("DELETE FROM expected_account_history");
        jdbc.update("DELETE FROM expected_category_history");jdbc.update("DELETE FROM expected_transactions");jdbc.update("DELETE FROM expectation_owner_state");
    }
    FinancialAccount account(String currency) {return accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic cash "+currency,AccountType.CASH,null,currency,new BigDecimal("100"),LocalDate.of(2020,1,1)));}
    ExpectedDtos.Input input(UUID account,ExpectedDtos.Kind kind,String amount) {return new ExpectedDtos.Input("Synthetic monthly item",kind,account,null,null,amount,31,month.minusMonths(1),null,"Synthetic payee","");}
    ExpectedDtos.Definition create(UUID account,ExpectedDtos.Kind kind,String amount) {return expected.save(owner(),null,null,input(account,kind,amount));}
    ExpectedDtos.Occurrence item(UUID id) {return expected.report(owner(),month).items().stream().filter(i->i.definition().id().equals(id)).findFirst().orElseThrow();}
    String version(long v) {return "\""+v+"\"";}
    Operation operation(UUID account,Kind kind,String amount) {return ledger.transaction(owner(),null,null,new TransactionInput(account,kind,amount,month.plusDays(2),null,"Synthetic payee","Synthetic actual",null));}
    ExpectedDtos.Reconcile link(ExpectedDtos.Definition d,Operation op) {return new ExpectedDtos.Reconcile(d.version(),op.id(),op.version(),false);}
    @Test void expectationsDoNotChangeBalancesAndFutureMonthsStillShowExpectations() {
        var a=account("CHF");var before=netWorth.current(owner());var d=create(a.getId(),ExpectedDtos.Kind.EXPENSE,"10.12345678");
        assertEquals(before.currencies(),netWorth.current(owner()).currencies());
        var r=expected.report(owner(),month.plusMonths(1));assertEquals(1,r.items().size());assertFalse(r.items().getFirst().canRecord());
        assertEquals("10.12345678",r.totals().getFirst().expected());assertEquals("0",r.totals().getFirst().actual());
        assertEquals(LocalDate.of(2026,11,30),r.items().getFirst().expectedDate());
        assertThrows(AccountFailure.class,()->accountService.delete(owner(),a.getId(),version(a.getVersion())));
    }
    @Test void ranksExactAmountsPaginatesAndNeverAutoMatches() {
        var a=account("CHF");var d=create(a.getId(),ExpectedDtos.Kind.EXPENSE,"10");
        var different=operation(a.getId(),Kind.EXPENSE,"11");var exact=operation(a.getId(),Kind.EXPENSE,"10");
        operation(a.getId(),Kind.INCOME,"10");operation(account("EUR").getId(),Kind.EXPENSE,"10");
        var candidates=expected.candidates(owner(),d.id(),month,0);assertEquals(List.of(exact.id(),different.id()),candidates.items().stream().map(Operation::id).toList());
        assertNotEquals("COMPLETED",item(d.id()).status());
        for(int n=0;n<51;n++)operation(a.getId(),Kind.EXPENSE,"12");
        assertEquals(50,expected.candidates(owner(),d.id(),month,0).items().size());assertTrue(expected.candidates(owner(),d.id(),month,0).hasMore());
        assertEquals(3,expected.candidates(owner(),d.id(),month,1).items().size());
    }
    @Test void linksDifferentAmountsAndDetectsCorrectionsDeletionAndStaleVersions() {
        var a=account("CHF");var d=create(a.getId(),ExpectedDtos.Kind.EXPENSE,"10");var op=operation(a.getId(),Kind.EXPENSE,"12");
        var matched=expected.reconcile(owner(),d.id(),month,version(0),link(d,op));assertEquals("COMPLETED",matched.status());assertEquals("2.00000000",matched.difference());
        assertEquals("12.00000000",expected.report(owner(),month).totals().getFirst().actual());
        assertThrows(CategoryFailure.class,()->expected.reconcile(owner(),d.id(),month,version(0),link(d,op)));
        var edited=ledger.transaction(owner(),op.id(),version(op.version()),new TransactionInput(a.getId(),Kind.INCOME,"12",month.plusDays(2),null,null,"Corrected actual",null));
        assertEquals("NEEDS_REVIEW",item(d.id()).status());
        ledger.delete(owner(),edited.id(),version(edited.version()),false);assertEquals("NEEDS_REVIEW",item(d.id()).status());assertNull(item(d.id()).actual());
        expected.reconcile(owner(),d.id(),month,version(matched.version()),new ExpectedDtos.Reconcile(d.version(),null,null,false));assertEquals("UPCOMING",item(d.id()).status());
    }
    @Test void rejectsDuplicateLinksAndOtherOwnersAndUpdatesHistoricalMonths() {
        var a=account("CHF");var d=create(a.getId(),ExpectedDtos.Kind.EXPENSE,"10");var other=create(a.getId(),ExpectedDtos.Kind.EXPENSE,"10");var op=operation(a.getId(),Kind.EXPENSE,"10");
        expected.reconcile(owner(),d.id(),month,version(0),link(d,op));
        assertThrows(CategoryFailure.class,()->expected.reconcile(owner(),other.id(),month,version(0),link(other,op)));
        assertThrows(CategoryFailure.class,()->expected.candidates(UUID.randomUUID(),d.id(),month,0));
        var changed=expected.save(owner(),d.id(),version(d.version()),input(a.getId(),ExpectedDtos.Kind.EXPENSE,"20"));
        assertEquals("20.00000000",expected.report(owner(),month.minusMonths(1)).items().stream().filter(i->i.definition().id().equals(d.id())).findFirst().orElseThrow().definition().amount());
        assertEquals("COMPLETED",item(d.id()).status());assertEquals("-10.00000000",item(d.id()).difference());
        assertThrows(CategoryFailure.class,()->expected.save(owner(),d.id(),version(d.version()),input(a.getId(),ExpectedDtos.Kind.EXPENSE,"30")));
        expected.delete(owner(),d.id(),version(changed.version()));assertTrue(expected.candidates(owner(),other.id(),month,0).items().stream().anyMatch(i->i.id().equals(op.id())));
    }
    @Test void skipsOneMonthAndRecordsAtomicallyWithRollback() {
        var a=account("CHF");var d=create(a.getId(),ExpectedDtos.Kind.INCOME,"100");
        var skipped=expected.reconcile(owner(),d.id(),month,version(0),new ExpectedDtos.Reconcile(d.version(),null,null,true));assertEquals("SKIPPED",skipped.status());
        assertEquals("UPCOMING",expected.report(owner(),month.plusMonths(1)).items().getFirst().status());
        var undone=expected.reconcile(owner(),d.id(),month,version(skipped.version()),new ExpectedDtos.Reconcile(d.version(),null,null,false));
        var invalid=new ExpectedDtos.RecordInput(d.version(),"100",month.plusMonths(1),null,null,"Synthetic income",null,null);
        assertThrows(IllegalArgumentException.class,()->expected.record(owner(),d.id(),month,version(undone.version()),invalid));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));
        var valid=new ExpectedDtos.RecordInput(d.version(),"90",month.plusDays(2),null,null,"Synthetic income",null,null);
        var recorded=expected.record(owner(),d.id(),month,version(undone.version()),valid);assertEquals("COMPLETED",recorded.status());
        assertThrows(CategoryFailure.class,()->expected.record(owner(),d.id(),month,version(undone.version()),valid));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));
        // Failure after ledger creation must roll back the operation, movements, audit and link together.
        var second=create(a.getId(),ExpectedDtos.Kind.INCOME,"100");
        jdbc.execute("CREATE FUNCTION synthetic_fail_expected() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''synthetic failure''; END'");
        jdbc.execute("CREATE TRIGGER synthetic_expected_failure BEFORE INSERT OR UPDATE ON expected_occurrences FOR EACH ROW EXECUTE FUNCTION synthetic_fail_expected()");
        try {assertThrows(org.springframework.dao.DataAccessException.class,()->expected.record(owner(),second.id(),month,version(0),new ExpectedDtos.RecordInput(second.version(),"100",month.plusDays(2),null,null,"Rollback synthetic",null,null)));}
        finally {jdbc.execute("DROP TRIGGER synthetic_expected_failure ON expected_occurrences");jdbc.execute("DROP FUNCTION synthetic_fail_expected()");}
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));
    }
    @Test void transfersAndArchivedCategoriesRetainCorrectSemantics() {
        var a=account("CHF");var b=account("CHF");var category=categories.create(owner(),new Input("Synthetic food",Type.SPENDING,null));
        var d=expected.save(owner(),null,null,new ExpectedDtos.Input("Synthetic bill",ExpectedDtos.Kind.EXPENSE,a.getId(),null,category.id(),"10",1,month,null,null,null));
        assertThrows(CategoryFailure.class,()->categories.delete(owner(),category.id(),version(category.version())));
        categories.setActive(owner(),category.id(),version(category.version()),false);assertFalse(item(d.id()).canRecord());
        var transfer=expected.save(owner(),null,null,new ExpectedDtos.Input("Synthetic transfer",ExpectedDtos.Kind.TRANSFER,a.getId(),b.getId(),null,"5",1,month,null,null,null));
        var before=netWorth.current(owner()).currencies();var recorded=expected.record(owner(),transfer.id(),month,version(0),new ExpectedDtos.RecordInput(transfer.version(),"5",month.plusDays(2),null,null,"Synthetic transfer",null,null));
        assertEquals(Kind.TRANSFER,recorded.actual().kind());assertEquals(0,new BigDecimal(before.getFirst().netWorth()).compareTo(new BigDecimal(netWorth.current(owner()).currencies().getFirst().netWorth())));
        accountService.setActive(owner(),a.getId(),version(a.getVersion()),false);assertFalse(item(transfer.id()).definition().available());assertEquals("COMPLETED",item(transfer.id()).status());
    }
    @Test void endpointsRequireSessionCsrfVersionsAndDisableCaching() throws Exception {
        mvc.perform(get("/api/v1/expected-transactions")).andExpect(status().isUnauthorized());
        var session=login("owner@example.test");
        mvc.perform(get("/api/v1/expected-transactions").session(session)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        var a=account("CHF");var body=mapper.writeValueAsString(input(a.getId(),ExpectedDtos.Kind.INCOME,"100"));
        mvc.perform(post("/api/v1/expected-transactions").session(session).contentType("application/json").content(body)).andExpect(status().isForbidden());
        var d=create(a.getId(),ExpectedDtos.Kind.INCOME,"100");
        mvc.perform(put("/api/v1/expected-transactions/"+d.id()).session(session).header("X-CSRF-TOKEN",csrf(session)).contentType("application/json").content(body)).andExpect(status().isPreconditionRequired());
    }
    @Test void concurrentRecordingCreatesOneOperation() throws Exception {
        var a=account("CHF");var d=create(a.getId(),ExpectedDtos.Kind.INCOME,"100");
        var request=new ExpectedDtos.RecordInput(d.version(),"100",month.plusDays(2),null,null,"Synthetic concurrent",null,null);
        var gate=new java.util.concurrent.CountDownLatch(1);
        try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Boolean> task=()->{gate.await();try{expected.record(owner(),d.id(),month,version(0),request);return true;}catch(CategoryFailure e){assertEquals(412,e.status());return false;}};
            var one=pool.submit(task);var two=pool.submit(task);gate.countDown();
            assertNotEquals(one.get(10,java.util.concurrent.TimeUnit.SECONDS),two.get(10,java.util.concurrent.TimeUnit.SECONDS));
        }
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));
    }

}
