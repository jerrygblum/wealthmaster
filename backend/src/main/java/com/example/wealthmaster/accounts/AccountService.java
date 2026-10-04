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
    public AccountService(AccountRepository accounts, AuditService audit) {
        this.accounts = accounts; this.audit = audit;
    }
    @Transactional(readOnly = true)
    public List<AccountResponse> list(UUID ownerId) {
        return accounts.findByOwnerIdOrderByCreatedAtDescIdAsc(ownerId).stream().map(AccountResponse::from).toList();
    }
    @Transactional
    public AccountResponse create(UUID ownerId, CreateAccount input) {
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
        var account = accounts.saveAndFlush(new FinancialAccount(ownerId, input.name().strip(), input.type(),
                input.institution() == null || input.institution().isBlank() ? null : input.institution().strip(),
                input.currency(), amount, input.openingDate()));
        audit.accountCreated(ownerId, account.getId());
        return AccountResponse.from(account);
    }
}
