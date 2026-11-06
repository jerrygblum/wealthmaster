package com.example.wealthmaster.networth;

import com.example.wealthmaster.config.BusinessTime;
import org.junit.jupiter.api.Test;
import java.time.*;
import com.example.wealthmaster.networth.TrendDtos.Period;
import static org.junit.jupiter.api.Assertions.*;
import static com.example.wealthmaster.networth.TrendDtos.*;

class TrendPeriodsTest {
    final LocalDate today = LocalDate.of(2026,10,31);
    @Test void clipsCalendarBucketsAndIncludesLeapDay() {
        var months=TrendPeriods.between(LocalDate.of(2024,1,15),LocalDate.of(2024,3,12),Bucket.MONTH,today,1);
        assertEquals(3,months.size());
        assertEquals(new Period(LocalDate.of(2024,1,15),LocalDate.of(2024,1,31),true),months.getFirst());
        assertEquals(new Period(LocalDate.of(2024,2,1),LocalDate.of(2024,2,29),false),months.get(1));
        assertTrue(months.getLast().partial());
        assertEquals(LocalDate.of(2024,3,31),TrendPeriods.between(LocalDate.of(2024,2,1),LocalDate.of(2024,7,1),Bucket.QUARTER,today,1).getFirst().endDate());
        assertEquals(2,TrendPeriods.between(LocalDate.of(2023,12,31),LocalDate.of(2024,1,1),Bucket.YEAR,today,1).size());
    }
    @Test void weeksCloseOnSundayAndSingleDayRangesWork() {
        var weeks=TrendPeriods.between(LocalDate.of(2024,2,28),LocalDate.of(2024,3,5),Bucket.WEEK,today,1);
        assertEquals(LocalDate.of(2024,3,3),weeks.getFirst().endDate());
        assertEquals(LocalDate.of(2024,3,4),weeks.getLast().startDate());
        assertEquals(1,TrendPeriods.between(today,today,Bucket.DAY,today,1).size());
    }
    @Test void boundsWorkAndInvalidRangesFailBeforeExpensiveReads() {
        assertThrows(IllegalArgumentException.class,()->TrendPeriods.between(today,today.plusDays(1),Bucket.DAY,today,1));
        assertThrows(IllegalArgumentException.class,()->TrendPeriods.between(today,today.minusDays(1),Bucket.DAY,today,1));
        assertThrows(IllegalArgumentException.class,()->TrendPeriods.between(today.minusDays(2000),today,Bucket.DAY,today,1));
        assertThrows(IllegalArgumentException.class,()->TrendPeriods.between(today.minusDays(1000),today,Bucket.DAY,today,100));
        assertEquals(1,TrendPeriods.between(LocalDate.of(9999,12,31),LocalDate.of(9999,12,31),Bucket.YEAR,LocalDate.of(9999,12,31),1).size());
    }
    @Test void businessDayCutoffsRespectDstWithoutShiftingDateFields() {
        var time=new BusinessTime(Clock.systemUTC(),"Europe/Zurich");
        var spring=LocalDate.of(2026,3,29); var autumn=LocalDate.of(2026,10,25);
        assertEquals(23,Duration.between(time.startOfDay(spring),time.startOfDay(spring.plusDays(1))).toHours());
        assertEquals(25,Duration.between(time.startOfDay(autumn),time.startOfDay(autumn.plusDays(1))).toHours());
    }
}
