package com.example.wealthmaster.budgets;

import com.example.wealthmaster.users.OwnerPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class BudgetSettingController {
    private final BudgetSettingService settings;
    public BudgetSettingController(BudgetSettingService settings) {this.settings=settings;}
    @GetMapping("/api/v1/budget-settings") public ResponseEntity<BudgetSettingService.Settings> settings(@AuthenticationPrincipal OwnerPrincipal owner) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(settings.list(owner.id()));
    }
    @PutMapping("/api/v1/budget-settings") public BudgetSettingService.Setting save(@AuthenticationPrincipal OwnerPrincipal owner,@Valid @RequestBody BudgetSettingService.Input input) {return settings.save(owner.id(),input);}
}
