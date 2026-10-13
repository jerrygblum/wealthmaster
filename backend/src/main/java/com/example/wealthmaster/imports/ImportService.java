package com.example.wealthmaster.imports;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;
import jakarta.validation.Validator;
import tools.jackson.databind.ObjectMapper;
import com.example.wealthmaster.accounts.*;
import com.example.wealthmaster.budgets.*;
import com.example.wealthmaster.ledger.*;
import java.util.*;
import java.time.*;
import java.math.*;
import java.security.*;
import static com.example.wealthmaster.imports.ImportDtos.*;

@Service
public class ImportService {
    private final JdbcTemplate db; private final ObjectMapper json; private final WorkbookReader reader;
    private final ImportPlanner planner; private final AccountService accounts; private final AccountRepository repository;
    private final CategoryService categories; private final LedgerService ledger; private final Validator validator;
    public ImportService(JdbcTemplate db,ObjectMapper json,WorkbookReader reader,ImportPlanner planner,AccountService accounts,
                         AccountRepository repository,CategoryService categories,LedgerService ledger,Validator validator) {
        this.db=db;this.json=json;this.reader=reader;this.planner=planner;this.accounts=accounts;this.repository=repository;this.categories=categories;this.ledger=ledger;this.validator=validator;
    }
    private String encode(Object value){return json.writeValueAsString(value);}
    private <T> T decode(String value,Class<T> type){return value==null?null:json.readValue(value,type);}
    static String hash(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    private void ownerLock(UUID owner) {db.update("INSERT INTO import_owner_state(owner_id) VALUES(?) ON CONFLICT DO NOTHING",owner);db.queryForObject("SELECT owner_id FROM import_owner_state WHERE owner_id=? FOR UPDATE",UUID.class,owner);}
    private Batch batch(UUID owner,UUID id,boolean lock) {
        var rows=db.query("SELECT * FROM import_batches WHERE id=? AND owner_id=?"+(lock?" FOR UPDATE":""),(r,n)->new Batch(r.getObject("id",UUID.class),r.getString("status"),r.getLong("version"),r.getTimestamp("created_at").toInstant(),decode(r.getString("workbook"),Workbook.class),decode(r.getString("plan"),Plan.class),decode(r.getString("receipt"),Receipt.class)),id,owner);
        if(rows.isEmpty())throw new AccountFailure(404,"Import not found.");return rows.getFirst();
    }
    private void version(Batch batch,long version){if(batch.version()!=version)throw new AccountFailure(412,"Import changed. Reload the draft before continuing.");}
    private void draft(Batch batch){if(batch.workbook()==null)throw new AccountFailure(409,"The private source has been purged; this draft cannot be resumed.");if(!batch.status().equals("DRAFT"))throw new AccountFailure(409,"This import is no longer a draft.");}
    private void valid(Object value){if(value==null||!validator.validate(value).isEmpty())throw new IllegalArgumentException("Complete valid creation details before previewing.");}
    @Transactional
    public Batch upload(UUID owner,byte[] source) {
        var workbook=reader.read(source);String hash=hash(source);ownerLock(owner);
        var prior=db.query("SELECT id,status,source IS NOT NULL AS has_source FROM import_batches WHERE owner_id=? AND source_hash=?",(r,n)->Map.of("id",r.getObject("id",UUID.class),"status",r.getString("status"),"hasSource",r.getBoolean("has_source")),owner,hash);
        if(!prior.isEmpty()) {
            var found=prior.getFirst();
            if(found.get("status").equals("DRAFT")&&!((Boolean)found.get("hasSource")))db.update("DELETE FROM import_batches WHERE id=? AND owner_id=?",found.get("id"),owner);
            else return batch(owner,(UUID)found.get("id"),false);
        }
        UUID id=UUID.randomUUID();db.update("INSERT INTO import_batches(id,owner_id,source_hash,source,workbook) VALUES(?,?,?,?,?::jsonb)",id,owner,hash,source,encode(workbook));audit(owner,id,"IMPORT_STAGED");return batch(owner,id,false);
    }
    @Transactional(readOnly=true)
    public List<Summary> list(UUID owner){return db.query("SELECT id,status,version,created_at FROM import_batches WHERE owner_id=? AND NOT(status='DRAFT' AND source IS NULL) ORDER BY created_at DESC",(r,n)->new Summary(r.getObject("id",UUID.class),r.getString("status"),r.getLong("version"),r.getTimestamp("created_at").toInstant()),owner);}
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Batch get(UUID owner,UUID id){return batch(owner,id,false);}
    @Transactional(readOnly=true)
    public byte[] source(UUID owner,UUID id){batch(owner,id,false);var bytes=db.queryForObject("SELECT source FROM import_batches WHERE id=? AND owner_id=?",byte[].class,id,owner);if(bytes==null)throw new AccountFailure(404,"Source has been purged.");return bytes;}
    @Transactional
    public Batch configure(UUID owner,UUID id,Configure input){var batch=batch(owner,id,true);version(batch,input.version());draft(batch);var plan=planner.initial(batch.workbook(),input.selection());persist(owner,id,plan);return batch(owner,id,false);}
    private void shape(Plan plan) {
        if(plan==null||plan.accounts()==null||plan.categories()==null||plan.rows()==null||plan.duplicates()==null||plan.accounts().size()>100||plan.categories().size()>300||plan.rows().size()>5000||plan.duplicates().size()>10000)throw new IllegalArgumentException("Invalid import plan.");
        var keys=new HashSet<String>();
        for(var target:plan.accounts()) {
            if(target==null||target.key()==null||!target.key().matches("[a-zA-Z0-9_-]{1,80}")||!keys.add(target.key()))throw new IllegalArgumentException("Account target keys must be unique.");
            if((target.existingId()==null)==(target.create()==null))throw new IllegalArgumentException("Choose an existing account or propose creation.");
            if(target.existingId()!=null&&target.version()==null)throw new IllegalArgumentException("Account version required.");
            if(target.create()!=null)valid(target.create());
            if(target.closingBalance()!=null&&!target.closingBalance().isBlank())ImportPlanner.decimal(target.closingBalance());
        }
        keys.clear();
        var newCategories=new HashSet<String>();
        for(var target:plan.categories()) {
            if(target==null||target.key()==null||!target.key().matches("[a-zA-Z0-9_-]{1,80}")||!keys.add(target.key()))throw new IllegalArgumentException("Category target keys must be unique.");
            if((target.existingId()==null)==(target.create()==null))throw new IllegalArgumentException("Choose an existing category or propose creation.");
            if(target.existingId()!=null&&target.version()==null)throw new IllegalArgumentException("Category version required.");
            if(target.existingId()!=null&&target.parentKey()!=null)throw new IllegalArgumentException("Existing categories cannot have a proposed parent.");
            if(target.create()!=null){valid(target.create());var c=target.create();if(c.parentId()!=null&&target.parentKey()!=null)throw new IllegalArgumentException("Choose either an existing or proposed category parent.");if(!newCategories.add(c.type()+":"+c.parentId()+":"+target.parentKey()+":"+c.name().strip().toLowerCase(java.util.Locale.ROOT)))throw new IllegalArgumentException("Duplicate category creation proposals. Use one target for aliases.");}
        }
        for(var target:plan.categories())if(target.parentKey()!=null) {
            var parent=plan.categories().stream().filter(candidate->candidate.key().equals(target.parentKey())).findFirst().orElseThrow(()->new IllegalArgumentException("Proposed category parent not found."));
            if(parent==target||parent.parentKey()!=null)throw new IllegalArgumentException("Category proposals support at most two levels.");
        }
        for(var row:plan.rows())if(row==null||row.row()<1||row.kind()==null||row.amount()==null||row.date()==null||row.account()==null||row.card()==null||row.category()==null||row.description()==null||row.description().length()>500||row.reason()!=null&&row.reason().length()>1000)throw new IllegalArgumentException("Invalid row decision.");
        for(var choice:plan.duplicates().values())if(choice==null||choice.mode()==null||!Set.of("KEEP","LINK").contains(choice.mode())||choice.mode().equals("LINK")&&(choice.existingId()==null||choice.version()==null))throw new IllegalArgumentException("Invalid duplicate decision.");
    }
    private void persist(UUID owner,UUID id,Plan plan){shape(plan);db.update("UPDATE import_batches SET plan=?::jsonb,version=version+1 WHERE id=? AND owner_id=?",encode(plan),id,owner);}
    @Transactional
    public Batch save(UUID owner,UUID id,Save input){var batch=batch(owner,id,true);version(batch,input.version());draft(batch);shape(input.plan());ImportPlanner.sheet(batch.workbook(),input.plan().selection());persist(owner,id,input.plan());return batch(owner,id,false);}
    private record Context(Map<String,ImportPlanner.AccountInfo> accounts,Map<String,CategoryDtos.Category> categories,List<CategoryDtos.Category> allCategories) {}
    private Context context(UUID owner,Plan plan) {
        var owned=accounts.list(owner);var categoryList=categories.list(owner).items();var info=new LinkedHashMap<String,ImportPlanner.AccountInfo>();var categoryInfo=new LinkedHashMap<String,CategoryDtos.Category>();
        var existingIds=new HashSet<UUID>();
        for(var target:plan.accounts()) {
            if(target.existingId()!=null) {
                var a=owned.stream().filter(item->item.id().equals(target.existingId())).findFirst().orElseThrow(()->new AccountFailure(404,"Mapped account not found."));
                if(!existingIds.add(a.id()))throw new IllegalArgumentException("Use one target key for aliases of the same account.");
                if(a.version()!=target.version())throw new AccountFailure(412,"Mapped account changed. Refresh mappings.");
                info.put(target.key(),new ImportPlanner.AccountInfo(a.id(),a.name(),a.type().name(),a.currency(),a.openingBalance(),a.openingDate(),a.version(),a.active()));
            } else {
                var a=target.create();valid(a);BigDecimal opening=ImportPlanner.decimal(a.openingAmount());
                if(Currency.getInstance(a.currency()).getDefaultFractionDigits()<0)throw new IllegalArgumentException("Choose an ISO currency.");
                if(a.type()==AccountType.CREDIT_CARD) {if(opening.signum()<0||a.balanceMeaning()==AccountDtos.BalanceMeaning.BALANCE)throw new IllegalArgumentException("Confirm credit-card opening debt or credit.");if(a.balanceMeaning()==AccountDtos.BalanceMeaning.AMOUNT_OWED)opening=opening.negate();}
                else if(a.balanceMeaning()!=AccountDtos.BalanceMeaning.BALANCE)throw new IllegalArgumentException("Use signed opening balance for ordinary accounts.");
                if(a.openingDate().getYear()<1||a.openingDate().getYear()>9999)throw new IllegalArgumentException("Invalid opening date.");
                info.put(target.key(),new ImportPlanner.AccountInfo(null,a.name(),a.type().name(),a.currency(),opening.toPlainString(),a.openingDate(),0,true));
            }
        }
        existingIds.clear();
        for(var target:plan.categories()) {
            if(target.existingId()!=null) {
                var c=categoryList.stream().filter(item->item.id().equals(target.existingId())).findFirst().orElseThrow(()->new AccountFailure(404,"Mapped category not found."));
                if(!existingIds.add(c.id()))throw new IllegalArgumentException("Use one target key for aliases of the same category.");
                if(c.version()!=target.version())throw new AccountFailure(412,"Mapped category changed. Refresh mappings.");categoryInfo.put(target.key(),c);
            } else {
                var c=target.create();valid(c);boolean available=true;
                UUID parentId=c.parentId();
                if(target.parentKey()!=null) {
                    var parentTarget=plan.categories().stream().filter(item->item.key().equals(target.parentKey())).findFirst().orElseThrow(()->new IllegalArgumentException("Proposed category parent not found."));
                    CategoryDtos.Type parentType;
                    if(parentTarget.existingId()!=null) {
                        var proposedParent=categoryList.stream().filter(item->item.id().equals(parentTarget.existingId())).findFirst().orElseThrow(()->new AccountFailure(404,"Category parent not found."));
                        if(proposedParent.parentId()!=null)throw new IllegalArgumentException("Category proposals support at most two levels.");
                        parentId=parentTarget.existingId();parentType=proposedParent.type();available=proposedParent.available();
                    } else {
                        if(parentTarget.create().parentId()!=null)throw new IllegalArgumentException("Category proposals support at most two levels.");
                        parentType=parentTarget.create().type();
                    }
                    if(parentType!=c.type())throw new IllegalArgumentException("Choose a category parent with matching type.");
                }
                final UUID proposedParentId=parentId;
                if(proposedParentId!=null) {var selectedParent=categoryList.stream().filter(item->item.id().equals(proposedParentId)).findFirst().orElseThrow(()->new AccountFailure(404,"Category parent not found."));if(selectedParent.parentId()!=null||selectedParent.type()!=c.type())throw new IllegalArgumentException("Choose a top-level parent of matching type.");available=selectedParent.available();}
                if(categoryList.stream().anyMatch(item->item.type()==c.type()&&Objects.equals(item.parentId(),proposedParentId)&&item.name().equalsIgnoreCase(c.name().strip())))throw new IllegalArgumentException("A proposed category already exists. Map it instead.");
                categoryInfo.put(target.key(),new CategoryDtos.Category(null,c.name(),c.type(),c.parentId(),true,Instant.EPOCH,0,false,false,available));
            }
        }
        return new Context(info,categoryInfo,categoryList);
    }
    private List<Candidate> candidates(UUID owner,Operation op,Context context) {
        UUID account=context.accounts().get(op.account()).id(),destination=op.destination()==null?null:context.accounts().get(op.destination()).id();
        if(account==null||op.destination()!=null&&destination==null)return List.of();
        return db.query("SELECT id,version,kind,amount,transaction_date,description FROM ledger_operations WHERE owner_id=? AND NOT deleted AND kind=? AND account_id=? AND destination_id IS NOT DISTINCT FROM ?::uuid AND currency=? AND amount=? AND transaction_date=? ORDER BY id",(r,n)->new Candidate(r.getObject("id",UUID.class),r.getLong("version"),r.getString("kind"),r.getBigDecimal("amount").toPlainString(),r.getDate("transaction_date").toString(),r.getString("description")),owner,op.kind(),account,destination,op.currency(),new BigDecimal(op.amount()),LocalDate.parse(op.date()));
    }
    private boolean linked(Plan plan,Operation op){var choice=plan.duplicates().get(op.key());return choice!=null&&choice.mode().equals("LINK");}
    private BigDecimal existingMovements(UUID id,LocalDate end){return id==null?BigDecimal.ZERO:db.queryForObject("SELECT COALESCE(sum(m.amount),0) FROM ledger_movements m JOIN ledger_operations o ON o.id=m.operation_id WHERE m.account_id=? AND NOT o.deleted AND o.transaction_date<=?",BigDecimal.class,id,end);}
    private Preview preview(UUID owner,Batch batch) {
        if(batch.plan()==null)throw new IllegalArgumentException("Configure the sheet first.");shape(batch.plan());var plan=batch.plan();var context=context(owner,plan);var result=planner.build(batch.workbook(),plan,context.accounts(),context.categories());
        var errors=new ArrayList<>(result.errors());var warnings=new ArrayList<>(result.warnings());var candidates=new TreeMap<String,List<Candidate>>();var links=new HashSet<UUID>();
        var movements=new HashMap<String,BigDecimal>();var totals=new TreeMap<String,String>();
        for(var op:result.operations()) {
            var matches=candidates(owner,op,context);candidates.put(op.key(),matches);var choice=plan.duplicates().get(op.key());
            if(!matches.isEmpty()&&choice==null)errors.add(op.key()+": review possible duplicate(s). Choose keep or link.");
            if(linked(plan,op)) {
                if(matches.stream().noneMatch(m->m.id().equals(choice.existingId())&&m.version()==choice.version()))errors.add(op.key()+": linked existing operation is no longer compatible.");
                if(!links.add(choice.existingId()))errors.add("An existing operation cannot satisfy multiple proposals.");
                warnings.add(op.key()+": linking preserves the existing operation, including its category and description.");
            } else {
                var amount=new BigDecimal(op.amount());movements.merge(op.account(),Set.of("EXPENSE","TRANSFER").contains(op.kind())?amount.negate():amount,BigDecimal::add);
                if(op.destination()!=null)movements.merge(op.destination(),amount,BigDecimal::add);
            }
            String totalKey=op.currency()+" "+op.kind();totals.put(totalKey,new BigDecimal(totals.getOrDefault(totalKey,"0")).add(new BigDecimal(op.amount())).toPlainString());
        }
        var balances=new ArrayList<Balance>();
        LocalDate end;try{end=LocalDate.parse(plan.end());}catch(RuntimeException e){end=ledger.today();}
        for(var target:plan.accounts()) {
            var info=context.accounts().get(target.key());var existing=existingMovements(info.id(),end);var imported=movements.getOrDefault(target.key(),BigDecimal.ZERO);var projected=new BigDecimal(info.opening()).add(existing).add(imported);
            String closing=target.closingBalance(),difference=null;
            if(closing!=null&&!closing.isBlank()){difference=projected.subtract(ImportPlanner.decimal(closing)).toPlainString();if(new BigDecimal(difference).signum()!=0)errors.add(info.name()+": closing balance does not reconcile.");}
            else warnings.add(info.name()+": no independently verified closing balance.");
            balances.add(new Balance(target.key(),info.name(),info.currency(),info.opening(),existing.toPlainString(),imported.toPlainString(),projected.toPlainString(),closing,difference));
        }
        var snapshot=encode(List.of(batch.version(),plan,context,result.operations(),candidates,balances));
        return new Preview(batch.version(),hash(snapshot.getBytes(java.nio.charset.StandardCharsets.UTF_8)),errors,warnings,result.operations(),candidates,balances,totals,result.excluded());
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Preview preview(UUID owner,UUID id){var batch=batch(owner,id,false);draft(batch);return preview(owner,batch);}
    private void lockResources(UUID owner,Plan plan) {
        var operations=new TreeSet<UUID>();for(var choice:plan.duplicates().values())if(choice.existingId()!=null)operations.add(choice.existingId());
        for(var operation:operations) {
            if(db.queryForList("SELECT id FROM ledger_operations WHERE id=? AND owner_id=? FOR UPDATE",UUID.class,operation,owner).isEmpty())throw new AccountFailure(404,"Linked operation not found.");
        }
        var ids=new TreeSet<UUID>();for(var target:plan.accounts())if(target.existingId()!=null)ids.add(target.existingId());
        for(var id:ids)repository.findByIdAndOwnerId(id,owner).orElseThrow(()->new AccountFailure(404,"Mapped account not found."));
        categories.lock(owner);
    }
    @Transactional
    public Receipt commit(UUID owner,UUID id,Approval approval) {
        ownerLock(owner);var batch=batch(owner,id,true);
        if(batch.status().equals("COMMITTED")) {if(approval.version()!=batch.version()-1 || !Objects.equals(approval.token(),db.queryForObject("SELECT approved_token FROM import_batches WHERE id=?",String.class,id)))throw new AccountFailure(412,"Commit revision does not match.");return batch.receipt();}
        draft(batch);version(batch,approval.version());if(batch.plan()==null)throw new IllegalArgumentException("Configure the import first.");shape(batch.plan());lockResources(owner,batch.plan());
        var preview=preview(owner,batch);if(!preview.errors().isEmpty())throw new AccountFailure(409,"Resolve all preview errors before committing.");
        if(!Objects.equals(preview.token(),approval.token()))throw new AccountFailure(412,"Preview changed. Review it again before approving.");
        if(!approval.approveCreations()||!approval.approveSettlements()||!approval.approveExclusions()||!approval.acknowledgeDates()||!approval.acknowledgeCurrencies()||!approval.acknowledgeBaselines()||!approval.acknowledgeUnverified())throw new IllegalArgumentException("Explicitly approve all creation, settlement, exclusion, date, currency and balance decisions.");
        var accountIds=new HashMap<String,UUID>();var categoryIds=new HashMap<String,UUID>();var createdAccounts=new LinkedHashMap<String,UUID>();var createdCategories=new LinkedHashMap<String,UUID>();
        for(var target:batch.plan().accounts()) {
            UUID targetId=target.existingId();if(targetId==null){targetId=accounts.create(owner,target.create()).id();createdAccounts.put(target.key(),targetId);}accountIds.put(target.key(),targetId);
        }
        for(var target:batch.plan().categories())if(target.existingId()!=null)categoryIds.put(target.key(),target.existingId());
        var pendingCategories=new ArrayList<>(batch.plan().categories().stream().filter(target->target.existingId()==null).toList());
        while(!pendingCategories.isEmpty()) {
            boolean progressed=false;
            for(var iterator=pendingCategories.iterator();iterator.hasNext();) {
                var target=iterator.next();
                if(target.parentKey()!=null&&!categoryIds.containsKey(target.parentKey()))continue;
                var proposed=target.create();var input=new CategoryDtos.Input(proposed.name(),proposed.type(),target.parentKey()==null?proposed.parentId():categoryIds.get(target.parentKey()));
                UUID targetId=categories.create(owner,input).id();createdCategories.put(target.key(),targetId);categoryIds.put(target.key(),targetId);iterator.remove();progressed=true;
            }
            if(!progressed)throw new IllegalArgumentException("Category proposal hierarchy is invalid.");
        }
        int created=0,linked=0;
        for(var op:preview.operations()) {
            UUID operationId;long operationVersion;boolean create=!linked(batch.plan(),op);
            if(!create){var choice=batch.plan().duplicates().get(op.key());operationId=choice.existingId();operationVersion=choice.version();linked++;}
            else {
                String notes="Legacy workbook migration "+id+(op.reconstructed()?"; reconstructed settlement; source dates are settlement dates.":"; source date is bank movement date.");
                LedgerDtos.Operation saved;
                if(op.kind().equals("TRANSFER"))saved=ledger.transfer(owner,null,null,new LedgerDtos.TransferInput(accountIds.get(op.account()),accountIds.get(op.destination()),op.amount(),LocalDate.parse(op.date()),op.description(),notes));
                else saved=ledger.transaction(owner,null,null,new LedgerDtos.TransactionInput(accountIds.get(op.account()),LedgerDtos.Kind.valueOf(op.kind()),op.amount(),LocalDate.parse(op.date()),null,null,op.description(),notes,categoryIds.get(op.category())));
                operationId=saved.id();operationVersion=saved.version();created++;
            }
            db.update("INSERT INTO import_operation_links(batch_id,owner_id,proposal_key,operation_id,operation_version,created,source_rows) VALUES(?,?,?,?,?,?,?::jsonb)",id,owner,op.key(),operationId,operationVersion,create,encode(op.rows()));
        }
        var receipt=new Receipt(id,created,linked,createdAccounts,createdCategories,Instant.now());
        db.update("UPDATE import_batches SET status='COMMITTED',receipt=?::jsonb,approved_token=?,version=version+1 WHERE id=?",encode(receipt),approval.token(),id);audit(owner,id,"IMPORT_COMMITTED");return receipt;
    }
    private void expectationLock(UUID owner){db.update("INSERT INTO expectation_owner_state(owner_id) VALUES(?) ON CONFLICT DO NOTHING",owner);db.queryForObject("SELECT owner_id FROM expectation_owner_state WHERE owner_id=? FOR UPDATE",UUID.class,owner);}
    private UndoPreview undoPreview(UUID owner,Batch batch,boolean lock) {
        if(!batch.status().equals("COMMITTED"))throw new AccountFailure(409,"Only a committed import can be reversed.");
        var errors=new ArrayList<String>();
        var links=db.queryForList("SELECT l.operation_id,l.operation_version,o.version,o.deleted FROM import_operation_links l JOIN ledger_operations o ON o.id=l.operation_id WHERE l.batch_id=? AND l.owner_id=? AND l.created ORDER BY o.id"+(lock?" FOR UPDATE OF o":""),batch.id(),owner);
        for(var link:links) {
            UUID operation=(UUID)link.get("operation_id");if(!link.get("operation_version").equals(link.get("version"))||Boolean.TRUE.equals(link.get("deleted")))errors.add("An imported operation was changed or deleted. Resolve manually before undo.");
            if(Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM expected_occurrences WHERE operation_id=?)",Boolean.class,operation)))errors.add("An imported operation is linked to an expectation. Unlink it before undo.");
            if(Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM import_operation_links l JOIN import_batches b ON b.id=l.batch_id WHERE l.operation_id=? AND l.batch_id<>? AND b.status='COMMITTED')",Boolean.class,operation,batch.id())))errors.add("Another committed import references an operation. Resolve it before undo.");
        }
        return new UndoPreview(batch.version(),errors,links.size());
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public UndoPreview undoPreview(UUID owner,UUID id){return undoPreview(owner,batch(owner,id,false),false);}
    @Transactional
    public Batch undo(UUID owner,UUID id,Undo input) {
        ownerLock(owner);var batch=batch(owner,id,true);version(batch,input.version());expectationLock(owner);var preview=undoPreview(owner,batch,true);
        if(!preview.errors().isEmpty())throw new AccountFailure(409,"Resolve undo dependencies before reversing the batch.");
        var links=db.queryForList("SELECT o.* FROM import_operation_links l JOIN ledger_operations o ON o.id=l.operation_id WHERE l.batch_id=? AND l.created ORDER BY o.id",id);
        var accountIds=new TreeSet<UUID>();for(var link:links){accountIds.add((UUID)link.get("account_id"));if(link.get("destination_id")!=null)accountIds.add((UUID)link.get("destination_id"));}
        for(var account:accountIds)repository.findByIdAndOwnerId(account,owner).orElseThrow(()->new AccountFailure(404,"Account not found."));categories.lock(owner);
        for(var link:links)ledger.delete(owner,(UUID)link.get("id"),"\""+link.get("version")+"\"",link.get("kind").equals("TRANSFER"));
        db.update("UPDATE import_batches SET status='REVERSED',version=version+1 WHERE id=?",id);audit(owner,id,"IMPORT_REVERSED");return batch(owner,id,false);
    }
    @Transactional
    public void purge(UUID owner,UUID id,long version) {
        var batch=batch(owner,id,true);version(batch,version);
        if(batch.status().equals("COMMITTED"))throw new AccountFailure(409,"Retain source lineage while the import is committed. Reverse first.");
        db.update("UPDATE import_batches SET source=NULL,workbook=NULL,plan=NULL,version=version+1 WHERE id=?",id);audit(owner,id,"IMPORT_SOURCE_PURGED");
    }
    @Transactional
    public void deleteDraft(UUID owner,UUID id,long version) {
        ownerLock(owner);var batch=batch(owner,id,true);version(batch,version);draft(batch);
        audit(owner,id,"IMPORT_DRAFT_DELETED");db.update("DELETE FROM import_batches WHERE id=? AND owner_id=?",id,owner);
    }
    private void audit(UUID owner,UUID id,String type){db.update("INSERT INTO audit_events(id,actor_id,event_type,resource_id) VALUES(?,?,?,?)",UUID.randomUUID(),owner,type,id);}
}
