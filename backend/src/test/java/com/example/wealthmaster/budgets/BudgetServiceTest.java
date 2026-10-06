package com.example.wealthmaster.budgets;

import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.LocalDate;
import static org.junit.jupiter.api.Assertions.*;
import static com.example.wealthmaster.budgets.BudgetDtos.Period.*;

class BudgetServiceTest {
    @Test void exactLimitsAndZero() {
        assertEquals(new BigDecimal("99999999999999999999.12345678"),BudgetService.amount("99999999999999999999.12345678"));
        assertEquals(BigDecimal.ZERO,BudgetService.amount("0"));
        for(var invalid:new String[]{"-1","1e2",".1","1.123456789","100000000000000000000","NaN"}) assertThrows(IllegalArgumentException.class,()->BudgetService.amount(invalid));
        assertThrows(IllegalArgumentException.class,()->BudgetService.amount(null));
        assertNull(BudgetService.percentage(BigDecimal.ZERO,BigDecimal.TEN));
        assertEquals("33.33",BudgetService.percentage(new BigDecimal("3"),BigDecimal.ONE));
        assertEquals("-200.00",BudgetService.percentage(BigDecimal.ONE,new BigDecimal("-2")));
        assertEquals("100.00",BudgetService.percentage(BigDecimal.TEN,BigDecimal.TEN));
    }
    @Test void canonicalCalendarPeriodsAndLeapYears() {
        assertEquals(LocalDate.of(2024,3,1),BudgetService.end(MONTH,LocalDate.of(2024,2,1)));
        assertEquals(LocalDate.of(2027,1,1),BudgetService.end(MONTH,LocalDate.of(2026,12,1)));
        assertEquals(LocalDate.of(2025,1,1),BudgetService.end(YEAR,LocalDate.of(2024,1,1)));
        assertThrows(IllegalArgumentException.class,()->BudgetService.end(MONTH,LocalDate.of(2024,2,2)));
        assertThrows(IllegalArgumentException.class,()->BudgetService.end(YEAR,LocalDate.of(2024,2,1)));
    }
    @Test void defaultsUseBusinessCalendarAcrossUtcMonthBoundary() {
        var time=new com.example.wealthmaster.config.BusinessTime(java.time.Clock.fixed(java.time.Instant.parse("2024-02-29T23:30:00Z"),java.time.ZoneOffset.UTC),"Europe/Zurich");
        var effective=org.mockito.Mockito.mock(EffectiveBudgetService.class);
        org.mockito.Mockito.when(effective.report(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any())).thenReturn(new EffectiveBudgetService.EffectiveReport(time.today(),java.util.List.of(),java.util.List.of()));
        var service=new BudgetService(org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class),org.mockito.Mockito.mock(CategoryService.class),time,org.mockito.Mockito.mock(tools.jackson.databind.ObjectMapper.class),effective);
        assertEquals(LocalDate.of(2024,3,1),service.report(java.util.UUID.randomUUID(),null,null).periodStart());
        assertEquals(LocalDate.of(2024,1,1),service.report(java.util.UUID.randomUUID(),YEAR,null).periodStart());
    }

}
