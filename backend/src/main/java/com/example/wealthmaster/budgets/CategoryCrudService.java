package com.example.wealthmaster.budgets;

import com.example.wealthmaster.users.CurrencyPolicy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

@Service
public class CategoryCrudService {
    private final CategoryService categories;
    private final BudgetSettingService settings;
    private final CurrencyPolicy currency;
    public CategoryCrudService(CategoryService categories,BudgetSettingService settings,CurrencyPolicy currency) {
        this.categories=categories;this.settings=settings;this.currency=currency;
    }
    @Transactional
    public CategoryDtos.Category save(UUID owner,UUID id,String version,CategoryDtos.Input input) {
        categories.lock(owner);
        var result=id==null?categories.create(owner,input):categories.update(owner,id,version,input);
        var change=input.normalLimit();
        if(change!=null) {
            if(input.type()!=CategoryDtos.Type.SPENDING) throw new IllegalArgumentException("Only spending categories have limits.");
            BudgetService.requireMainCategory(result.parentId());
            currency.match(owner,change.expectedPreferencesVersion());
            if(change.mode()!=BudgetSettingService.Mode.NONE) currency.require(owner);
        }
        if(change!=null) {
            String target=currency.get(owner).defaultCurrency();
            // No default selected: an unchanged No limit creates no history.
            if(target!=null) {
                var current=settings.find(owner,result.id(),target);
                BudgetSettingService.check(current,change.expected());
                if(change.mode()!=BudgetSettingService.Mode.NONE || current!=null)
                    settings.save(owner,new BudgetSettingService.Input(result.id(),target,change.mode(),change.limit(),change.expected()));
            } else if(change.expected()!=null) throw new CategoryFailure(412,"Choose the default currency and reload limits before saving.");
        }
        return categories.list(owner).items().stream().filter(c->c.id().equals(result.id())).findFirst().orElseThrow();
    }
}
