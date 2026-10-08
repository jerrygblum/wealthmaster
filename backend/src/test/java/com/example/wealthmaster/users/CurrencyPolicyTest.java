package com.example.wealthmaster.users;

import com.example.wealthmaster.budgets.CategoryFailure;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CurrencyPolicyTest {
    @Test void preferenceVersionsRejectStaleEdits() {
        var owner=UUID.randomUUID();
        var policy=spy(new CurrencyPolicy(mock(JdbcTemplate.class)));
        doReturn(new CurrencyPolicy.Preferences(null,0)).when(policy).get(owner);
        doReturn(new CurrencyPolicy.Preferences("CHF",2)).when(policy).get(owner);
        policy.match(owner,2L);
        assertEquals(412,assertThrows(CategoryFailure.class,()->policy.match(owner,1L)).status());
        assertThrows(CategoryFailure.class,()->policy.match(owner,null));
    }
    @Test void acceptsOnlySupportedIsoCodes() {
        CurrencyPolicy.validate("CHF");CurrencyPolicy.validate("EUR");
        for(var code:new String[]{null,"chf","XYZ","EURO",""})assertThrows(IllegalArgumentException.class,()->CurrencyPolicy.validate(code));
    }
}
