package com.example.wealthmaster.users;

import com.example.wealthmaster.budgets.CategoryFailure;
import com.example.wealthmaster.budgets.BudgetDtos.Period;
import com.example.wealthmaster.config.BusinessTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.*;

@Service
public class CurrencyPolicy {
    public record Preferences(String defaultCurrency, long version) {}
    private final JdbcTemplate jdbc;
    private final BusinessTime time;
    public CurrencyPolicy(JdbcTemplate jdbc, BusinessTime time) { this.jdbc=jdbc; this.time=time; }
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
    public String require(UUID owner) {
        var currency=get(owner).defaultCurrency();
        if(currency==null) throw new CategoryFailure(409,"Choose your default currency in Settings before enabling a spending limit.");
        return currency;
    }
    public void normal(UUID owner,String currency) {
        if(!require(owner).equals(currency)) throw new CategoryFailure(409,"Use your default currency for spending limits.");
    }
    public void match(UUID owner,Long expected) {
        if(expected==null || expected!=get(owner).version()) throw new CategoryFailure(412,"Your default currency changed. Cancel and reload before saving.");
    }
}
