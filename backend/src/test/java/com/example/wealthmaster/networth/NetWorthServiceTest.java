package com.example.wealthmaster.networth;

import com.example.wealthmaster.accounts.*;
import com.example.wealthmaster.accounts.AccountDtos.AccountResponse;
import com.example.wealthmaster.config.BusinessTime;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class NetWorthServiceTest {
    final UUID owner = UUID.randomUUID();
    final AccountService accounts = mock(AccountService.class);
    final Instant instant = Instant.parse("2026-10-04T22:30:00Z");
    final BusinessTime time = new BusinessTime(Clock.fixed(instant, ZoneOffset.UTC), "Europe/Zurich");
    final NetWorthService service = new NetWorthService(accounts, time);
    AccountResponse account(String name, AccountType type, String currency, String balance, boolean active, LocalDate date) {
        return new AccountResponse(UUID.randomUUID(), name, type, null, currency, balance, date, active, instant,
                0, false, balance, time.today());
    }
    @Test void separatesCurrenciesAndClassifiesBySignedPositionWithExactLargeTotals() {
        when(accounts.list(owner)).thenReturn(List.of(
            account("Bank", AccountType.CHECKING, "CHF", "99999999999999999999.12345678", true, time.today()),
            account("Archived cash", AccountType.CASH, "CHF", "99999999999999999999.12345678", false, time.today()),
            account("Overdraft", AccountType.CHECKING, "CHF", "-50.00000001", true, time.today()),
            account("Card debt", AccountType.CREDIT_CARD, "CHF", "-100", true, time.today()),
            account("Card credit", AccountType.CREDIT_CARD, "CHF", "20", true, time.today()),
            account("Broker cash", AccountType.INVESTMENT, "EUR", "0.12345678", true, time.today()),
            account("Zero", AccountType.OTHER, "EUR", "0", true, time.today())));
        var report = service.current(owner);
        assertEquals(7, report.accounts().size()); assertEquals(2, report.currencies().size());
        var chf = report.currencies().getFirst();
        assertEquals("CHF", chf.currency()); assertEquals("200000000000000000018.24691356", chf.assets());
        assertEquals("150.00000001", chf.liabilities()); assertEquals("199999999999999999868.24691355", chf.netWorth());
        var cards = chf.byAccountType().stream().filter(t -> t.type() == AccountType.CREDIT_CARD).findFirst().orElseThrow();
        assertEquals("20", cards.assets()); assertEquals("100", cards.liabilities()); assertEquals("-80", cards.netWorth());
        assertEquals("0.12345678", report.currencies().getLast().netWorth());
        verify(accounts).list(owner);
    }
    @Test void excludesFutureAccountsAndIncludesOpeningDayUsingBusinessTimezone() {
        var future = account("Future", AccountType.SAVINGS, "USD", "500", false, time.today().plusDays(1));
        when(accounts.list(owner)).thenReturn(List.of(future, account("Opens today", AccountType.CASH, "CHF", "-1", true, time.today())));
        var report = service.current(owner);
        assertEquals(LocalDate.of(2026, 10, 5), report.balanceAsOf()); assertEquals(instant, report.calculatedAt());
        assertEquals("-1", report.currencies().getFirst().netWorth()); assertEquals(1, report.accounts().size());
        assertEquals(future.id(), report.excludedFutureAccounts().getFirst().id()); assertFalse(report.excludedFutureAccounts().getFirst().active());
        assertEquals(LocalDate.of(2026, 10, 4), new BusinessTime(Clock.fixed(instant, ZoneOffset.UTC), "UTC").today());
    }
    @Test void emptyAndFutureOnlyReportsDoNotInventCurrencyTotals() {
        when(accounts.list(owner)).thenReturn(List.of()); assertTrue(service.current(owner).currencies().isEmpty());
        when(accounts.list(owner)).thenReturn(List.of(account("Future", AccountType.CASH, "CHF", "10", true, time.today().plusDays(1))));
        var report = service.current(owner); assertTrue(report.currencies().isEmpty()); assertTrue(report.accounts().isEmpty()); assertEquals(1, report.excludedFutureAccounts().size());
    }
}
