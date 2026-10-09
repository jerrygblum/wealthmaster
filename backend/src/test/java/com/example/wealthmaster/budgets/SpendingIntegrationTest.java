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
class SpendingIntegrationTest {
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
    @Autowired SpendingService spendingReport;
    @Autowired PreferencesService preferences;
    void spend(UUID account,UUID category,Kind kind,String amount,LocalDate date) {
        ledger.transaction(owner(),null,null,new TransactionInput(account,kind,amount,date,null,null,"Synthetic spending",null,category));
    }
    void money(String expected,String actual) {assertEquals(0,new BigDecimal(expected).compareTo(new BigDecimal(actual)));}
    @Test void spendingGrossRollupsRefundsAndBoundaries() throws Exception {
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
        assertEquals(3,report.categories().size());
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

    @Test void refundsCurrenciesCorrectionsAndActivityPagination() {
        var a=account();var root=categories.create(owner(),spending("Food",null));var month=LocalDate.of(2024,2,1);
        spend(a.getId(),root.id(),Kind.REFUND,"20",month);
        var usd=accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic USD cash",AccountType.CASH,null,"USD",BigDecimal.ZERO,LocalDate.of(2020,1,1)));
        spend(usd.getId(),root.id(),Kind.EXPENSE,"7.12345678",month);
        var report=spendingReport.report(owner(),MONTH,month);assertEquals(2,report.currencies().size());
        money("7.12345678",report.currencies().get(1).netSpending());
        for(int i=0;i<51;i++)spend(a.getId(),root.id(),Kind.EXPENSE,"1",month);
        var first=spendingReport.activity(owner(),MONTH,month,"CHF",root.id(),0);assertEquals(50,first.items().size());assertTrue(first.hasMore());
        assertEquals(2,spendingReport.activity(owner(),MONTH,month,"CHF",root.id(),1).items().size());
        var op=first.items().getFirst();ledger.transaction(owner(),op.id(),"\"0\"",new TransactionInput(a.getId(),Kind.EXPENSE,"7",month,null,null,"Synthetic correction",null,null));
        money("7",spendingReport.report(owner(),MONTH,month).currencies().getFirst().uncategorized());
        ledger.delete(owner(),op.id(),"\"1\"",false);money("50",spendingReport.report(owner(),MONTH,month).currencies().getFirst().expenses());
    }
    @Test void archivedSpendingExcludesTransfersAndLeavesBalancesUnchanged() {
        var a=account();var root=categories.create(owner(),spending("Food",null));var child=categories.create(owner(),spending("Child",root.id()));
        spend(a.getId(),child.id(),Kind.EXPENSE,"1",ledger.today());
        spend(a.getId(),child.id(),Kind.REFUND,"3",ledger.today());
        ledger.transfer(owner(),null,null,new TransferInput(a.getId(),account().getId(),"5",ledger.today(),"Synthetic excluded transfer",null));
        var balances=accountService.detail(owner(),a.getId()).currentBalance();var worth=netWorth.current(owner()).currencies();
        categories.setActive(owner(),root.id(),version(current(root.id())),false);accountService.setActive(owner(),a.getId(),"\"0\"",false);
        var report=spendingReport.report(owner(),MONTH,ledger.today().withDayOfMonth(1));
        assertFalse(report.categories().stream().filter(c->c.id().equals(root.id())).findFirst().orElseThrow().available());money("-2",report.currencies().getFirst().netSpending());
        assertEquals(balances,accountService.detail(owner(),a.getId()).currentBalance());assertEquals(worth,netWorth.current(owner()).currencies());
    }
    @Test void currencyPreferenceChangesAreVersionedAndDoNotAffectSpending() {
        var root=categories.create(owner(),spending("Food",null));
        spend(account().getId(),root.id(),Kind.EXPENSE,"40",ledger.today());
        var before=spendingReport.report(owner(),null,null);
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT synthetic_preference_failure CHECK(event_type <> 'DEFAULT_CURRENCY_CHANGED') NOT VALID");
        try {assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->preferences.save(owner(),new PreferencesService.Input("EUR",0L)));}
        finally {jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT synthetic_preference_failure");}
        assertEquals("CHF",preferences.get(owner()).defaultCurrency());
        var after=preferences.save(owner(),new PreferencesService.Input("EUR",0L));assertEquals("EUR",after.defaultCurrency());
        assertEquals(before,spendingReport.report(owner(),null,null));
        assertEquals(412,assertThrows(CategoryFailure.class,()->preferences.save(owner(),new PreferencesService.Input("USD",0L))).status());
    }
    @Test void apiOwnershipCachingAndRetiredRoutes() throws Exception {
        var root=categories.create(owner(),spending("Food",null));
        spend(account().getId(),root.id(),Kind.EXPENSE,"40",ledger.today());
        var other=users.findByEmail("spending.other@example.test").orElseGet(()->users.save(new AppUser("spending.other@example.test",encoder.encode("synthetic-password"))));
        var foreign=login(other.getEmail());var session=login("owner@example.test");
        mvc.perform(get("/api/v1/spending").session(foreign)).andExpect(status().isOk()).andExpect(jsonPath("$.currencies.length()").value(0)).andExpect(jsonPath("$.categories.length()").value(0));
        mvc.perform(get("/api/v1/spending/activity").session(foreign).param("currency","CHF").param("categoryId",root.id().toString())).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/users/me/preferences").session(session)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.hasLimitsToReset").doesNotExist());
        mvc.perform(get("/api/v1/spending").session(session)).andExpect(jsonPath("$.limits").doesNotExist()).andExpect(jsonPath("$.currencies[0].unbudgeted").doesNotExist());
        for(var route:List.of("/api/v1/budget-settings","/api/v1/budgets","/api/v1/budgets/monthly-breakdown","/api/v1/budgets/effective-limit"))mvc.perform(get(route).session(session)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/spending").session(session).param("periodType","YEAR").param("periodStart","2024-02-01")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/spending/activity").session(session).param("currency","INVALID")).andExpect(status().isBadRequest());
    }
    @Test void businessDateCutoffAndEmptyFuturePeriods() {
        jdbc.update("DELETE FROM user_preferences");
        var a=account();var today=ledger.today();
        spend(a.getId(),null,Kind.EXPENSE,"2",today);
        var future=ledger.transaction(owner(),null,null,new TransactionInput(a.getId(),Kind.EXPENSE,"7",today.plusDays(1),null,null,"Synthetic future fixture",null,null));
        var report=spendingReport.report(owner(),null,null);
        assertEquals(today.withDayOfMonth(1),report.periodStart());money("2",report.currencies().getFirst().expenses());
        money("2",spendingReport.report(owner(),YEAR,today.withDayOfYear(1)).currencies().getFirst().expenses());
        assertTrue(spendingReport.report(owner(),MONTH,today.withDayOfMonth(1).plusMonths(1)).currencies().isEmpty());
        assertEquals(1,spendingReport.activity(owner(),null,null,"CHF",null,0).items().size());
    }
    @Test void openingDateCorrectionsAndLedgerMutationsImmediatelyRecalculateReports() {
        var january=LocalDate.of(2026,1,1);var march=LocalDate.of(2026,3,1);
        var a=accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic baseline",AccountType.CASH,null,"CHF",new BigDecimal("100"),march));
        var category=categories.create(owner(),spending("Synthetic food",null));
        var op=ledger.transaction(owner(),null,null,new TransactionInput(a.getId(),Kind.EXPENSE,"12",january.plusDays(14),null,null,"Synthetic January purchase",null,category.id()));
        money("12",spendingReport.report(owner(),MONTH,january).currencies().getFirst().netSpending());
        money("88",netWorth.current(owner()).currencies().getFirst().netWorth());
        var changed=accountService.update(owner(),a.getId(),"\"0\"",new AccountDtos.CreateAccount(a.getName(),AccountType.CASH,null,"CHF","100",AccountDtos.BalanceMeaning.BALANCE,january));
        assertEquals(january,changed.openingDate());money("88",changed.currentBalance());
        money("88",netWorth.current(owner()).currencies().getFirst().netWorth());
        assertEquals(412,assertThrows(AccountFailure.class,()->accountService.update(owner(),a.getId(),"\"0\"",new AccountDtos.CreateAccount(a.getName(),AccountType.CASH,null,"CHF","100",AccountDtos.BalanceMeaning.BALANCE,march))).status());
        var edited=ledger.transaction(owner(),op.id(),"\"0\"",new TransactionInput(a.getId(),Kind.EXPENSE,"20",january.plusDays(14),null,null,"Synthetic corrected purchase",null,category.id()));
        money("80",netWorth.current(owner()).currencies().getFirst().netWorth());
        money("20",spendingReport.report(owner(),MONTH,january).currencies().getFirst().netSpending());
        ledger.delete(owner(),edited.id(),"\"1\"",false);
        money("100",netWorth.current(owner()).currencies().getFirst().netWorth());
        assertTrue(spendingReport.report(owner(),MONTH,january).currencies().isEmpty());
        assertTrue(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='ACCOUNT_UPDATED'",Integer.class)>0);
    }
    @Test void migrationsRemoveBudgetingAndPreserveLedgerCategoriesPreferencesAndAudit() throws Exception {
        var root=categories.create(owner(),spending("Food",null));
        var child=categories.create(owner(),spending("Groceries",root.id()));
        spend(account().getId(),child.id(),Kind.EXPENSE,"40",ledger.today());
        var schema="subcategory_cleanup_"+UUID.randomUUID().toString().replace("-","");
        try(var connection=jdbc.getDataSource().getConnection()) {
            var source=new org.springframework.jdbc.datasource.SingleConnectionDataSource(connection,true);
            var db=new JdbcTemplate(source);
            try {
                org.flywaydb.core.Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("9").load().migrate();
                db.execute("SET search_path TO "+schema);
                for(var table:List.of("app_users","financial_accounts","categories","ledger_operations","ledger_movements","ledger_account_history","ledger_category_history","user_preferences","audit_events"))
                    db.execute("INSERT INTO "+schema+"."+table+" SELECT "+(table.equals("app_users")?"id,email,password_hash,created_at":"*")+" FROM public."+table);
                var rootBudget=UUID.randomUUID();
                db.update("INSERT INTO spending_budgets(id,owner_id,category_id,currency,period_type,period_start,amount) VALUES(?,?,?,'CHF','YEAR',DATE '2024-01-01',80)",rootBudget,owner(),root.id());
                db.update("INSERT INTO budget_category_history(budget_id,category_id) VALUES(?,?)",rootBudget,root.id());
                var settingId=UUID.randomUUID();
                db.update("INSERT INTO budget_settings(id,owner_id,category_id,currency,mode,amount) VALUES(?,?,?,'CHF','YEAR',1200)",settingId,owner(),root.id());
                db.update("INSERT INTO budget_setting_category_history(setting_id,category_id) VALUES(?,?)",settingId,root.id());
                db.update("INSERT INTO budget_setting_revisions(id,setting_id,version,period_type,effective_from,amount) VALUES(?,?,0,'YEAR',DATE '2024-01-01',1200)",UUID.randomUUID(),settingId);
                var otherOwner=UUID.randomUUID();var otherRoot=UUID.randomUUID();var otherChild=UUID.randomUUID();var archivedChild=UUID.randomUUID();
                db.update("INSERT INTO app_users(id,email,password_hash,created_at) VALUES(?,'cleanup@example.test','synthetic-unused-hash',CURRENT_TIMESTAMP)",otherOwner);
                db.update("INSERT INTO categories(id,owner_id,name,type) VALUES(?,?,'Other owner main','SPENDING')",otherRoot,otherOwner);
                db.update("INSERT INTO categories(id,owner_id,name,type,parent_id) VALUES(?,?,'Other owner child','SPENDING',?)",otherChild,otherOwner,otherRoot);
                db.update("INSERT INTO categories(id,owner_id,name,type,parent_id,active) VALUES(?,?,'Archived child','SPENDING',?,FALSE)",archivedChild,owner(),root.id());
                var children=List.of(child.id(),archivedChild,otherChild);
                for(int index=0;index<children.size();index++) {
                    var id=children.get(index);var user=index==2?otherOwner:owner();var parent=index==2?otherRoot:root.id();
                    for(var currency:List.of("CHF","EUR")) {
                        for(var type:List.of("MONTH","YEAR")) {
                            for(var deleted:List.of(false,true)) {
                                var budgetId=UUID.randomUUID();
                                db.update("INSERT INTO spending_budgets(id,owner_id,category_id,currency,period_type,period_start,amount,deleted) VALUES(?,?,?,?,?,?,0,?)",budgetId,user,id,currency,type,LocalDate.of(deleted?2024:2090,1,1),deleted);
                                db.update("INSERT INTO budget_category_history(budget_id,category_id) VALUES(?,?),(?,?)",budgetId,id,budgetId,parent);
                                db.update("INSERT INTO audit_events(id,actor_id,event_type,resource_id) VALUES(?,?,'BUDGET_CREATED',?)",UUID.randomUUID(),user,budgetId);
                            }
                        }
                        var childSetting=UUID.randomUUID();var mode=List.of("NONE","MONTH","YEAR").get(index);
                        db.update("INSERT INTO budget_settings(id,owner_id,category_id,currency,mode,amount) VALUES(?,?,?,?,?,?)",childSetting,user,id,currency,mode,index==0?null:BigDecimal.ZERO);
                        db.update("INSERT INTO budget_setting_category_history(setting_id,category_id) VALUES(?,?),(?,?)",childSetting,id,childSetting,parent);
                        for(var type:List.of("MONTH","YEAR"))
                            db.update("INSERT INTO budget_setting_revisions(id,setting_id,version,period_type,effective_from,amount) VALUES(?,?,0,?,DATE '2024-01-01',?)",UUID.randomUUID(),childSetting,type,mode.equals(type)?BigDecimal.ZERO:null);
                    }
                }
                var preserved=new java.util.LinkedHashMap<String,List<java.util.Map<String,Object>>>();
                for(var table:List.of("app_users","financial_accounts","categories","ledger_operations","ledger_movements","ledger_account_history","ledger_category_history","user_preferences","audit_events"))
                    preserved.put(table,db.queryForList("SELECT * FROM "+table+" ORDER BY 1,2"));
                var limits=new java.util.LinkedHashMap<String,List<java.util.Map<String,Object>>>();
                for(var table:List.of("spending_budgets","budget_category_history","budget_settings","budget_setting_revisions","budget_setting_category_history")) {
                    String condition=table.startsWith("budget_setting")?(table.equals("budget_settings")?"id":"setting_id"):table.equals("spending_budgets")?"id":"budget_id";
                    String heads=table.startsWith("budget_setting")?"budget_settings":"spending_budgets";
                    limits.put(table,db.queryForList("SELECT * FROM "+table+" WHERE "+condition+" IN (SELECT id FROM "+heads+" WHERE category_id IN (SELECT id FROM categories WHERE parent_id IS NULL)) ORDER BY 1,2"));
                }
                org.flywaydb.core.Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("10").load().migrate();
                db.execute("SET search_path TO "+schema);
                for(var entry:preserved.entrySet()) assertEquals(entry.getValue(),db.queryForList("SELECT "+(entry.getKey().equals("app_users")?"id,email,password_hash,created_at":"*")+" FROM "+entry.getKey()+" ORDER BY 1,2"),entry.getKey());
                for(var entry:limits.entrySet()) assertEquals(entry.getValue(),db.queryForList("SELECT "+(entry.getKey().equals("app_users")?"id,email,password_hash,created_at":"*")+" FROM "+entry.getKey()+" ORDER BY 1,2"),entry.getKey());
                assertEquals(0,db.queryForObject("SELECT count(*) FROM spending_budgets b JOIN categories c ON c.id=b.category_id WHERE c.parent_id IS NOT NULL",Integer.class));
                assertEquals(0,db.queryForObject("SELECT count(*) FROM budget_settings s JOIN categories c ON c.id=s.category_id WHERE c.parent_id IS NOT NULL",Integer.class));
                var heads=db.queryForList("SELECT * FROM budget_settings ORDER BY 1,2");
                var references=db.queryForList("SELECT * FROM budget_setting_category_history ORDER BY 1,2");
                org.flywaydb.core.Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("11").load().migrate();
                db.execute("SET search_path TO "+schema);
                assertEquals(heads,db.queryForList("SELECT * FROM budget_settings ORDER BY 1,2"));
                assertEquals(references,db.queryForList("SELECT * FROM budget_setting_category_history ORDER BY 1,2"));
                org.flywaydb.core.Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).load().migrate();
                db.execute("SET search_path TO "+schema);
                for(var table:List.of("spending_budgets","budget_category_history","budget_settings","budget_setting_revisions","budget_setting_category_history"))
                    assertNull(db.queryForObject("SELECT to_regclass(?)",String.class,schema+"."+table));
                for(var entry:preserved.entrySet()) assertEquals(entry.getValue(),db.queryForList("SELECT "+(entry.getKey().equals("app_users")?"id,email,password_hash,created_at":"*")+" FROM "+entry.getKey()+" ORDER BY 1,2"),entry.getKey());

                assertEquals(1,db.queryForObject("SELECT count(*) FROM app_users WHERE role='OWNER'",Integer.class));
                assertFalse(Boolean.TRUE.equals(db.queryForObject("SELECT enabled FROM registration_settings WHERE id=1",Boolean.class)));
            } finally {
                db.execute("SET search_path TO public");
                db.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
            }
        }
    }

}
