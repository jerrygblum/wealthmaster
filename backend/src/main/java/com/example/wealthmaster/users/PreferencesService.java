package com.example.wealthmaster.users;

import com.example.wealthmaster.budgets.*;
import com.example.wealthmaster.config.BusinessTime;
import jakarta.validation.constraints.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.util.*;

@Service
public class PreferencesService {
    public record Input(@NotBlank String defaultCurrency,@NotNull @Min(0) Long expectedVersion,boolean confirmLimitReset) {}
    public record View(String defaultCurrency,long version,boolean hasLimitsToReset) {}
    private final JdbcTemplate jdbc;
    private final CurrencyPolicy currency;
    private final CategoryService categories;
    private final BudgetSettingService settings;
    private final ObjectMapper mapper;
    public PreferencesService(JdbcTemplate jdbc,CurrencyPolicy currency,CategoryService categories,BudgetSettingService settings,ObjectMapper mapper) {
        this.jdbc=jdbc;this.currency=currency;this.categories=categories;this.settings=settings;this.mapper=mapper;
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public View get(UUID owner) {
        var p=currency.get(owner);
        return new View(p.defaultCurrency(),p.version(),settings.list(owner).items().stream().anyMatch(s->s.mode()!=BudgetSettingService.Mode.NONE));
    }
    @Transactional
    public View save(UUID owner,Input input) {
        categories.lock(owner);CurrencyPolicy.validate(input.defaultCurrency());currency.match(owner,input.expectedVersion());
        var before=get(owner);
        if(Objects.equals(before.defaultCurrency(),input.defaultCurrency())) return before;
        if(before.hasLimitsToReset()&&!input.confirmLimitReset()) throw new CategoryFailure(409,"Confirm that category spending limits will be cleared. You must enter spending limits again in the new currency.");
        for(var s:settings.list(owner).items()) if(s.mode()!=BudgetSettingService.Mode.NONE)
            settings.save(owner,new BudgetSettingService.Input(s.categoryId(),s.currency(),BudgetSettingService.Mode.NONE,null,new BudgetDtos.Source(s.id(),s.version())));
        jdbc.update("INSERT INTO user_preferences(owner_id,default_currency,version) VALUES(?,?,1) ON CONFLICT(owner_id) DO UPDATE SET default_currency=EXCLUDED.default_currency,version=user_preferences.version+1",owner,input.defaultCurrency());
        var after=get(owner);
        jdbc.update("INSERT INTO audit_events(id,actor_id,event_type,resource_id,details) VALUES(?,?,?,?,CAST(? AS jsonb))",UUID.randomUUID(),owner,"DEFAULT_CURRENCY_CHANGED",owner,mapper.writeValueAsString(Map.of("before",before,"after",after)));
        return after;
    }
}
