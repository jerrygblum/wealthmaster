package com.example.wealthmaster.accounts;

import com.example.wealthmaster.audit.AuditService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.Currency;
import java.util.List;
import java.util.UUID;
import static com.example.wealthmaster.accounts.AccountDtos.*;

@Service
public class AccountService {
    private final AccountRepository accounts;
    private final AuditService audit;
    private final AccountUsagePolicy usage;
    private final com.example.wealthmaster.ledger.LedgerService ledger;
    public AccountService(AccountRepository accounts, AuditService audit, AccountUsagePolicy usage, com.example.wealthmaster.ledger.LedgerService ledger) {
        this.accounts = accounts; this.audit = audit; this.usage = usage; this.ledger = ledger;
    }
    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public List<AccountResponse> list(UUID ownerId) {
        return accounts.findByOwnerIdOrderByCreatedAtDescIdAsc(ownerId).stream().map(this::response).toList();
    }
    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public AccountResponse detail(UUID owner, UUID id) {
        return response(accounts.findById(id).filter(a -> a.getOwnerId().equals(owner)).orElseThrow(() -> new AccountFailure(404, "Account not found.")));
    }
    private AccountResponse response(FinancialAccount account) {
        return AccountResponse.from(account).withActivity(usage.hasActivity(account.getId())).withBalance(account.getOpeningBalance().add(ledger.movements(account.getId())).toPlainString(), ledger.today());
    }
    @Transactional
    public AccountResponse create(UUID ownerId, CreateAccount input) {
        var amount = openingAmount(input);
        var account = accounts.saveAndFlush(new FinancialAccount(ownerId, input.name().strip(), input.type(),
                institution(input), input.currency(), amount, input.openingDate()));
        audit.accountCreated(ownerId, account.getId());
        return response(account);
    }
    private String institution(CreateAccount input) {
        return input.institution() == null || input.institution().isBlank() ? null : input.institution().strip();
    }
    private BigDecimal openingAmount(CreateAccount input) {
        if(input.openingDate()==null || input.openingDate().getYear()<1 || input.openingDate().getYear()>9999)
            throw new IllegalArgumentException("Opening dates must use years 1–9999.");
        try {
            if (Currency.getInstance(input.currency()).getDefaultFractionDigits() < 0) {
                throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("Choose a valid ISO 4217 currency.");
        }
        BigDecimal amount;
        try {
            amount = new BigDecimal(input.openingAmount());
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException("Enter a valid decimal amount.");
        }
        if (amount.scale() > 8 || amount.precision() - amount.scale() > 20 || amount.scale() < 0) {
            throw new IllegalArgumentException("Opening amounts allow at most 20 integer digits and 8 decimal places.");
        }
        if (input.type() == AccountType.CREDIT_CARD) {
            if (amount.signum() < 0 || input.balanceMeaning() == BalanceMeaning.BALANCE) {
                throw new IllegalArgumentException("Enter a non-negative credit-card amount and select amount owed or in credit.");
            }
            if (input.balanceMeaning() == BalanceMeaning.AMOUNT_OWED) amount = amount.negate();
        } else if (input.balanceMeaning() != BalanceMeaning.BALANCE) {
            throw new IllegalArgumentException("Use a signed balance for this account type.");
        }
        return amount;
    }
    private FinancialAccount owned(UUID owner, UUID id, String match) {
        var account = accounts.findByIdAndOwnerId(id, owner)
                .orElseThrow(() -> new AccountFailure(404, "Account not found."));
        if (match == null) throw new AccountFailure(428, "Reload accounts before making this change.");
        if (!match.matches("\"[0-9]+\"")) throw new AccountFailure(400, "If-Match must contain a quoted account version.");
        if (!match.equals("\"" + account.getVersion() + "\""))
            throw new AccountFailure(412, "This account changed. Reload accounts and try again.");
        return account;
    }
    @Transactional
    public AccountResponse update(UUID owner, UUID id, String match, CreateAccount input) {
        var account = owned(owner, id, match);
        var amount = openingAmount(input);
        if (usage.hasActivity(id) && (account.getType() != input.type() || !account.getCurrency().equals(input.currency())
                || account.getOpeningBalance().compareTo(amount) != 0))
            throw new AccountFailure(409, "Financial setup is locked because this account has activity. Name, institution and opening date can change.");
        var before = response(account);
        account.update(input.name().strip(), institution(input), input.type(), input.currency(), amount, input.openingDate());
        accounts.flush();
        var after = response(account);
        if (!before.equals(after)) audit.accountChanged(owner, id, "ACCOUNT_UPDATED", before, after);
        return after;
    }
    @Transactional
    public AccountResponse setActive(UUID owner, UUID id, String match, boolean active) {
        var account = owned(owner, id, match);
        var before = response(account);
        account.setActive(active); accounts.flush();
        var after = response(account);
        if (!before.equals(after)) audit.accountChanged(owner, id, active ? "ACCOUNT_RESTORED" : "ACCOUNT_ARCHIVED", before, after);
        return after;
    }
    @Transactional
    public void delete(UUID owner, UUID id, String match) {
        var account = owned(owner, id, match);
        if (usage.hasActivity(id)) throw new AccountFailure(409, "This account has financial history. Archive it instead.");
        audit.accountChanged(owner, id, "ACCOUNT_DELETED", response(account), null);
        accounts.delete(account); accounts.flush();
    }
}
