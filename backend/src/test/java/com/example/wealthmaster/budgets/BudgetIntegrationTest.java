package com.example.wealthmaster.budgets;
import static com.example.wealthmaster.budgets.CategoryDtos.*;
import static com.example.wealthmaster.budgets.BudgetDtos.Period.*;
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
class BudgetIntegrationTest {
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
        if(businessTime!=null)org.mockito.Mockito.doCallRealMethod().when(businessTime).today();
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        jdbc.update("DELETE FROM audit_events"); jdbc.update("DELETE FROM ledger_category_history"); jdbc.update("DELETE FROM ledger_account_history"); jdbc.update("DELETE FROM ledger_movements"); jdbc.update("DELETE FROM ledger_operations"); accounts.deleteAll();
        jdbc.update("DELETE FROM budget_category_history"); jdbc.update("DELETE FROM spending_budgets");
        jdbc.update("DELETE FROM budget_setting_category_history"); jdbc.update("DELETE FROM budget_setting_revisions"); jdbc.update("DELETE FROM budget_settings");
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
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean CategoryService categories;
    @Autowired LedgerService ledger;
    @Autowired NetWorthService netWorth;
    @Autowired AccountService accountService;
    UUID owner() { return users.findByEmail("owner@example.test").orElseThrow().getId(); }
    FinancialAccount account() { return accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic cash",AccountType.CASH,null,"CHF",new BigDecimal("100"),LocalDate.of(2020,1,1))); }
    Input spending(String name, UUID parent) { return new Input(name,Type.SPENDING,parent); }
    String version(Category c) { return "\"" + c.version() + "\""; }
    TransactionInput entry(UUID a, Kind kind, UUID category) { return new TransactionInput(a,kind,"10.00000001",ledger.today(),null,null,"Synthetic activity",null,category); }
    Category current(UUID id) { return categories.list(owner()).items().stream().filter(c->c.id().equals(id)).findFirst().orElseThrow(); }
    @Autowired BudgetService budgets;
    BudgetDtos.Budget budget(UUID category, String currency, BudgetDtos.Period type, LocalDate start, String amount) {
        return budgets.create(owner(),new BudgetDtos.Input(category,currency,type,start,amount));
    }
    void spend(UUID account,UUID category,Kind kind,String amount,LocalDate date) {
        ledger.transaction(owner(),null,null,new TransactionInput(account,kind,amount,date,null,null,"Synthetic budget activity",null,category));
    }
    void money(String expected,String actual) { assertEquals(0,new BigDecimal(expected).compareTo(new BigDecimal(actual))); }
    @Autowired SpendingService spendingReport;
    @Test void spendingWithoutLimitsGrossRollupsRefundsAndBoundaries() throws Exception {
        var a=account(); var root=categories.create(owner(),spending("Food",null));
        var child=categories.create(owner(),spending("Groceries",root.id()));
        var empty=categories.create(owner(),spending("Empty",null));
        var month=LocalDate.of(2024,2,1);
        spend(a.getId(),root.id(),Kind.EXPENSE,"5",month);
        spend(a.getId(),child.id(),Kind.EXPENSE,"10.12345678",LocalDate.of(2024,2,29));
        spend(a.getId(),child.id(),Kind.REFUND,"20",month);
        spend(a.getId(),null,Kind.EXPENSE,"3",month);
        spend(a.getId(),null,Kind.REFUND,"4",month);
        spend(a.getId(),null,Kind.INCOME,"1000",month);
        spend(a.getId(),child.id(),Kind.EXPENSE,"100",LocalDate.of(2024,3,1));
        categories.setActive(owner(),root.id(),version(current(root.id())),false);
        var report=spendingReport.report(owner(),MONTH,month);
        assertTrue(report.limits().isEmpty()); assertEquals(3,report.categories().size());
        var summary=report.currencies().getFirst();
        money("18.12345678",summary.expenses());money("24",summary.refunds());money("-5.87654322",summary.netSpending());
        var parent=report.groups().stream().filter(g->root.id().equals(g.categoryId())).findFirst().orElseThrow();
        money("5",parent.direct().expenses());money("15.12345678",parent.inclusive().expenses());money("20",parent.inclusive().refunds());
        var childGroup=report.groups().stream().filter(g->child.id().equals(g.categoryId())).findFirst().orElseThrow();
        money("10.12345678",childGroup.inclusive().expenses());
        var zero=report.groups().stream().filter(g->empty.id().equals(g.categoryId())).findFirst().orElseThrow();money("0",zero.direct().netSpending());
        money("118.12345678",spendingReport.report(owner(),YEAR,LocalDate.of(2024,1,1)).currencies().getFirst().expenses());
        assertTrue(spendingReport.report(owner(),MONTH,LocalDate.of(2025,1,1)).currencies().isEmpty());
        assertEquals(3,spendingReport.activity(owner(),MONTH,month,"CHF",root.id(),0).items().size());
        assertEquals(2,spendingReport.activity(owner(),MONTH,month,"CHF",null,0).items().size());
        assertThrows(CategoryFailure.class,()->spendingReport.activity(owner(),MONTH,month,"CHF",UUID.randomUUID(),0));
        var session=login("owner@example.test");
        mvc.perform(get("/api/v1/spending").session(session).param("periodType","MONTH").param("periodStart","2024-02-01"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.currencies[0].expenses").exists());
        mvc.perform(get("/api/v1/spending/activity").session(session).param("currency","CHF").param("categoryId",UUID.randomUUID().toString()))
            .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/spending")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/spending/activity").session(session).param("currency","CHF").param("categoryId",root.id().toString()).param("periodType","MONTH").param("periodStart","2024-02-01"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.items.length()").value(3));
        mvc.perform(get("/api/v1/spending/activity").session(session).param("currency","CHF").param("page","-1")).andExpect(status().isBadRequest());

    }
    @Test void spendingRefundOnlyLimitsCurrenciesCorrectionsAndPagination() {
        var a=account();var root=categories.create(owner(),spending("Food",null));var month=LocalDate.of(2024,2,1);
        spend(a.getId(),root.id(),Kind.REFUND,"20",month);
        budget(root.id(),"CHF",MONTH,month,"0");budget(root.id(),"USD",MONTH,month,"5");
        var usd=accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic USD cash",AccountType.CASH,null,"USD",BigDecimal.ZERO,LocalDate.of(2020,1,1)));
        spend(usd.getId(),root.id(),Kind.EXPENSE,"7.12345678",month);
        var report=spendingReport.report(owner(),MONTH,month); assertEquals(2,report.currencies().size());
        money("0",report.currencies().getFirst().expenses());money("-20",report.currencies().getFirst().netSpending());
        money("7.12345678",report.currencies().get(1).expenses());money("7.12345678",report.currencies().get(1).netSpending());
        assertTrue(report.limits().get(1).overBudget());
        money("7.12345678",report.groups().stream().filter(g->root.id().equals(g.categoryId())&&g.currency().equals("USD")).findFirst().orElseThrow().inclusive().expenses());
        money("20",report.limits().getFirst().remaining());assertFalse(report.limits().getFirst().overBudget());
        for(int i=0;i<51;i++) spend(a.getId(),root.id(),Kind.EXPENSE,"1",month);
        var first=spendingReport.activity(owner(),MONTH,month,"CHF",root.id(),0);assertEquals(50,first.items().size());assertTrue(first.hasMore());
        assertEquals(2,spendingReport.activity(owner(),MONTH,month,"CHF",root.id(),1).items().size());
        var operation=first.items().getFirst();
        ledger.transaction(owner(),operation.id(),"\""+operation.version()+"\"",new TransactionInput(a.getId(),Kind.EXPENSE,"7",month,null,null,"Synthetic correction",null,null));
        money("7",spendingReport.report(owner(),MONTH,month).groups().stream().filter(g->g.categoryId()==null&&g.currency().equals("CHF")).findFirst().orElseThrow().direct().expenses());
        ledger.delete(owner(),operation.id(),"\"1\"",false);
        money("50",spendingReport.report(owner(),MONTH,month).currencies().getFirst().expenses());
    }
    @Test void spendingSnapshotRemainsConsistentDuringConcurrentCorrections() throws Exception {
        var owner=owner();var a=account();var category=categories.create(owner,spending("Before",null));var month=LocalDate.of(2024,2,1);
        var operation=ledger.transaction(owner,null,null,new TransactionInput(a.getId(),Kind.EXPENSE,"2",month,null,null,"Synthetic snapshot",null,category.id()));
        var ready=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);
        org.mockito.Mockito.doAnswer(call->{
            if(Thread.currentThread().getName().equals("synthetic-spending-read")) {ready.countDown();assertTrue(release.await(15,java.util.concurrent.TimeUnit.SECONDS));}
            return call.callRealMethod();
        }).when(categories).list(owner);
        try(var executor=java.util.concurrent.Executors.newSingleThreadExecutor()) {
            var reading=executor.submit(()->{Thread.currentThread().setName("synthetic-spending-read");return spendingReport.report(owner,MONTH,month);});
            assertTrue(ready.await(15,java.util.concurrent.TimeUnit.SECONDS));
            try {
                ledger.transaction(owner,operation.id(),"\"0\"",new TransactionInput(a.getId(),Kind.EXPENSE,"7",month,null,null,"Synthetic snapshot correction",null,category.id()));
                categories.update(owner,category.id(),version(category),spending("After",null));
            } finally {release.countDown();}
            var snapshot=reading.get(15,java.util.concurrent.TimeUnit.SECONDS);
            assertEquals("Before",snapshot.categories().getFirst().name());money("2",snapshot.currencies().getFirst().expenses());money("2",snapshot.groups().getFirst().inclusive().expenses());
            var refreshed=spendingReport.report(owner,MONTH,month);assertEquals("After",refreshed.categories().getFirst().name());money("7",refreshed.currencies().getFirst().expenses());money("7",refreshed.groups().getFirst().inclusive().expenses());
        } finally {release.countDown();org.mockito.Mockito.doCallRealMethod().when(categories).list(owner);}
    }
    @Autowired BudgetSettingService normalSettings;
    @Autowired EffectiveBudgetService effectiveBudgets;
    @Autowired EffectiveLimitService effectiveLimits;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean com.example.wealthmaster.config.BusinessTime businessTime;
    BudgetDtos.Source reference(BudgetSettingService.Setting s) {return s==null?null:new BudgetDtos.Source(s.id(),s.version());}
    EffectiveBudgetService.Comparison comparison(UUID category,BudgetDtos.Period type,LocalDate start) {
        return effectiveBudgets.report(owner(),type,start).comparisons().stream().filter(c->c.categoryId().equals(category)&&c.currency().equals("CHF")).findFirst().orElseThrow();
    }
    @Test void datedNormalsExceptionsAnnualUsageAndFrequencyChanges() {
        org.mockito.Mockito.doReturn(LocalDate.of(2026,1,15)).when(businessTime).today();
        var a=account();var category=categories.create(owner(),spending("Recurring",null));
        var normal=normalSettings.save(owner(),new BudgetSettingService.Input(category.id(),"CHF",BudgetSettingService.Mode.MONTH,"100",null));
        spend(a.getId(),category.id(),Kind.EXPENSE,"10",LocalDate.of(2026,1,5));
        org.mockito.Mockito.doReturn(LocalDate.of(2026,6,15)).when(businessTime).today();
        normal=normalSettings.save(owner(),new BudgetSettingService.Input(category.id(),"CHF",BudgetSettingService.Mode.MONTH,"200",reference(normal)));
        budget(category.id(),"CHF",MONTH,LocalDate.of(2026,8,1),"120");
        org.mockito.Mockito.doReturn(LocalDate.of(2026,10,5)).when(businessTime).today();
        spend(a.getId(),category.id(),Kind.EXPENSE,"30",LocalDate.of(2026,8,3));
        spend(a.getId(),category.id(),Kind.REFUND,"50",LocalDate.of(2026,10,2));
        money("100",comparison(category.id(),MONTH,LocalDate.of(2026,1,1)).limit());
        money("120",comparison(category.id(),MONTH,LocalDate.of(2026,8,1)).limit());
        assertEquals("EXCEPTION",comparison(category.id(),MONTH,LocalDate.of(2026,8,1)).source());
        var year=comparison(category.id(),YEAR,LocalDate.of(2026,1,1));money("1420",year.limit());money("-10",year.actual());assertEquals(10,year.accruedMonths());
        assertEquals(LocalDate.of(2026,10,5),year.usageEnd());assertEquals("MONTHLY_ROLLUP",year.source());
        money("0",comparison(category.id(),YEAR,LocalDate.of(2027,1,1)).limit());
        assertEquals(0,comparison(category.id(),YEAR,LocalDate.of(2027,1,1)).accruedMonths());
        normal=normalSettings.save(owner(),new BudgetSettingService.Input(category.id(),"CHF",BudgetSettingService.Mode.YEAR,"1200",reference(normal)));
        var october=comparison(category.id(),MONTH,LocalDate.of(2026,10,1));assertEquals(YEAR,october.periodType());money("1200",october.limit());money("-10",october.actual());
        money("200",comparison(category.id(),MONTH,LocalDate.of(2026,9,1)).limit());
        money("1200",comparison(category.id(),YEAR,LocalDate.of(2026,1,1)).limit());
        money("1200",comparison(category.id(),YEAR,LocalDate.of(2027,1,1)).limit());
        assertEquals(12,effectiveBudgets.breakdown(owner(),category.id(),"CHF",2026).items().size());
        normalSettings.save(owner(),new BudgetSettingService.Input(category.id(),"CHF",BudgetSettingService.Mode.NONE,null,reference(normal)));
        money("120",comparison(category.id(),MONTH,LocalDate.of(2026,8,1)).limit());
        assertTrue(effectiveBudgets.report(owner(),MONTH,LocalDate.of(2026,10,1)).comparisons().isEmpty());
        assertTrue(current(category.id()).hasActivity());
    }
    @Test void currentPromotionIsAtomicAndOldDefaultsAreNotBackfilled() throws Exception {
        org.mockito.Mockito.doReturn(LocalDate.of(2026,10,5)).when(businessTime).today();
        var category=categories.create(owner(),spending("Promote",null));var month=LocalDate.of(2026,10,1);
        var normal=normalSettings.save(owner(),new BudgetSettingService.Input(category.id(),"CHF",BudgetSettingService.Mode.MONTH,"100",null));
        assertTrue(effectiveBudgets.report(owner(),MONTH,month.minusMonths(1)).comparisons().isEmpty());
        var exception=budget(category.id(),"CHF",MONTH,month,"120");
        var input=new EffectiveLimitService.Input(category.id(),"CHF",MONTH,month,"130",EffectiveLimitService.Scope.NORMAL,reference(normal),new BudgetDtos.Source(exception.id(),exception.version()));
        effectiveLimits.save(owner(),input);assertTrue(budgets.report(owner(),MONTH,month).items().isEmpty());
        assertEquals("NORMAL",comparison(category.id(),MONTH,month).source());money("130",comparison(category.id(),MONTH,month.plusMonths(1)).limit());
        assertEquals(412,assertThrows(CategoryFailure.class,()->effectiveLimits.save(owner(),input)).status());
        var latest=normalSettings.list(owner()).items().getFirst();
        assertThrows(IllegalArgumentException.class,()->effectiveLimits.save(owner(),new EffectiveLimitService.Input(category.id(),"CHF",MONTH,month.plusMonths(1),"140",EffectiveLimitService.Scope.NORMAL,reference(latest),null)));
        var past=budget(category.id(),"CHF",MONTH,month.minusMonths(1),"50");
        effectiveLimits.reset(owner(),new EffectiveLimitService.Input(category.id(),"CHF",MONTH,month.minusMonths(1),null,EffectiveLimitService.Scope.PERIOD,reference(latest),new BudgetDtos.Source(past.id(),past.version())));
        assertTrue(effectiveBudgets.report(owner(),MONTH,month.minusMonths(1)).comparisons().isEmpty());
        var session=login("owner@example.test");
        mvc.perform(get("/api/v1/budget-settings").session(session)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        mvc.perform(get("/api/v1/budgets/monthly-breakdown").session(session).param("categoryId",category.id().toString()).param("currency","CHF").param("year","2026")).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(12));
        mvc.perform(get("/api/v1/budget-settings")).andExpect(status().isUnauthorized());
    }
    @Test void normalHistoryArchiveRulesAndPromotionRollback() {
        org.mockito.Mockito.doReturn(LocalDate.of(2026,10,5)).when(businessTime).today();
        var category=categories.create(owner(),spending("Normal history",null));var month=LocalDate.of(2026,10,1);
        var normal=normalSettings.save(owner(),new BudgetSettingService.Input(category.id(),"CHF",BudgetSettingService.Mode.MONTH,"0",null));
        assertTrue(current(category.id()).hasActivity());
        categories.setActive(owner(),category.id(),version(current(category.id())),false);
        normal=normalSettings.save(owner(),new BudgetSettingService.Input(category.id(),"CHF",BudgetSettingService.Mode.MONTH,"1",reference(normal)));
        final var currentNormal=normal;
        assertEquals(409,assertThrows(CategoryFailure.class,()->normalSettings.save(owner(),new BudgetSettingService.Input(category.id(),"CHF",BudgetSettingService.Mode.YEAR,"2",reference(currentNormal)))).status());
        categories.setActive(owner(),category.id(),version(current(category.id())),true);
        var exception=budget(category.id(),"CHF",MONTH,month,"3");
        jdbc.update("ALTER TABLE audit_events ADD CONSTRAINT synthetic_normal_rollback CHECK(event_type <> 'BUDGET_DELETED')");
        try {assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->effectiveLimits.save(owner(),new EffectiveLimitService.Input(category.id(),"CHF",MONTH,month,"4",EffectiveLimitService.Scope.NORMAL,reference(currentNormal),new BudgetDtos.Source(exception.id(),exception.version()))));}
        finally {jdbc.update("ALTER TABLE audit_events DROP CONSTRAINT synthetic_normal_rollback");}
        money("1",normalSettings.list(owner()).items().getFirst().limit());money("3",comparison(category.id(),MONTH,month).limit());
        var latest=normalSettings.list(owner()).items().getFirst();normalSettings.save(owner(),new BudgetSettingService.Input(category.id(),"CHF",BudgetSettingService.Mode.NONE,null,reference(latest)));
        assertEquals(409,assertThrows(CategoryFailure.class,()->categories.delete(owner(),category.id(),version(current(category.id())))).status());
    }
    @Test void rollupsCoverageExactAmountsAndIndependentPeriods() {
        var a=account(); var root=categories.create(owner(),spending("Food",null)); var child=categories.create(owner(),spending("Groceries",root.id()));
        var other=categories.create(owner(),spending("Other",null));var month=LocalDate.of(2024,2,1);
        spend(a.getId(),root.id(),Kind.EXPENSE,"5",month);
        spend(a.getId(),child.id(),Kind.EXPENSE,"10.12345678",LocalDate.of(2024,2,29));
        spend(a.getId(),child.id(),Kind.REFUND,"2",LocalDate.of(2024,2,29));
        spend(a.getId(),null,Kind.INCOME,"1000",month);
        var destination=account();ledger.transfer(owner(),null,null,new TransferInput(a.getId(),destination.getId(),"1",month,"Synthetic excluded transfer",null));
        spend(a.getId(),null,Kind.EXPENSE,"3",month);spend(a.getId(),other.id(),Kind.EXPENSE,"4",month);
        spend(a.getId(),child.id(),Kind.EXPENSE,"100",LocalDate.of(2024,3,1));
        spend(a.getId(),child.id(),Kind.REFUND,"200",LocalDate.of(2023,12,31));
        var parent=budget(root.id(),"CHF",MONTH,month,"13.12345678");money("13.12345678",parent.actual());money("0",parent.remaining());assertFalse(parent.overBudget());assertEquals("100.00",parent.percentage());
        var sub=budget(child.id(),"CHF",MONTH,month,"0");assertTrue(sub.overBudget());assertNull(sub.percentage());money("-8.12345678",sub.remaining());
        var report=budgets.report(owner(),MONTH,month);var totals=report.currencies().getFirst();money("20.12345678",totals.netSpending());money("3",totals.uncategorized());money("7",totals.unbudgeted());
        var annual=budget(root.id(),"CHF",YEAR,LocalDate.of(2024,1,1),"1000");money("113.12345678",annual.actual());
        var eurAccount=accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic euro",AccountType.CASH,null,"EUR",BigDecimal.ZERO,LocalDate.of(2020,1,1)));
        spend(eurAccount.getId(),root.id(),Kind.EXPENSE,"7.00000001",month);
        var euro=budget(root.id(),"EUR",MONTH,month,"1");money("7.00000001",euro.actual());assertEquals(2,budgets.report(owner(),MONTH,month).currencies().size());
        assertEquals(409,assertThrows(CategoryFailure.class,()->budget(root.id(),"CHF",MONTH,month,"1")).status());
        var precise=budget(other.id(),"CHF",MONTH,LocalDate.of(2090,1,1),"99999999999999999999.12345678");assertEquals("99999999999999999999.12345678",precise.limit());
        assertEquals(ledger.today().withDayOfMonth(1),budgets.report(owner(),null,null).periodStart());
    }
    @Test void refundsCorrectionsDeletionArchivedAccountsAndNoLedgerChanges() {
        var a=account();var root=categories.create(owner(),spending("Food",null));var month=ledger.today().withDayOfMonth(1);
        spend(a.getId(),root.id(),Kind.EXPENSE,"1",ledger.today());spend(a.getId(),root.id(),Kind.REFUND,"3.00000001",ledger.today());
        var balance=accountService.detail(owner(),a.getId()).currentBalance();var worth=netWorth.current(owner()).currencies();var movements=jdbc.queryForObject("SELECT count(*) FROM ledger_movements",Integer.class);
        var b=budget(root.id(),"CHF",MONTH,month,"0");money("-2.00000001",b.actual());money("2.00000001",b.remaining());assertFalse(b.overBudget());
        budgets.update(owner(),b.id(),"\"0\"",new BudgetDtos.Limit("2"));
        assertEquals(balance,accountService.detail(owner(),a.getId()).currentBalance());assertEquals(worth,netWorth.current(owner()).currencies());assertEquals(movements,jdbc.queryForObject("SELECT count(*) FROM ledger_movements",Integer.class));
        accountService.setActive(owner(),a.getId(),"\"0\"",false);categories.setActive(owner(),root.id(),version(root),false);
        assertEquals(2,budgets.activity(owner(),b.id(),0).items().size());assertFalse(budgets.report(owner(),MONTH,month).items().getFirst().available());
        budgets.update(owner(),b.id(),"\"1\"",new BudgetDtos.Limit("1"));budgets.delete(owner(),b.id(),"\"2\"");
        assertTrue(current(root.id()).hasActivity());assertEquals(409,assertThrows(CategoryFailure.class,()->categories.delete(owner(),root.id(),"\"1\"")).status());
    }
    @Test void budgetReferencesPermanentlyLockSelectedAndParentCategories() {
        var root=categories.create(owner(),spending("Parent",null));var child=categories.create(owner(),spending("Child",root.id()));
        var b=budget(child.id(),"CHF",MONTH,LocalDate.of(2090,1,1),"0");budgets.delete(owner(),b.id(),"\"0\"");
        assertTrue(current(child.id()).hasActivity());assertTrue(current(root.id()).hasActivity());
        assertEquals(409,assertThrows(CategoryFailure.class,()->categories.update(owner(),child.id(),version(child),spending("Child",null))).status());
        assertEquals(409,assertThrows(CategoryFailure.class,()->categories.delete(owner(),child.id(),version(child))).status());
        var again=budget(child.id(),"CHF",MONTH,LocalDate.of(2090,1,1),"2");assertNotEquals(b.id(),again.id());
    }
    @Test void copyPreservesTargetsSkipsUnavailableAndRejectsStaleAtomically() {
        var a=categories.create(owner(),spending("A",null));var b=categories.create(owner(),spending("B",null));var c=categories.create(owner(),spending("C",null));
        var source=LocalDate.of(2024,1,1);var target=source.plusMonths(1);
        var ba=budget(a.id(),"CHF",MONTH,source,"10");var bb=budget(b.id(),"CHF",MONTH,source,"20");var bc=budget(c.id(),"CHF",MONTH,source,"30");
        budget(a.id(),"CHF",MONTH,target,"1");categories.setActive(owner(),b.id(),version(b),false);
        var copied=budgets.copy(owner(),new BudgetDtos.Copy(List.of(new BudgetDtos.Source(ba.id(),0),new BudgetDtos.Source(bb.id(),0),new BudgetDtos.Source(bc.id(),0)),target));
        assertEquals(1,copied.created().size());assertEquals(List.of("TARGET_EXISTS","CATEGORY_UNAVAILABLE"),copied.skipped().stream().map(BudgetDtos.Skip::reason).toList());money("30",copied.created().getFirst().limit());
        money("1",budgets.report(owner(),MONTH,target).items().stream().filter(x->x.categoryId().equals(a.id())).findFirst().orElseThrow().limit());
        budgets.update(owner(),bc.id(),"\"0\"",new BudgetDtos.Limit("31"));
        assertEquals(412,assertThrows(CategoryFailure.class,()->budgets.copy(owner(),new BudgetDtos.Copy(List.of(new BudgetDtos.Source(ba.id(),0),new BudgetDtos.Source(bc.id(),0)),source.plusMonths(2)))).status());
        assertTrue(budgets.report(owner(),MONTH,source.plusMonths(2)).items().isEmpty());
        assertThrows(IllegalArgumentException.class,()->budgets.copy(owner(),new BudgetDtos.Copy(List.of(new BudgetDtos.Source(ba.id(),0)),source)));
    }
    @Test void validatesCurrenciesCategoriesAndVersions() {
        var c=categories.create(owner(),spending("Spending",null));var start=LocalDate.of(2090,1,1);
        for(var currency:List.of("xyz","XYZ","EURO")) assertThrows(IllegalArgumentException.class,()->budget(c.id(),currency,MONTH,start,"1"));
        assertThrows(IllegalArgumentException.class,()->budget(c.id(),"CHF",MONTH,start,"-1"));
        var income=categories.create(owner(),new Input("Income",Type.INCOME,null));assertThrows(IllegalArgumentException.class,()->budget(income.id(),"CHF",MONTH,start,"1"));
        var b=budget(c.id(),"CHF",MONTH,start,"1");assertEquals(428,assertThrows(CategoryFailure.class,()->budgets.delete(owner(),b.id(),null)).status());assertEquals(400,assertThrows(CategoryFailure.class,()->budgets.delete(owner(),b.id(),"0")).status());
        budgets.update(owner(),b.id(),"\"0\"",new BudgetDtos.Limit("0"));assertEquals(412,assertThrows(CategoryFailure.class,()->budgets.delete(owner(),b.id(),"\"0\"")).status());
    }
    @Test void auditFailureRollsBackBudgetAndPermanentHistory() {
        var c=categories.create(owner(),spending("Rollback",null));
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT synthetic_budget_audit_failure CHECK(event_type <> 'BUDGET_CREATED') NOT VALID");
        try { assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->budget(c.id(),"CHF",MONTH,LocalDate.of(2090,1,1),"1"));assertFalse(current(c.id()).hasActivity());assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM spending_budgets",Integer.class)); }
        finally { jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT synthetic_budget_audit_failure"); }
    }
    @Test void apiRequiresSessionCsrfOwnershipAndVersionAndDisablesCaching() throws Exception {
        mvc.perform(get("/api/v1/budgets")).andExpect(status().isUnauthorized());var session=login("owner@example.test");var c=categories.create(owner(),spending("API",null));
        var body=mapper.writeValueAsString(new BudgetDtos.Input(c.id(),"CHF",MONTH,LocalDate.of(2090,1,1),"1"));
        mvc.perform(post("/api/v1/budgets").session(session).contentType("application/json").content(body)).andExpect(status().isForbidden());
        var result=mvc.perform(post("/api/v1/budgets").session(session).header("X-CSRF-TOKEN",csrf(session)).contentType("application/json").content(body)).andExpect(status().isCreated()).andReturn();var id=mapper.readTree(result.getResponse().getContentAsString()).get("id").asString();
        mvc.perform(get("/api/v1/budgets").session(session).param("periodType","MONTH").param("periodStart","2090-01-01")).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.items[0].limit").value("1.00000000"));
        mvc.perform(delete("/api/v1/budgets/"+id).session(session).header("X-CSRF-TOKEN",csrf(session))).andExpect(status().is(428));
        var other=users.findByEmail("budgets.other@example.test").orElseGet(()->users.save(new AppUser("budgets.other@example.test",encoder.encode("synthetic-password"))));var foreign=login(other.getEmail());
        var settingInput=new BudgetSettingService.Input(c.id(),"CHF",BudgetSettingService.Mode.MONTH,"100",null);
        mvc.perform(put("/api/v1/budget-settings").session(session).contentType("application/json").content(mapper.writeValueAsString(settingInput))).andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/budget-settings").session(foreign).header("X-CSRF-TOKEN",csrf(foreign)).contentType("application/json").content(mapper.writeValueAsString(settingInput))).andExpect(status().isNotFound());
        normalSettings.save(owner(),settingInput);
        mvc.perform(get("/api/v1/budget-settings").session(foreign)).andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        mvc.perform(get("/api/v1/budgets/monthly-breakdown").session(foreign).param("categoryId",c.id().toString()).param("currency","CHF").param("year","2026")).andExpect(status().isNotFound());
        var foreignInput=new EffectiveLimitService.Input(c.id(),"CHF",MONTH,LocalDate.of(2090,1,1),"2",EffectiveLimitService.Scope.PERIOD,null,null);
        mvc.perform(put("/api/v1/budgets/effective-limit").session(foreign).header("X-CSRF-TOKEN",csrf(foreign)).contentType("application/json").content(mapper.writeValueAsString(foreignInput))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/budgets/effective-limit").session(foreign).header("X-CSRF-TOKEN",csrf(foreign)).contentType("application/json").content(mapper.writeValueAsString(foreignInput))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/budgets/"+id+"/activity").session(foreign)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/spending").session(foreign)).andExpect(status().isOk())
            .andExpect(jsonPath("$.categories").isEmpty()).andExpect(jsonPath("$.currencies").isEmpty());
        mvc.perform(get("/api/v1/spending/activity").session(foreign).param("currency","CHF").param("categoryId",c.id().toString())).andExpect(status().isNotFound());

        mvc.perform(delete("/api/v1/budgets/"+id).session(foreign).header("X-CSRF-TOKEN",csrf(foreign)).header("If-Match","\"0\"")).andExpect(status().isNotFound());
        assertEquals(404,assertThrows(CategoryFailure.class,()->budgets.copy(other.getId(),new BudgetDtos.Copy(List.of(new BudgetDtos.Source(UUID.fromString(id),0)),LocalDate.of(2090,2,1)))).status());
    }
    @Test void concurrentCreatesSerializeWithCategoryMutations() throws Exception {
        var c=categories.create(owner(),spending("Concurrent",null));var owner=owner();var ready=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);
        org.mockito.Mockito.doAnswer(call->{call.callRealMethod();if(Thread.currentThread().getName().equals("synthetic-budget-create")){ready.countDown();assertTrue(release.await(15,java.util.concurrent.TimeUnit.SECONDS));}return null;}).when(categories).validateAssignment(owner,c.id(),null,false);
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var creating=executor.submit(()->{Thread.currentThread().setName("synthetic-budget-create");return budget(c.id(),"CHF",MONTH,LocalDate.of(2090,1,1),"1");});assertTrue(ready.await(15,java.util.concurrent.TimeUnit.SECONDS));
            var deleting=executor.submit(()->assertThrows(CategoryFailure.class,()->categories.delete(owner,c.id(),version(c))));
            try {assertThrows(java.util.concurrent.TimeoutException.class,()->deleting.get(100,java.util.concurrent.TimeUnit.MILLISECONDS));}finally {release.countDown();}
            assertNotNull(creating.get());assertEquals(409,deleting.get().status());
        }
    }
    @Test void correctionsDeletionAndPaginatedSupportingActivityRecalculateActuals() {
        var a=account();var c=categories.create(owner(),spending("Corrections",null));var start=ledger.today().withDayOfMonth(1);
        var op=ledger.transaction(owner(),null,null,new TransactionInput(a.getId(),Kind.EXPENSE,"2",ledger.today(),null,null,"Synthetic original",null,c.id()));
        var b=budget(c.id(),"CHF",MONTH,start,"2");assertFalse(b.overBudget());
        ledger.transaction(owner(),op.id(),"\"0\"",new TransactionInput(a.getId(),Kind.EXPENSE,"2.00000001",ledger.today(),null,null,"Synthetic correction",null,c.id()));
        var updated=budgets.report(owner(),MONTH,start).items().getFirst();assertTrue(updated.overBudget());money("-0.00000001",updated.remaining());
        ledger.transaction(owner(),op.id(),"\"1\"",new TransactionInput(a.getId(),Kind.EXPENSE,"2.00000001",ledger.today(),null,null,"Synthetic cleared",null,null));
        money("0",budgets.report(owner(),MONTH,start).items().getFirst().actual());money("2.00000001",budgets.report(owner(),MONTH,start).currencies().getFirst().unbudgeted());
        ledger.delete(owner(),op.id(),"\"2\"",false);assertTrue(budgets.report(owner(),MONTH,start).currencies().stream().allMatch(x->new BigDecimal(x.netSpending()).signum()==0));
        for(int i=0;i<51;i++) spend(a.getId(),c.id(),Kind.EXPENSE,"1",ledger.today());
        var page=budgets.activity(owner(),b.id(),0);assertEquals(50,page.items().size());assertTrue(page.hasMore());
        var last=budgets.activity(owner(),b.id(),1);assertEquals(1,last.items().size());assertFalse(last.hasMore());assertTrue(page.items().stream().noneMatch(x->x.id().equals(last.items().getFirst().id())));
        assertThrows(IllegalArgumentException.class,()->budgets.activity(owner(),b.id(),-1));
    }
    @Test void copyAuditFailureRollsBackEveryCreatedTarget() {
        var a=categories.create(owner(),spending("Copy A",null));var b=categories.create(owner(),spending("Copy B",null));var source=LocalDate.of(2090,1,1);var target=source.plusMonths(1);
        var first=budget(a.id(),"CHF",MONTH,source,"1");var second=budget(b.id(),"CHF",MONTH,source,"2");
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT synthetic_copy_audit_failure CHECK(event_type <> 'BUDGET_CREATED' OR details->'after'->>'categoryName' <> 'Copy B' OR details->'after'->>'periodStart' <> '2090-02-01') NOT VALID");
        try {assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->budgets.copy(owner(),new BudgetDtos.Copy(List.of(new BudgetDtos.Source(first.id(),0),new BudgetDtos.Source(second.id(),0)),target)));assertTrue(budgets.report(owner(),MONTH,target).items().isEmpty());assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM spending_budgets",Integer.class));}
        finally {jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT synthetic_copy_audit_failure");}
    }

}
