package com.example.wealthmaster.users;

import com.example.wealthmaster.budgets.CategoryFailure;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class CurrencyPolicy {
    public record Preferences(String defaultCurrency, long version) {}
    private final JdbcTemplate jdbc;
    public CurrencyPolicy(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public Preferences get(UUID owner) {
        return jdbc.query("SELECT default_currency,version FROM user_preferences WHERE owner_id=?",
            (r,n)->new Preferences(r.getString(1),r.getLong(2)),owner).stream().findFirst().orElse(new Preferences(null,0));
    }
    public static void validate(String currency) {
        try {
            if(currency==null || !currency.matches("[A-Z]{3}")) throw new IllegalArgumentException();
            Currency.getInstance(currency);
        } catch(IllegalArgumentException e) { throw new IllegalArgumentException("Choose an ISO 4217 currency."); }
    }
    public void match(UUID owner,Long expected) {
        if(expected==null || expected!=get(owner).version()) throw new CategoryFailure(412,"Your default currency changed. Cancel and reload before saving.");
    }
}
