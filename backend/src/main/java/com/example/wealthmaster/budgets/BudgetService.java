package com.example.wealthmaster.budgets;

import com.example.wealthmaster.config.BusinessTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.math.*;
import java.time.LocalDate;
import java.util.*;
import static com.example.wealthmaster.budgets.BudgetDtos.*;

@Service
public class BudgetService {
    private final BusinessTime time;
    private final EffectiveBudgetService effective;
    public BudgetService(BusinessTime time, EffectiveBudgetService effective) {
        this.time=time;this.effective=effective;
    }
    static void requireMainCategory(UUID parentId) {
        if(parentId!=null) throw new CategoryFailure(409,"Spending limits can only be set on main categories. Subcategory spending is included in its main category.");
    }
    static BigDecimal amount(String value) {
        if(value==null || !value.matches("[0-9]{1,20}(\\.[0-9]{1,8})?")) throw new IllegalArgumentException("Enter a non-negative decimal with at most 20 integer digits and 8 decimal places.");
        return new BigDecimal(value);
    }
    static LocalDate end(Period type, LocalDate start) {
        if(type==null || start==null || start.getDayOfMonth()!=1 || type==Period.YEAR && start.getMonthValue()!=1)
            throw new IllegalArgumentException("Use the first day of a month, or January 1 for a year.");
        return type==Period.MONTH?start.plusMonths(1):start.plusYears(1);
    }
    static String percentage(BigDecimal limit, BigDecimal actual) {
        return limit.signum()==0?null:actual.multiply(new BigDecimal("100")).divide(limit,2,RoundingMode.HALF_UP).toPlainString();
    }
    static BigDecimal allowance(BudgetSettingService.Mode mode, String value, Period period) {
        if(mode==BudgetSettingService.Mode.NONE) return null;
        var amount=new BigDecimal(value);
        if(mode.name().equals(period.name())) return amount;
        return period==Period.YEAR?amount.multiply(new BigDecimal("12")):amount.divide(new BigDecimal("12"),8,RoundingMode.HALF_UP);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Report report(UUID owner,Period type,LocalDate start) {
        if(type==null) type=Period.MONTH;
        if(start==null) start=type==Period.MONTH?time.today().withDayOfMonth(1):time.today().withDayOfYear(1);
        end(type,start);
        var resolved=effective.report(owner,type,start);
        return new Report(type,start,resolved.currencies(),resolved.comparisons(),resolved.businessDate());
    }
}
