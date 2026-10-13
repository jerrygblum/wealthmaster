package com.example.wealthmaster.imports;

import com.example.wealthmaster.accounts.AccountFailure;
import com.example.wealthmaster.budgets.CategoryDtos;
import com.example.wealthmaster.budgets.CategoryService;
import com.example.wealthmaster.ledger.LedgerDtos.CategoryChange;
import com.example.wealthmaster.ledger.LedgerService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Pattern;

@Service
public class OriginalCategoryService {
    private static final Pattern ORIGINAL = Pattern.compile("(?:^| \\| )Original category: (.+)$", Pattern.DOTALL);
    private final JdbcTemplate db;
    private final LedgerService ledger;
    private final CategoryService categories;
    public OriginalCategoryService(JdbcTemplate db,LedgerService ledger,CategoryService categories) {
        this.db=db;this.ledger=ledger;this.categories=categories;
    }
    public record Transaction(UUID id,long version,UUID accountId,String accountName,LocalDate date,
        String kind,String amount,String currency,String description,UUID categoryId,CategoryDtos.Assignment category) {}
    public record Group(String originalCategory,CategoryDtos.Type type,int uncategorizedCount,List<Transaction> transactions) {}
    public record Mapping(@NotBlank @Size(max=500) String originalCategory,@NotNull CategoryDtos.Type type,
        @NotNull UUID categoryId,@Min(0) long categoryVersion,boolean includeCategorized,
        @NotEmpty @Size(max=10000) List<@NotNull @Valid CategoryChange> transactions) {}
    public record Applied(int updated) {}
    static String original(String description) {
        var match=ORIGINAL.matcher(description);
        return match.find()?match.group(1).strip():"";
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public List<Group> groups(UUID owner) {
        var assignments=new HashMap<UUID,CategoryDtos.Assignment>();
        var rows=db.query("""
            SELECT o.*,a.name AS account_name FROM ledger_operations o
            JOIN financial_accounts a ON a.id=o.account_id AND a.owner_id=o.owner_id
            WHERE o.owner_id=? AND NOT o.deleted AND o.kind<>'TRANSFER'
            AND o.description LIKE '%Original category:%'
            ORDER BY o.transaction_date DESC,o.id
            """,(r,n)-> {
                UUID categoryId=r.getObject("category_id",UUID.class);
                var assignment=categoryId==null?null:assignments.computeIfAbsent(categoryId,categories::assignment);
                return new Transaction(r.getObject("id",UUID.class),r.getLong("version"),r.getObject("account_id",UUID.class),
                    r.getString("account_name"),r.getObject("transaction_date",LocalDate.class),r.getString("kind"),
                    r.getBigDecimal("amount").toPlainString(),r.getString("currency"),r.getString("description"),categoryId,assignment);
            },owner);
        var grouped=new TreeMap<String,List<Transaction>>();
        for(var row:rows) {
            String label=original(row.description());if(label.isBlank())continue;
            String key=(row.kind().equals("INCOME")?"INCOME":"SPENDING")+":"+label;
            grouped.computeIfAbsent(key,k->new ArrayList<>()).add(row);
        }
        return grouped.values().stream().map(rowsInGroup->new Group(original(rowsInGroup.getFirst().description()),
            rowsInGroup.getFirst().kind().equals("INCOME")?CategoryDtos.Type.INCOME:CategoryDtos.Type.SPENDING,
            (int)rowsInGroup.stream().filter(row->row.categoryId()==null).count(),List.copyOf(rowsInGroup))).toList();
    }
    @Transactional
    public Applied apply(UUID owner,Mapping mapping) {
        // Lock the reviewed operations in ledger order before the category lock; concurrent edits cannot move group members.
        var ids=new TreeSet<UUID>();
        for(var change:mapping.transactions())if(!ids.add(change.id()))throw new IllegalArgumentException("Duplicate transaction.");
        for(var id:ids) {
            var found=db.queryForList("SELECT description,kind,category_id FROM ledger_operations WHERE id=? AND owner_id=? AND NOT deleted FOR UPDATE",id,owner);
            if(found.isEmpty())throw new AccountFailure(404,"Transaction not found. Refresh the groups.");
            var row=found.getFirst();String kind=(String)row.get("kind");
            if(kind.equals("TRANSFER") || !original((String)row.get("description")).equals(mapping.originalCategory())
                || (kind.equals("INCOME")?CategoryDtos.Type.INCOME:CategoryDtos.Type.SPENDING)!=mapping.type())
                throw new AccountFailure(412,"A transaction no longer belongs to this group. Refresh and review again.");
            if(!mapping.includeCategorized() && row.get("category_id")!=null)
                throw new AccountFailure(412,"A reviewed transaction is already categorized. Refresh and review again.");
        }
        return new Applied(ledger.assignCategories(owner,mapping.transactions(),mapping.categoryId(),mapping.categoryVersion()));
    }
}
