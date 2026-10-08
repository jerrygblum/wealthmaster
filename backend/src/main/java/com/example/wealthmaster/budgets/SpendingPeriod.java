package com.example.wealthmaster.budgets;

import com.example.wealthmaster.config.BusinessTime;
import java.time.LocalDate;

public enum SpendingPeriod {
    MONTH, YEAR;
    public LocalDate start(BusinessTime time) {
        return this == MONTH ? time.today().withDayOfMonth(1) : time.today().withDayOfYear(1);
    }
    public LocalDate end(LocalDate start) {
        if (start == null || start.getDayOfMonth() != 1 || this == YEAR && start.getMonthValue() != 1)
            throw new IllegalArgumentException("Use the first day of a month, or January 1 for a year.");
        return this == MONTH ? start.plusMonths(1) : start.plusYears(1);
    }
    public LocalDate cutoff(LocalDate start, BusinessTime time) {
        var end = end(start);
        var tomorrow = time.today().plusDays(1);
        return end.isBefore(tomorrow) ? end : tomorrow;
    }
}
