package com.example.wealthmaster.budgets;
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
class CategoryIntegrationTest {
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
        jdbc.update("DELETE FROM budget_setting_category_history"); jdbc.update("DELETE FROM budget_settings");
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
    @Test void validatesNamesTypesOwnershipAndTwoLevels() {
        var root=categories.create(owner(),spending(" Food ",null));assertEquals("Food",root.name());
        assertThrows(CategoryFailure.class,()->categories.create(owner(),spending("food",null)));
        assertThrows(IllegalArgumentException.class,()->categories.create(owner(),spending("   ",null)));
        assertThrows(IllegalArgumentException.class,()->categories.create(owner(),spending("a".repeat(101),null)));
        var child=categories.create(owner(),spending("Groceries",root.id()));
        assertThrows(IllegalArgumentException.class,()->categories.create(owner(),spending("Too deep",child.id())));
        assertThrows(IllegalArgumentException.class,()->categories.create(owner(),new Input("Wrong type",Type.INCOME,root.id())));
        assertThrows(CategoryFailure.class,()->categories.update(owner(),root.id(),version(root),spending("Food",root.id())));
        assertThrows(CategoryFailure.class,()->categories.update(owner(),root.id(),version(root),new Input("Food",Type.INCOME,null)));
        categories.create(owner(),new Input("Food",Type.INCOME,null));
        var other=users.findByEmail("categories.other@example.test").orElseGet(()->users.save(new AppUser("categories.other@example.test",encoder.encode("synthetic-password"))));
        var foreign=categories.create(other.getId(),spending("Foreign",null));
        assertEquals(404,assertThrows(CategoryFailure.class,()->categories.create(owner(),spending("Child",foreign.id()))).status());
        assertEquals(404,assertThrows(CategoryFailure.class,()->categories.delete(owner(),foreign.id(),version(foreign))).status());
    }
    @Test void ledgerAssignmentRefundsAndClearingPreserveBalancesAndPermanentHistory() {
        var a=account();var root=categories.create(owner(),spending("Food",null));var child=categories.create(owner(),spending("Groceries",root.id()));
        var op=ledger.transaction(owner(),null,null,entry(a.getId(),Kind.EXPENSE,child.id()));
        assertEquals("Food",op.category().parentName());assertEquals(child.id(),op.categoryId());
        var before=accountService.detail(owner(),a.getId()).currentBalance();var worth=netWorth.current(owner()).currencies().getFirst().netWorth();
        var recategorized=ledger.transaction(owner(),op.id(),"\"0\"",entry(a.getId(),Kind.EXPENSE,root.id()));
        assertEquals(before,accountService.detail(owner(),a.getId()).currentBalance());assertEquals(worth,netWorth.current(owner()).currencies().getFirst().netWorth());
        assertThrows(CategoryFailure.class,()->categories.delete(owner(),child.id(),version(child)));
        assertThrows(CategoryFailure.class,()->categories.update(owner(),child.id(),version(child),spending("Groceries",null)));
        var cleared=ledger.transaction(owner(),op.id(),"\"1\"",entry(a.getId(),Kind.EXPENSE,null));assertNull(cleared.category());
        ledger.delete(owner(),op.id(),"\"2\"",false);
        assertTrue(current(child.id()).hasActivity());assertTrue(current(root.id()).hasActivity());
        assertThrows(CategoryFailure.class,()->categories.delete(owner(),root.id(),version(root)));
        var refund=ledger.transaction(owner(),null,null,entry(a.getId(),Kind.REFUND,child.id()));
        assertEquals(child.id(),refund.categoryId());assertEquals(0,new BigDecimal("110.00000001").compareTo(new BigDecimal(accountService.detail(owner(),a.getId()).currentBalance())));
        var income=categories.create(owner(),new Input("Salary",Type.INCOME,null));
        assertThrows(IllegalArgumentException.class,()->ledger.transaction(owner(),null,null,entry(a.getId(),Kind.INCOME,child.id())));
        assertThrows(IllegalArgumentException.class,()->ledger.transaction(owner(),null,null,entry(a.getId(),Kind.REFUND,income.id())));
        var ownedIncome=ledger.transaction(owner(),null,null,entry(a.getId(),Kind.INCOME,income.id()));assertEquals(income.id(),ownedIncome.categoryId());
        var b=account();assertNull(ledger.transfer(owner(),null,null,new TransferInput(a.getId(),b.getId(),"1",ledger.today(),"Synthetic transfer",null)).category());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='LEDGER_UPDATED' AND details->'before'->'category'->>'name'='Groceries'",Integer.class));
    }
    @Test void archivedBranchesKeepAssignmentsButCannotReceiveNewOnes() {
        var a=account();var root=categories.create(owner(),spending("Food",null));var child=categories.create(owner(),spending("Groceries",root.id()));
        var op=ledger.transaction(owner(),null,null,entry(a.getId(),Kind.EXPENSE,child.id()));
        var archived=categories.setActive(owner(),root.id(),version(root),false);assertFalse(current(child.id()).available());assertTrue(current(child.id()).active());
        assertThrows(CategoryFailure.class,()->ledger.transaction(owner(),null,null,entry(a.getId(),Kind.EXPENSE,child.id())));
        assertThrows(CategoryFailure.class,()->categories.create(owner(),spending("Dining",root.id())));
        var renamed=categories.update(owner(),child.id(),version(child),spending("Shopping",root.id()));
        var updated=ledger.transaction(owner(),op.id(),"\"0\"",entry(a.getId(),Kind.REFUND,child.id()));assertEquals("Shopping",updated.category().name());assertFalse(updated.category().available());
        assertThrows(IllegalArgumentException.class,()->ledger.transaction(owner(),op.id(),"\"1\"",entry(a.getId(),Kind.INCOME,child.id())));
        categories.setActive(owner(),child.id(),version(renamed),false);categories.setActive(owner(),root.id(),version(archived),true);assertFalse(current(child.id()).available());
        categories.setActive(owner(),child.id(),version(current(child.id())),true);assertTrue(current(child.id()).available());
        ledger.transaction(owner(),op.id(),"\"1\"",entry(a.getId(),Kind.REFUND,null));
    }
    @Test void unusedCategoriesCanMoveChangeTypeAndDeleteWithVersionChecks() {
        var a=categories.create(owner(),spending("Unused",null));var p=categories.create(owner(),spending("Parent",null));
        assertEquals(428,assertThrows(CategoryFailure.class,()->categories.update(owner(),a.id(),null,spending("Changed",null))).status());
        assertEquals(400,assertThrows(CategoryFailure.class,()->categories.delete(owner(),a.id(),"0")).status());
        var moved=categories.update(owner(),a.id(),version(a),spending("Unused",p.id()));
        assertEquals(412,assertThrows(CategoryFailure.class,()->categories.delete(owner(),aId(),"\"0\"")).status());
        var changed=categories.update(owner(),moved.id(),version(moved),new Input("Unused",Type.INCOME,null));categories.delete(owner(),changed.id(),version(changed));
        categories.delete(owner(),p.id(),version(p));assertTrue(categories.list(owner()).items().isEmpty());
    }
    UUID aId() { return categories.list(owner()).items().stream().filter(c->c.name().equals("Unused")).findFirst().orElseThrow().id(); }
    @Test void starterSetIsAtomicOptionalAndOnlyInstalledOnce() {
        assertTrue(categories.list(owner()).starterSetAvailable());var installed=categories.starterSet(owner());assertEquals(14,installed.items().size());assertFalse(installed.starterSetAvailable());
        assertThrows(CategoryFailure.class,()->categories.starterSet(owner()));
        for(var c:installed.items().stream().filter(c->c.parentId()!=null).toList()) categories.delete(owner(),c.id(),version(c));
        for(var c:installed.items().stream().filter(c->c.parentId()==null).toList()) categories.delete(owner(),c.id(),version(c));
        assertFalse(categories.list(owner()).starterSetAvailable());assertThrows(CategoryFailure.class,()->categories.starterSet(owner()));
    }
    @Test void apiEnforcesOwnershipCsrfAndIfMatch() throws Exception {
        mvc.perform(get("/api/v1/categories")).andExpect(status().isUnauthorized());var session=login("owner@example.test");
        mvc.perform(post("/api/v1/categories").session(session).contentType("application/json").content("{\"name\":\"Synthetic\",\"type\":\"SPENDING\"}")).andExpect(status().isForbidden());
        var result=mvc.perform(post("/api/v1/categories").session(session).header("X-CSRF-TOKEN",csrf(session)).contentType("application/json").content("{\"name\":\"Synthetic\",\"type\":\"SPENDING\"}" )).andExpect(status().isCreated()).andReturn();
        var id=mapper.readTree(result.getResponse().getContentAsString()).get("id").asString();
        mvc.perform(post("/api/v1/categories/"+id+"/archive").session(session).header("X-CSRF-TOKEN",csrf(session))).andExpect(status().is(428));
        mvc.perform(post("/api/v1/categories/"+id+"/archive").session(session).header("X-CSRF-TOKEN",csrf(session)).header("If-Match","\"0\"")).andExpect(status().isOk());
        mvc.perform(delete("/api/v1/categories/"+id).session(session).header("X-CSRF-TOKEN",csrf(session)).header("If-Match","\"0\"")).andExpect(status().is(412));
        var other=users.findByEmail("categories.other@example.test").orElseGet(()->users.save(new AppUser("categories.other@example.test",encoder.encode("synthetic-password"))));
        var otherSession=login(other.getEmail());mvc.perform(get("/api/v1/categories").session(otherSession).param("userId",owner().toString())).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(delete("/api/v1/categories/"+id).session(otherSession).header("X-CSRF-TOKEN",csrf(otherSession)).header("If-Match","\"1\"")).andExpect(status().isNotFound());
        var foreign=categories.create(other.getId(),spending("Foreign",null));var a=account();
        assertEquals(404,assertThrows(CategoryFailure.class,()->ledger.transaction(owner(),null,null,entry(a.getId(),Kind.EXPENSE,foreign.id()))).status());
    }
    @Test void auditFailureRollsBackCategoryAndStarterCreation() {
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT synthetic_category_audit_failure CHECK(event_type <> 'CATEGORY_CREATED' OR details->'after'->>'name' <> 'Groceries') NOT VALID");
        try {assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->categories.starterSet(owner()));assertTrue(categories.list(owner()).items().isEmpty());assertTrue(categories.list(owner()).starterSetAvailable());}
        finally {jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT synthetic_category_audit_failure");}
    }
    @Test void ledgerAuditFailureRollsBackAssignmentHistoryAndBalance() {
        var a=account();var root=categories.create(owner(),spending("Food",null));var child=categories.create(owner(),spending("Groceries",root.id()));
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT synthetic_ledger_category_failure CHECK(event_type <> 'LEDGER_CREATED') NOT VALID");
        try {assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->ledger.transaction(owner(),null,null,entry(a.getId(),Kind.EXPENSE,child.id())));assertFalse(current(child.id()).hasActivity());assertFalse(current(root.id()).hasActivity());assertEquals("100.00000000",accountService.detail(owner(),a.getId()).currentBalance());assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));}
        finally {jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT synthetic_ledger_category_failure");}
    }
    @Test void concurrentStarterRequestsCreateOneSet() throws Exception {
        var owner=owner();try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var gate=new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.Callable<Boolean> install=()->{gate.await();try{categories.starterSet(owner);return true;}catch(CategoryFailure e){assertEquals(409,e.status());return false;}};
            var first=executor.submit(install);var second=executor.submit(install);gate.countDown();assertNotEquals(first.get(),second.get());assertEquals(14,categories.list(owner).items().size());
        }
    }
    @Test void assignmentSerializesWithCategoryArchiveAndDeletion() throws Exception {
        for(boolean deleting:List.of(false,true)) {
            var owner=owner();var a=account();var category=categories.create(owner,spending(deleting?"Delete race":"Archive race",null));
            var validated=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);
            org.mockito.Mockito.doAnswer(call->{call.callRealMethod();if(Thread.currentThread().getName().equals("synthetic-category-assignment")){validated.countDown();assertTrue(release.await(15,java.util.concurrent.TimeUnit.SECONDS));}return null;}).when(categories).validateAssignment(org.mockito.ArgumentMatchers.eq(owner),org.mockito.ArgumentMatchers.eq(category.id()),org.mockito.ArgumentMatchers.isNull(),org.mockito.ArgumentMatchers.eq(false));
            try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
                var assigning=executor.submit(()->{Thread.currentThread().setName("synthetic-category-assignment");return ledger.transaction(owner,null,null,entry(a.getId(),Kind.EXPENSE,category.id()));});assertTrue(validated.await(15,java.util.concurrent.TimeUnit.SECONDS));
                var changing=executor.submit(()->{if(deleting){try{categories.delete(owner,category.id(),version(category));return 204;}catch(CategoryFailure e){return e.status();}}categories.setActive(owner,category.id(),version(category),false);return 200;});
                try {assertThrows(java.util.concurrent.TimeoutException.class,()->changing.get(100,java.util.concurrent.TimeUnit.MILLISECONDS));}finally {release.countDown();}
                assertEquals(category.id(),assigning.get(15,java.util.concurrent.TimeUnit.SECONDS).categoryId());assertEquals(deleting?409:200,changing.get(15,java.util.concurrent.TimeUnit.SECONDS));assertTrue(current(category.id()).hasActivity());
            }
        }
    }
}
