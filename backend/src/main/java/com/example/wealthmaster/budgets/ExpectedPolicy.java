package com.example.wealthmaster.budgets;

import java.time.LocalDate;
import com.example.wealthmaster.ledger.LedgerDtos.Operation;
import static com.example.wealthmaster.budgets.ExpectedDtos.*;

final class ExpectedPolicy {
    private ExpectedPolicy() {}
    static LocalDate month(LocalDate value) {
        if(value == null || value.getYear()<1 || value.getYear()>9999 || value.getDayOfMonth()!=1)
            throw new IllegalArgumentException("Use the first day of a calendar month (years 1–9999).");
        return value;
    }
    static LocalDate due(LocalDate month, int day) { return month.withDayOfMonth(Math.min(day,month.lengthOfMonth())); }
    static boolean applies(Definition d, LocalDate month) {
        return !month.isBefore(d.firstMonth()) && (d.lastMonth()==null || !month.isAfter(d.lastMonth()));
    }
    static boolean compatible(Definition d, Operation op) {
        return op!=null && op.kind().name().equals(d.kind().name()) && op.currency().equals(d.currency())
            && op.accountId().equals(d.accountId()) && java.util.Objects.equals(op.destinationAccountId(),d.destinationAccountId());
    }
    static String status(boolean skipped, boolean linked, boolean valid, LocalDate due, LocalDate today) {
        if(skipped) return "SKIPPED";
        if(linked) return valid ? "COMPLETED" : "NEEDS_REVIEW";
        return due.isBefore(today) ? "OVERDUE" : due.equals(today) ? "DUE" : "UPCOMING";
    }
}
