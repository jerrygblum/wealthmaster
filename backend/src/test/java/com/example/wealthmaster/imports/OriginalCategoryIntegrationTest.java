package com.example.wealthmaster.imports;
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
class OriginalCategoryIntegrationTest {
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
    @Autowired OriginalCategoryService originals;
    @Autowired LedgerService ledger;
    @Autowired NetWorthService netWorth;
    @Autowired AccountService accountService;
    UUID owner() { return users.findByEmail("owner@example.test").orElseThrow().getId(); }
    FinancialAccount account() { return accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic cash",AccountType.CASH,null,"CHF",new BigDecimal("100"),LocalDate.of(2020,1,1))); }
    Input spending(String name, UUID parent) { return new Input(name,Type.SPENDING,parent); }
    String version(Category c) { return "\"" + c.version() + "\""; }
    TransactionInput entry(UUID a, Kind kind, UUID category) { return new TransactionInput(a,kind,"10.00000001",ledger.today(),null,null,"Synthetic activity",null,category); }
    Category current(UUID id) { return categories.list(owner()).items().stream().filter(c->c.id().equals(id)).findFirst().orElseThrow(); }
    Operation original(FinancialAccount account,Kind kind,String label,UUID category) {
        return ledger.transaction(owner(),null,null,new TransactionInput(account.getId(),kind,"10.00000001",ledger.today(),null,null,"Synthetic purchase | Original category: "+label,"Synthetic notes",category));
    }
    OriginalCategoryService.Mapping mapping(String label,Type type,Category category,boolean include,Operation... operations) {
        return new OriginalCategoryService.Mapping(label,type,category.id(),category.version(),include,
            java.util.Arrays.stream(operations).map(o->new CategoryChange(o.id(),o.version())).toList());
    }
    @Test void groupsAcrossAccountsSeparatesIncomeAndExcludesTransfersDeletedAndOtherOwners() {
        var a=account();var b=accounts.saveAndFlush(new FinancialAccount(owner(),"Synthetic second",AccountType.CASH,null,"CHF",BigDecimal.ZERO,LocalDate.of(2020,1,1)));
        original(a,Kind.EXPENSE,"Legacy",null);original(b,Kind.REFUND,"Legacy",null);original(a,Kind.INCOME,"Legacy",null);
        ledger.transfer(owner(),null,null,new TransferInput(a.getId(),b.getId(),"5",ledger.today(),"Original category: Transfer label",null));
        var deleted=original(a,Kind.EXPENSE,"Deleted",null);ledger.delete(owner(),deleted.id(),"\"0\"",false);
        ledger.transaction(owner(),null,null,entry(a.getId(),Kind.EXPENSE,null));
        var other=users.findByEmail("original.other@example.test").orElseGet(()->users.save(new AppUser("original.other@example.test",encoder.encode("synthetic-password"))));
        var foreignAccount=accounts.saveAndFlush(new FinancialAccount(other.getId(),"Synthetic foreign",AccountType.CASH,null,"CHF",BigDecimal.ZERO,LocalDate.of(2020,1,1)));
        ledger.transaction(other.getId(),null,null,new TransactionInput(foreignAccount.getId(),Kind.EXPENSE,"1",ledger.today(),null,null,"Original category: Private",null,null));
        var groups=originals.groups(owner());assertEquals(2,groups.size());
        var spending=groups.stream().filter(g->g.type()==Type.SPENDING).findFirst().orElseThrow();
        assertEquals("Legacy",spending.originalCategory());assertEquals(2,spending.uncategorizedCount());assertEquals(2,spending.transactions().size());
        assertEquals(1,originals.groups(other.getId()).size());
    }
    @Test void categoryOnlyMappingPreservesBalancesDescriptionsSourceAndArchivedAccountHistory() {
        var a=account();var op=original(a,Kind.EXPENSE,"Food",null);var refund=original(a,Kind.REFUND,"Food",null);
        var category=categories.create(owner(),spending("Groceries",null));
        var movements=jdbc.queryForList("SELECT id,amount FROM ledger_movements ORDER BY id");
        var balance=accountService.detail(owner(),a.getId()).currentBalance();
        a.setActive(false);accounts.saveAndFlush(a);
        assertEquals(2,originals.apply(owner(),mapping("Food",Type.SPENDING,category,false,op,refund)).updated());
        assertEquals(movements,jdbc.queryForList("SELECT id,amount FROM ledger_movements ORDER BY id"));
        assertEquals(balance,accountService.detail(owner(),a.getId()).currentBalance());
        var group=originals.groups(owner()).getFirst();assertEquals(0,group.uncategorizedCount());
        assertTrue(group.transactions().stream().allMatch(o->o.version()==1 && o.categoryId().equals(category.id())));
        assertEquals(op.description(),group.transactions().stream().filter(o->o.id().equals(op.id())).findFirst().orElseThrow().description());
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='LEDGER_UPDATED'",Integer.class));
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM ledger_category_history WHERE category_id=?",Integer.class,category.id()));
    }
    @Test void staleVersionsWrongGroupsWrongTypesAndExistingAssignmentsCannotPartiallyApply() {
        var a=account();var first=original(a,Kind.EXPENSE,"Food",null);var second=original(a,Kind.EXPENSE,"Food",null);
        var target=categories.create(owner(),spending("Groceries",null));
        ledger.transaction(owner(),second.id(),"\"0\"",new TransactionInput(a.getId(),Kind.EXPENSE,"12",ledger.today(),null,null,second.description(),null,null));
        assertEquals(412,assertThrows(AccountFailure.class,()->originals.apply(owner(),mapping("Food",Type.SPENDING,target,false,first,second))).status());
        assertEquals(2,originals.groups(owner()).getFirst().uncategorizedCount());
        assertEquals(412,assertThrows(AccountFailure.class,()->originals.apply(owner(),mapping("Wrong",Type.SPENDING,target,false,first))).status());
        var income=categories.create(owner(),new Input("Salary",Type.INCOME,null));
        assertThrows(IllegalArgumentException.class,()->originals.apply(owner(),mapping("Food",Type.SPENDING,income,false,first)));
        originals.apply(owner(),mapping("Food",Type.SPENDING,target,false,first));
        var changed=ledger.list(owner(),a.getId(),0).items().stream().filter(o->o.id().equals(first.id())).findFirst().orElseThrow();
        assertEquals(412,assertThrows(AccountFailure.class,()->originals.apply(owner(),mapping("Food",Type.SPENDING,target,false,changed))).status());
        var replacement=categories.create(owner(),spending("Restaurants",null));
        assertEquals(1,originals.apply(owner(),mapping("Food",Type.SPENDING,replacement,true,changed)).updated());
    }
    @Test void auditFailureRollsBackBulkMapping() {
        var a=account();var first=original(a,Kind.EXPENSE,"Food",null);var second=original(a,Kind.EXPENSE,"Food",null);var target=categories.create(owner(),spending("Groceries",null));
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT synthetic_original_audit_failure CHECK(event_type <> 'LEDGER_UPDATED') NOT VALID");
        try {assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->originals.apply(owner(),mapping("Food",Type.SPENDING,target,false,first,second)));assertEquals(2,originals.groups(owner()).getFirst().uncategorizedCount());}
        finally {jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT synthetic_original_audit_failure");}
    }
    @Test void apiRequiresAuthenticationCsrfAndOwnTransactionsAndCategories() throws Exception {
        mvc.perform(get("/api/v1/imports/original-categories")).andExpect(status().isUnauthorized());
        var a=account();var op=original(a,Kind.EXPENSE,"Food",null);var target=categories.create(owner(),spending("Groceries",null));var input=mapping("Food",Type.SPENDING,target,false,op);
        var session=login("owner@example.test");
        mvc.perform(post("/api/v1/imports/original-categories").session(session).contentType("application/json").content(mapper.writeValueAsString(input))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/imports/original-categories").session(session)).andExpect(status().isOk()).andExpect(jsonPath("$[0].transactions.length()").value(1));
        var other=users.findByEmail("original.api.other@example.test").orElseGet(()->users.save(new AppUser("original.api.other@example.test",encoder.encode("synthetic-password"))));
        var otherSession=login(other.getEmail());
        mvc.perform(post("/api/v1/imports/original-categories").session(otherSession).header("X-CSRF-TOKEN",csrf(otherSession)).contentType("application/json").content(mapper.writeValueAsString(input))).andExpect(status().isNotFound());
        var foreign=categories.create(other.getId(),spending("Foreign",null));
        assertEquals(404,assertThrows(AccountFailure.class,()->originals.apply(owner(),mapping("Food",Type.SPENDING,foreign,false,op))).status());
        categories.setActive(owner(),target.id(),"\"0\"",false);
        assertEquals(412,assertThrows(AccountFailure.class,()->originals.apply(owner(),input)).status());
    }
}
