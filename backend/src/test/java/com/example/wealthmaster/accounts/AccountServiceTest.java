package com.example.wealthmaster.accounts;

import com.example.wealthmaster.audit.AuditService;
import jakarta.validation.Validation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.UUID;
import static com.example.wealthmaster.accounts.AccountDtos.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AccountServiceTest {
    private AccountRepository accounts;
    private AuditService audit;
    private AccountService service;
    private AccountUsagePolicy usage;
    private final UUID owner = UUID.randomUUID();
    @BeforeEach void setup() {
        accounts = mock(AccountRepository.class); audit = mock(AuditService.class);
        usage = mock(AccountUsagePolicy.class);
        var ledger = mock(com.example.wealthmaster.ledger.LedgerService.class);
        when(ledger.movements(any())).thenReturn(java.math.BigDecimal.ZERO);
        when(ledger.today()).thenReturn(LocalDate.of(2026, 10, 4));
        service = new AccountService(accounts, audit, usage, ledger);
        when(accounts.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }
    private CreateAccount input(AccountType type, String amount, BalanceMeaning meaning, String currency) {
        return new CreateAccount("  Test  ", type, " ", currency, amount, meaning, LocalDate.of(2026, 10, 4));
    }
    @Test void positiveCreditCardDebtIsStoredAsNegativeAndAudited() {
        var result = service.create(owner, input(AccountType.CREDIT_CARD, "400.12345678", BalanceMeaning.AMOUNT_OWED, "CHF"));
        assertEquals("-400.12345678", result.openingBalance());
        assertEquals("Test", result.name()); assertNull(result.institution());
        verify(audit).accountCreated(owner, result.id());
    }
    @Test void creditCardOverpaymentRemainsPositive() {
        assertEquals("50.00", service.create(owner, input(AccountType.CREDIT_CARD, "50.00", BalanceMeaning.IN_CREDIT, "EUR")).openingBalance());
    }
    @Test void exactLargeSignedBalancesArePreserved() {
        String amount = "-99999999999999999999.12345678";
        assertEquals(amount, service.create(owner, input(AccountType.CHECKING, amount, BalanceMeaning.BALANCE, "USD")).openingBalance());
    }
    @Test void negativeDebtAndWrongBalanceMeaningAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> service.create(owner, input(AccountType.CREDIT_CARD, "-1", BalanceMeaning.AMOUNT_OWED, "CHF")));
        assertThrows(IllegalArgumentException.class, () -> service.create(owner, input(AccountType.CREDIT_CARD, "1", BalanceMeaning.BALANCE, "CHF")));
        assertThrows(IllegalArgumentException.class, () -> service.create(owner, input(AccountType.CASH, "1", BalanceMeaning.AMOUNT_OWED, "CHF")));
        verifyNoInteractions(accounts, audit);
    }
    @Test void invalidAndPseudoCurrenciesAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> service.create(owner, input(AccountType.CHECKING, "1", BalanceMeaning.BALANCE, "ZZZ")));
        assertThrows(IllegalArgumentException.class, () -> service.create(owner, input(AccountType.CHECKING, "1", BalanceMeaning.BALANCE, "XXX")));
        verifyNoInteractions(accounts, audit);
    }
    @Test void invalidAmountsCannotBeRoundedOrOverflowedByPersistence() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            for (String amount : new String[]{"1.123456789", "100000000000000000000", "NaN", "1e3", "1,23"}) {
                assertFalse(validator.validate(input(AccountType.CHECKING, amount, BalanceMeaning.BALANCE, "CHF")).isEmpty());
            }
            assertTrue(validator.validate(input(AccountType.CHECKING, "99999999999999999999.12345678", BalanceMeaning.BALANCE, "CHF")).isEmpty());
        }
    }
    @Test void applicationServiceRejectsPrecisionLossBeforeWriting() {
        for (String amount : new String[]{"1.123456789", "100000000000000000000", "1e3", "NaN"}) {
            assertThrows(IllegalArgumentException.class, () -> service.create(owner, input(AccountType.CHECKING, amount, BalanceMeaning.BALANCE, "CHF")));
        }
        verifyNoInteractions(accounts, audit);
    }
    @Test void accountListsAreScopedToTheCaller() {
        service.list(owner);
        verify(accounts).findByOwnerIdOrderByCreatedAtDescIdAsc(owner);
        verifyNoMoreInteractions(accounts);
    }

    private FinancialAccount existing() {
        var account = new FinancialAccount(owner, "Existing", AccountType.CHECKING, null, "CHF", new java.math.BigDecimal("5.00"), LocalDate.of(2026, 10, 4));
        when(accounts.findByIdAndOwnerId(account.getId(), owner)).thenReturn(java.util.Optional.of(account));
        return account;
    }
    @Test void usedAccountsPermitOpeningDateCorrectionsButLockTypeCurrencyAndAmount() {
        var account = existing(); when(usage.hasActivity(account.getId())).thenReturn(true);
        var updated = service.update(owner, account.getId(), "\"0\"", input(AccountType.CHECKING, "5", BalanceMeaning.BALANCE, "CHF"));
        assertEquals("Test", updated.name()); assertTrue(updated.hasActivity());
        for (CreateAccount changed : java.util.List.of(
                input(AccountType.SAVINGS, "5", BalanceMeaning.BALANCE, "CHF"),
                input(AccountType.CHECKING, "5", BalanceMeaning.BALANCE, "EUR"),
                input(AccountType.CHECKING, "6", BalanceMeaning.BALANCE, "CHF"))) {
            assertEquals(409, assertThrows(AccountFailure.class, () -> service.update(owner, account.getId(), "\"0\"", changed)).status());
        }
        var redated = service.update(owner, account.getId(), "\"0\"", new CreateAccount("Test", AccountType.CHECKING, null, "CHF", "5", BalanceMeaning.BALANCE, LocalDate.of(2025,1,1)));
        assertEquals(LocalDate.of(2025,1,1),redated.openingDate());
        assertEquals(409, assertThrows(AccountFailure.class, () -> service.delete(owner, account.getId(), "\"0\"")).status());
        verify(accounts, never()).delete(any());
        assertFalse(service.setActive(owner, account.getId(), "\"0\"", false).active());
        assertTrue(service.setActive(owner, account.getId(), "\"0\"", true).active());
    }
    @Test void unusedAccountsCanChangeTypeAndRetainExactLargeOpeningAmount() {
        var account = existing();
        var updated = service.update(owner, account.getId(), "\"0\"", input(AccountType.CREDIT_CARD, "99999999999999999999.12345678", BalanceMeaning.AMOUNT_OWED, "USD"));
        assertEquals("-99999999999999999999.12345678", updated.openingBalance());
        verify(audit).accountChanged(eq(owner), eq(account.getId()), eq("ACCOUNT_UPDATED"), any(), eq(updated));
    }
    @Test void versionPreconditionsAndUnknownOwnerCannotMutate() {
        var account = existing();
        assertEquals(428, assertThrows(AccountFailure.class, () -> service.delete(owner, account.getId(), null)).status());
        assertEquals(400, assertThrows(AccountFailure.class, () -> service.delete(owner, account.getId(), "*")).status());
        assertEquals(412, assertThrows(AccountFailure.class, () -> service.delete(owner, account.getId(), "\"1\"")).status());
        assertEquals(404, assertThrows(AccountFailure.class, () -> service.delete(UUID.randomUUID(), account.getId(), "\"0\"")).status());
        verifyNoInteractions(audit);
    }
    @Test void nonzeroOpeningBalanceDoesNotPreventDeletionAndSnapshotIsAudited() {
        var account = existing(); service.delete(owner, account.getId(), "\"0\"");
        verify(accounts).delete(account);
        verify(audit).accountChanged(eq(owner), eq(account.getId()), eq("ACCOUNT_DELETED"), argThat(snapshot -> snapshot.openingBalance().equals("5.00")), isNull());
    }
    @Test void activityPolicyUsesAllContributorsAndDoesNotTreatNoModulesAsActivity() {
        var id = UUID.randomUUID();
        assertFalse(new AccountUsagePolicy(java.util.List.of()).hasActivity(id));
        assertTrue(new AccountUsagePolicy(java.util.List.of(accountId -> false, accountId -> accountId.equals(id))).hasActivity(id));
    }
}
