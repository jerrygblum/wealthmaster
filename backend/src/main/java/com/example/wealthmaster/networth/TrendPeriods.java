package com.example.wealthmaster.networth;

import java.time.*;
import com.example.wealthmaster.networth.TrendDtos.Period;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import static com.example.wealthmaster.networth.TrendDtos.*;

final class TrendPeriods {
    private TrendPeriods() {}
    static List<Period> between(LocalDate start, LocalDate end, Bucket bucket, LocalDate today, int accountCount) {
        if (start == null || end == null || bucket == null || start.getYear() < 1 || end.getYear() > 9999
                || end.isBefore(start) || end.isAfter(today))
            throw new IllegalArgumentException("Choose valid dates on or before the business date and a time bucket.");
        var result = new ArrayList<Period>();
        var cursor = start;
        while (!cursor.isAfter(end)) {
            LocalDate first = switch (bucket) {
                case DAY -> cursor;
                case WEEK -> cursor.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                case MONTH -> cursor.withDayOfMonth(1);
                case QUARTER -> cursor.withMonth(((cursor.getMonthValue() - 1) / 3) * 3 + 1).withDayOfMonth(1);
                case YEAR -> cursor.withDayOfYear(1);
            };
            LocalDate last = switch (bucket) {
                case DAY -> first;
                case WEEK -> first.plusDays(6);
                case MONTH -> first.with(TemporalAdjusters.lastDayOfMonth());
                case QUARTER -> first.plusMonths(2).with(TemporalAdjusters.lastDayOfMonth());
                case YEAR -> first.with(TemporalAdjusters.lastDayOfYear());
            };
            var clipped = last.isAfter(end) ? end : last;
            result.add(new Period(cursor, clipped, !cursor.equals(first) || !clipped.equals(last)));
            if (result.size() > 2000 || (long) result.size() * accountCount > 100_000)
                throw new IllegalArgumentException("Too many trend points. Choose a shorter range, fewer accounts or coarser buckets.");
            if (clipped.equals(end)) break;
            cursor = clipped.plusDays(1);
        }
        return List.copyOf(result);
    }
}
