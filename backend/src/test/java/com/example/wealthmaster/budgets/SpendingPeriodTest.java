package com.example.wealthmaster.budgets;

import com.example.wealthmaster.config.BusinessTime;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import static com.example.wealthmaster.budgets.SpendingPeriod.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SpendingPeriodTest {
    @Test void calendarBoundariesAndCanonicalStarts() {
        assertEquals(LocalDate.of(2024,3,1),MONTH.end(LocalDate.of(2024,2,1)));
        assertEquals(LocalDate.of(2027,1,1),MONTH.end(LocalDate.of(2026,12,1)));
        assertEquals(LocalDate.of(2025,1,1),YEAR.end(LocalDate.of(2024,1,1)));
        assertThrows(IllegalArgumentException.class,()->MONTH.end(LocalDate.of(2024,2,2)));
        assertThrows(IllegalArgumentException.class,()->YEAR.end(LocalDate.of(2024,2,1)));
    }
    @Test void businessDateDefaultsAndCutoffs() {
        var time=mock(BusinessTime.class);when(time.today()).thenReturn(LocalDate.of(2026,10,8));
        assertEquals(LocalDate.of(2026,10,1),MONTH.start(time));assertEquals(LocalDate.of(2026,1,1),YEAR.start(time));
        assertEquals(LocalDate.of(2026,10,9),MONTH.cutoff(MONTH.start(time),time));
        assertEquals(LocalDate.of(2026,10,9),YEAR.cutoff(YEAR.start(time),time));
        assertEquals(LocalDate.of(2024,3,1),MONTH.cutoff(LocalDate.of(2024,2,1),time));
    }
}
