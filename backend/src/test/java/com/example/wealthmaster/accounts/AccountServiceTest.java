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
    private final UUID owner = UUID.randomUUID();
    @BeforeEach void setup() {
        accounts = mock(AccountRepository.class); audit = mock(AuditService.class);
        service = new AccountService(accounts, audit);
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
}
