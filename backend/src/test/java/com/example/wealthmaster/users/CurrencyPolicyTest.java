package com.example.wealthmaster.users;

import com.example.wealthmaster.budgets.CategoryFailure;
import com.example.wealthmaster.budgets.BudgetDtos.Period;
import com.example.wealthmaster.config.BusinessTime;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.LocalDate;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CurrencyPolicyTest {
    @Test void explicitSelectionVersionsAndCurrentPeriodBoundaries() {
        var owner=UUID.randomUUID();var time=mock(BusinessTime.class);
        when(time.today()).thenReturn(LocalDate.of(2026,8,20));
        var policy=spy(new CurrencyPolicy(mock(JdbcTemplate.class),time));
        doReturn(new CurrencyPolicy.Preferences(null,0)).when(policy).get(owner);
        assertEquals(409,assertThrows(CategoryFailure.class,()->policy.require(owner)).status());
        doReturn(new CurrencyPolicy.Preferences("CHF",2)).when(policy).get(owner);
        policy.normal(owner,"CHF");policy.match(owner,2L);
        assertEquals(412,assertThrows(CategoryFailure.class,()->policy.match(owner,1L)).status());
        assertThrows(CategoryFailure.class,()->policy.match(owner,null));
        assertEquals(409,assertThrows(CategoryFailure.class,()->policy.normal(owner,"EUR")).status());
    }
    @Test void acceptsOnlySupportedIsoCodes() {
        CurrencyPolicy.validate("CHF");CurrencyPolicy.validate("EUR");
        for(var code:new String[]{null,"chf","XYZ","EURO",""})assertThrows(IllegalArgumentException.class,()->CurrencyPolicy.validate(code));
    }
}
