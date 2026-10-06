package com.example.wealthmaster.budgets;

import jakarta.validation.constraints.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.UUID;
import static com.example.wealthmaster.budgets.BudgetDtos.*;

@Service
public class EffectiveLimitService {
    public enum Scope { PERIOD, NORMAL }
    public record Input(@NotNull UUID categoryId,@NotBlank String currency,@NotNull Period periodType,
                        @NotNull LocalDate periodStart,String limit,@NotNull Scope scope,
                        Source expectedSetting,Source expectedOverride) {}
    private final CategoryService categories;
    private final BudgetSettingService settings;
    private final EffectiveBudgetService effective;
    private final BudgetService budgets;
    public EffectiveLimitService(CategoryService categories,BudgetSettingService settings,EffectiveBudgetService effective,BudgetService budgets) {
        this.categories=categories;this.settings=settings;this.effective=effective;this.budgets=budgets;
    }
    private EffectiveBudgetService.ExceptionLimit check(UUID owner,Input input) {
        categories.lock(owner);BudgetSettingService.currency(input.currency());BudgetService.end(input.periodType(),input.periodStart());
        if(categories.list(owner).items().stream().noneMatch(c->c.id().equals(input.categoryId())&&c.type()==CategoryDtos.Type.SPENDING))throw new CategoryFailure(404,"Spending category not found.");
        BudgetSettingService.check(settings.find(owner,input.categoryId(),input.currency()),input.expectedSetting());
        var existing=effective.exceptions(owner).stream().filter(b->b.category().equals(input.categoryId())&&b.currency().equals(input.currency())&&b.type()==input.periodType()&&b.start().equals(input.periodStart())).findFirst().orElse(null);
        var expected=input.expectedOverride();
        if(existing==null?expected!=null:expected==null||!existing.id().equals(expected.id())||existing.version()!=expected.version())throw new CategoryFailure(412,"This period exception changed. Reload before saving; your input is retained.");
        return existing;
    }
    @Transactional public void save(UUID owner,Input input) {
        var existing=check(owner,input);BudgetService.amount(input.limit());
        if(input.scope()==Scope.NORMAL) {
            if(!input.periodStart().equals(effective.current(input.periodType())))throw new IllegalArgumentException("Only the current budget period can become the normal setting.");
            settings.save(owner,new BudgetSettingService.Input(input.categoryId(),input.currency(),BudgetSettingService.Mode.valueOf(input.periodType().name()),input.limit(),input.expectedSetting()));
            if(existing!=null)budgets.delete(owner,existing.id(),"\""+existing.version()+"\"");
        } else if(existing==null)budgets.create(owner,new BudgetDtos.Input(input.categoryId(),input.currency(),input.periodType(),input.periodStart(),input.limit()));
        else budgets.update(owner,existing.id(),"\""+existing.version()+"\"",new Limit(input.limit()));
    }
    @Transactional public void reset(UUID owner,Input input) {
        var existing=check(owner,input);
        if(existing==null)throw new CategoryFailure(404,"No exception for this period.");
        budgets.delete(owner,existing.id(),"\""+existing.version()+"\"");
    }
}
