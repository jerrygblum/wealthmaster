package com.example.wealthmaster.budgets;

import com.example.wealthmaster.users.OwnerPrincipal;
import com.example.wealthmaster.ledger.LedgerDtos;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/spending")
public class SpendingController {
    private final SpendingService service;
    public SpendingController(SpendingService service) { this.service=service; }
    @GetMapping public ResponseEntity<SpendingService.Report> report(@AuthenticationPrincipal OwnerPrincipal owner,@RequestParam(required=false) SpendingPeriod periodType,@RequestParam(required=false) LocalDate periodStart) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.report(owner.id(),periodType,periodStart));
    }
    @GetMapping("/activity") public ResponseEntity<LedgerDtos.ActivityPage> activity(@AuthenticationPrincipal OwnerPrincipal owner,@RequestParam(required=false) SpendingPeriod periodType,@RequestParam(required=false) LocalDate periodStart,@RequestParam String currency,@RequestParam(required=false) UUID categoryId,@RequestParam(defaultValue="0") int page) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.activity(owner.id(),periodType,periodStart,currency,categoryId,page));
    }
}
