package com.example.wealthmaster.imports;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.DockerClientFactory;
import tools.jackson.databind.ObjectMapper;
import com.example.wealthmaster.users.*;
import com.example.wealthmaster.accounts.*;
import java.util.*;
import java.time.*;
import java.math.*;
import static com.example.wealthmaster.imports.ImportDtos.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ActiveProfiles("dev")
@SpringBootTest(properties={"app.initial-owner.email=owner@example.test","app.initial-owner.password=synthetic-password","app.mfa.encryption-password=synthetic-test-encryption-password-only","app.mfa.encryption-salt=0123456789abcdef0123456789abcdef"})
class ImportsIntegrationTest {
    static final PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:18-alpine");
    @BeforeAll static void start(){if(System.getProperty("test.database.url")==null){Assumptions.assumeTrue(DockerClientFactory.instance().isDockerAvailable());postgres.start();}}
    @AfterAll static void stop(){if(postgres.isRunning())postgres.stop();}
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry){registry.add("spring.datasource.url",()->System.getProperty("test.database.url",postgres.isRunning()?postgres.getJdbcUrl():""));registry.add("spring.datasource.username",()->System.getProperty("test.database.username",postgres.getUsername()));registry.add("spring.datasource.password",()->System.getProperty("test.database.password",postgres.getPassword()));}
    @Autowired ImportService service;@Autowired JdbcTemplate db;@Autowired UserRepository users;@Autowired PasswordEncoder passwords;@Autowired ObjectMapper json;@Autowired WebApplicationContext context;
    UUID owner;MockMvc mvc;
    @BeforeEach void setup(){
        mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();owner=users.findByEmail("owner@example.test").orElseThrow().getId();
        for(var table:List.of("import_operation_links","import_batches","expected_occurrences","expected_account_history","expected_category_history","expected_transactions","ledger_category_history","ledger_account_history","ledger_movements","ledger_operations","categories","financial_accounts","audit_events"))db.update("DELETE FROM "+table);
    }
    @AfterEach void cleanup(){for(var table:List.of("import_operation_links","import_batches","expected_occurrences","expected_account_history","expected_category_history","expected_transactions","ledger_category_history","ledger_account_history","ledger_movements","ledger_operations","categories","financial_accounts","audit_events"))db.update("DELETE FROM "+table);}
    Batch staged(){var bytes=WorkbookFixtures.workbook(WorkbookFixtures.row(2,"2024-01-05","Expense","Bank","100","-100","Visa","")+WorkbookFixtures.row(3,"2024-01-05","Expense","Bank","-20","20","Visa",""));var batch=service.upload(owner,bytes);return service.configure(owner,batch.id(),new Configure(batch.version(),WorkbookFixtures.selection()));}
    AccountTarget target(String key,AccountType type,String opening,String closing){return new AccountTarget(key,null,null,new AccountDtos.CreateAccount("Synthetic "+key,type,null,"CHF",opening,type==AccountType.CREDIT_CARD?AccountDtos.BalanceMeaning.AMOUNT_OWED:AccountDtos.BalanceMeaning.BALANCE,LocalDate.of(2024,1,1)),closing);}
    Batch mapped(){var batch=staged();var plan=new Plan(batch.plan().selection(),"2024-01-01","2024-01-31",List.of(target("bank",AccountType.CHECKING,"1000","920"),target("card",AccountType.CREDIT_CARD,"0","0")),List.of(new CategoryTarget("food",null,null,new com.example.wealthmaster.budgets.CategoryDtos.Input("Synthetic food",com.example.wealthmaster.budgets.CategoryDtos.Type.SPENDING,null),null)),List.of(new Decision(2,true,"","2024-01-05","Expense","bank","card","food","100","Synthetic purchase",null),new Decision(3,true,"","2024-01-05","Expense","bank","card","food","-20","Synthetic refund",null)),Map.of());return service.save(owner,batch.id(),new Save(batch.version(),plan));}
    Approval approval(Batch batch){var preview=service.preview(owner,batch.id());assertTrue(preview.errors().isEmpty(),preview.errors().toString());return new Approval(batch.version(),preview.token(),true,true,true,true,true,true,true);}
    @Test void stagingCreatesNothingAndApprovedCommitIsExactAuditedAndIdempotent(){
        var batch=mapped();assertEquals(0,db.queryForObject("SELECT count(*) FROM financial_accounts",Integer.class));assertEquals(0,db.queryForObject("SELECT count(*) FROM categories",Integer.class));
        var approval=approval(batch);var receipt=service.commit(owner,batch.id(),approval);assertEquals(3,receipt.createdOperations());assertEquals(2,receipt.createdAccounts().size());assertEquals(1,receipt.createdCategories().size());
        assertEquals(receipt,service.commit(owner,batch.id(),approval));assertEquals(3,db.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));
        assertEquals(0,new BigDecimal("-80").compareTo(db.queryForObject("SELECT sum(amount) FROM ledger_movements WHERE account_id=?",BigDecimal.class,receipt.createdAccounts().get("bank"))));
        assertEquals(0,BigDecimal.ZERO.compareTo(db.queryForObject("SELECT sum(amount) FROM ledger_movements WHERE account_id=?",BigDecimal.class,receipt.createdAccounts().get("card"))));
        assertEquals(1,db.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='IMPORT_COMMITTED'",Integer.class));
        assertEquals(3,db.queryForObject("SELECT count(*) FROM import_operation_links",Integer.class));
        var committed=service.get(owner,batch.id());assertTrue(service.undoPreview(owner,batch.id()).errors().isEmpty());service.undo(owner,batch.id(),new Undo(committed.version()));
        assertEquals(0,db.queryForObject("SELECT count(*) FROM ledger_operations WHERE NOT deleted",Integer.class));assertEquals(2,db.queryForObject("SELECT count(*) FROM financial_accounts",Integer.class));
    }
    @Test void deletingOrPurgingADraftRemovesItFromResumeAndAllowsTheSameUploadAgain(){
        var bytes=WorkbookFixtures.workbook(WorkbookFixtures.row(2,"2024-02-05","Expense","Bank","10","-10","",""));
        var first=service.upload(owner,bytes);service.deleteDraft(owner,first.id(),first.version());
        assertTrue(service.list(owner).isEmpty());var second=service.upload(owner,bytes);assertNotEquals(first.id(),second.id());
        service.purge(owner,second.id(),second.version());assertTrue(service.list(owner).isEmpty());
        var third=service.upload(owner,bytes);assertNotEquals(second.id(),third.id());assertEquals(1,service.list(owner).size());
    }
    @Test void proposedTwoLevelCategoryTreeIsCreatedParentFirst(){
        var batch=mapped();var p=batch.plan();
        var root=new CategoryTarget("legacy_spending",null,null,new com.example.wealthmaster.budgets.CategoryDtos.Input("Legacy spending",com.example.wealthmaster.budgets.CategoryDtos.Type.SPENDING,null),null);
        var child=new CategoryTarget("food",null,null,new com.example.wealthmaster.budgets.CategoryDtos.Input("Synthetic food",com.example.wealthmaster.budgets.CategoryDtos.Type.SPENDING,null),"legacy_spending");
        batch=service.save(owner,batch.id(),new Save(batch.version(),new Plan(p.selection(),p.start(),p.end(),p.accounts(),List.of(child,root),p.rows(),p.duplicates())));
        var receipt=service.commit(owner,batch.id(),approval(batch));
        assertEquals(receipt.createdCategories().get("legacy_spending"),db.queryForObject("SELECT parent_id FROM categories WHERE id=?",UUID.class,receipt.createdCategories().get("food")));
    }
    @Test void unapprovedOrChangedPlansAndUnreconciledBalancesCannotCommit(){
        var batch=mapped();var preview=service.preview(owner,batch.id());
        assertThrows(IllegalArgumentException.class,()->service.commit(owner,batch.id(),new Approval(batch.version(),preview.token(),false,true,true,true,true,true,true)));
        var saved=service.save(owner,batch.id(),new Save(batch.version(),batch.plan()));assertThrows(AccountFailure.class,()->service.commit(owner,batch.id(),new Approval(batch.version(),preview.token(),true,true,true,true,true,true,true)));
        var p=saved.plan();var wrong=new Plan(p.selection(),p.start(),p.end(),List.of(target("bank",AccountType.CHECKING,"1000","999"),target("card",AccountType.CREDIT_CARD,"0","0")),p.categories(),p.rows(),p.duplicates());var bad=service.save(owner,saved.id(),new Save(saved.version(),wrong));assertFalse(service.preview(owner,bad.id()).errors().isEmpty());assertEquals(0,db.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));
    }
    @Test void failedAuditRollsBackAllCreationsAndUndoRejectsEditedOperations(){
        var batch=mapped();var approval=approval(batch);db.execute("ALTER TABLE audit_events ADD CONSTRAINT synthetic_fail_import CHECK(event_type <> 'IMPORT_COMMITTED')");
        try{assertThrows(Exception.class,()->service.commit(owner,batch.id(),approval));assertEquals(0,db.queryForObject("SELECT count(*) FROM financial_accounts",Integer.class));assertEquals(0,db.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));assertEquals("DRAFT",service.get(owner,batch.id()).status());}finally{db.execute("ALTER TABLE audit_events DROP CONSTRAINT synthetic_fail_import");}
        service.commit(owner,batch.id(),approval);db.update("UPDATE ledger_operations SET version=version+1 WHERE kind='EXPENSE'");assertFalse(service.undoPreview(owner,batch.id()).errors().isEmpty());var committed=service.get(owner,batch.id());assertThrows(AccountFailure.class,()->service.undo(owner,batch.id(),new Undo(committed.version())));
    }

    @Test void duplicateLinksDoNotCreateActivityOrAddExistingMovementsTwice(){
        var first=mapped();var receipt=service.commit(owner,first.id(),approval(first));
        var source=WorkbookFixtures.workbook(WorkbookFixtures.row(2,"2024-01-05","Expense","Bank","100","-100","Visa","")+WorkbookFixtures.row(3,"2024-01-05","Expense","Bank","-20","20","Visa","")+"<row r=\"4\">"+WorkbookFixtures.cell("A4","","")+"</row>");
        var second=service.upload(owner,source);second=service.configure(owner,second.id(),new Configure(second.version(),WorkbookFixtures.selection()));
        var original=first.plan();var rows=new ArrayList<>(original.rows());rows.add(new Decision(4,false,"Template","","","","COMMENT","","","",null));
        var targets=List.of(new AccountTarget("bank",receipt.createdAccounts().get("bank"),0L,null,"920"),new AccountTarget("card",receipt.createdAccounts().get("card"),0L,null,"0"));
        var cats=List.of(new CategoryTarget("food",receipt.createdCategories().get("food"),0L,null,null));
        var plan=new Plan(second.plan().selection(),original.start(),original.end(),targets,cats,rows,Map.of());second=service.save(owner,second.id(),new Save(second.version(),plan));
        var preview=service.preview(owner,second.id());assertEquals(3,preview.duplicates().values().stream().filter(c->!c.isEmpty()).count());assertFalse(preview.errors().isEmpty());
        var choices=new HashMap<String,DuplicateChoice>();preview.duplicates().forEach((key,candidates)->{var candidate=candidates.getFirst();choices.put(key,new DuplicateChoice("LINK",candidate.id(),candidate.version()));});
        second=service.save(owner,second.id(),new Save(second.version(),new Plan(plan.selection(),plan.start(),plan.end(),targets,cats,rows,choices)));
        var linked=service.commit(owner,second.id(),approval(second));assertEquals(0,linked.createdOperations());assertEquals(3,linked.linkedOperations());assertEquals(3,db.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));
        var committed=service.get(owner,second.id());service.undo(owner,second.id(),new Undo(committed.version()));assertEquals(3,db.queryForObject("SELECT count(*) FROM ledger_operations WHERE NOT deleted",Integer.class));
    }
    @Test void concurrentCommitsHaveOneReceiptAndNoDuplicateLedgerEntries() throws Exception {
        var batch=mapped();var approved=approval(batch);var start=new java.util.concurrent.CountDownLatch(1);
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Receipt> task=()->{start.await();return service.commit(owner,batch.id(),approved);};
            var a=executor.submit(task);var b=executor.submit(task);start.countDown();assertEquals(a.get(30,java.util.concurrent.TimeUnit.SECONDS),b.get(30,java.util.concurrent.TimeUnit.SECONDS));
        }
        assertEquals(3,db.queryForObject("SELECT count(*) FROM ledger_operations",Integer.class));
    }
    String csrf(MockHttpSession session)throws Exception{return json.readTree(mvc.perform(get("/api/v1/auth/csrf").session(session)).andReturn().getResponse().getContentAsString()).get("token").asString();}
    MockHttpSession login(String email)throws Exception{var session=new MockHttpSession();mvc.perform(post("/api/v1/auth/login").session(session).header("X-CSRF-TOKEN",csrf(session)).param("email",email).param("password","synthetic-password")).andExpect(status().isOk());return session;}
    @Test void sourceDraftAndCommitAreOwnerScopedAndCsrfProtected()throws Exception{
        var batch=mapped();var other=users.findByEmail("import.other@example.test").orElseGet(()->users.save(new AppUser("import.other@example.test",passwords.encode("synthetic-password"))));
        var session=login(other.getEmail());for(var suffix:List.of("","/source","/preview"))mvc.perform(get("/api/v1/imports/"+batch.id()+suffix).session(session)).andExpect(status().isNotFound());
        var signed=login("owner@example.test");mvc.perform(post("/api/v1/imports/"+batch.id()+"/commit").session(signed).contentType("application/json").content(json.writeValueAsString(approval(batch)))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/imports/"+batch.id()+"/source")).andExpect(status().isUnauthorized());
        assertThrows(AccountFailure.class,()->service.save(other.getId(),batch.id(),new Save(batch.version(),batch.plan())));
    }
}
