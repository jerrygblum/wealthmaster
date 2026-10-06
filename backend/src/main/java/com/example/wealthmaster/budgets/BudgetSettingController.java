package com.example.wealthmaster.budgets;

import com.example.wealthmaster.users.OwnerPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
public class BudgetSettingController {
    private final BudgetSettingService settings;
    private final EffectiveBudgetService effective;
    private final EffectiveLimitService limits;
    public BudgetSettingController(BudgetSettingService settings,EffectiveBudgetService effective,EffectiveLimitService limits) {
        this.settings=settings;this.effective=effective;this.limits=limits;
    }
    @GetMapping("/api/v1/budget-settings") public ResponseEntity<BudgetSettingService.Settings> settings(@AuthenticationPrincipal OwnerPrincipal owner) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(settings.list(owner.id()));
    }
    @PutMapping("/api/v1/budget-settings") public BudgetSettingService.Setting save(@AuthenticationPrincipal OwnerPrincipal owner,@Valid @RequestBody BudgetSettingService.Input input) {return settings.save(owner.id(),input);}
    @PutMapping("/api/v1/budgets/effective-limit") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void saveLimit(@AuthenticationPrincipal OwnerPrincipal owner,@Valid @RequestBody EffectiveLimitService.Input input) {limits.save(owner.id(),input);}
    @DeleteMapping("/api/v1/budgets/effective-limit") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reset(@AuthenticationPrincipal OwnerPrincipal owner,@Valid @RequestBody EffectiveLimitService.Input input) {limits.reset(owner.id(),input);}
    @GetMapping("/api/v1/budgets/monthly-breakdown") public ResponseEntity<EffectiveBudgetService.Breakdown> breakdown(@AuthenticationPrincipal OwnerPrincipal owner,@RequestParam UUID categoryId,@RequestParam String currency,@RequestParam int year) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(effective.breakdown(owner.id(),categoryId,currency,year));
    }
}
