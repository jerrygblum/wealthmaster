package com.example.wealthmaster.budgets;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class ExpectedPolicyTest {
    @Test void clampsCalendarDaysAndRejectsNonMonthStarts() {
        assertEquals(LocalDate.of(2024,2,29),ExpectedPolicy.due(LocalDate.of(2024,2,1),31));
        assertEquals(LocalDate.of(2025,2,28),ExpectedPolicy.due(LocalDate.of(2025,2,1),30));
        assertEquals(LocalDate.of(2026,4,30),ExpectedPolicy.due(LocalDate.of(2026,4,1),31));
        assertThrows(IllegalArgumentException.class,()->ExpectedPolicy.month(LocalDate.of(2026,1,2)));
        assertThrows(IllegalArgumentException.class,()->ExpectedPolicy.month(LocalDate.of(0,1,1)));
    }
    @Test void derivesStatusWithoutMarkingSuggestionsComplete() {
        var today=LocalDate.of(2026,10,8);
        assertEquals("UPCOMING",ExpectedPolicy.status(false,false,false,today.plusDays(1),today));
        assertEquals("DUE",ExpectedPolicy.status(false,false,false,today,today));
        assertEquals("OVERDUE",ExpectedPolicy.status(false,false,false,today.minusDays(1),today));
        assertEquals("COMPLETED",ExpectedPolicy.status(false,true,true,today,today));
        assertEquals("NEEDS_REVIEW",ExpectedPolicy.status(false,true,false,today,today));
        assertEquals("SKIPPED",ExpectedPolicy.status(true,false,false,today,today));
    }
    @Test void validatesExactPositiveDecimalInputs() {
        assertEquals("0.00000001",ExpectedService.amount("0.00000001").toPlainString());
        for(var value:new String[]{"0","-1","1e2","1.123456789","NaN"}) assertThrows(IllegalArgumentException.class,()->ExpectedService.amount(value));
    }
}
