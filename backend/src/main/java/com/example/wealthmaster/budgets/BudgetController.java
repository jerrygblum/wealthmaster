package com.example.wealthmaster.budgets;

import com.example.wealthmaster.users.OwnerPrincipal;
import com.example.wealthmaster.ledger.LedgerDtos;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.UUID;
import static com.example.wealthmaster.budgets.BudgetDtos.*;

@RestController
@RequestMapping("/api/v1/budgets")
public class BudgetController {
    private final BudgetService service;
    public BudgetController(BudgetService service) { this.service=service; }
    @GetMapping public ResponseEntity<Report> report(@AuthenticationPrincipal OwnerPrincipal owner,@RequestParam(required=false) Period periodType,@RequestParam(required=false) LocalDate periodStart) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.report(owner.id(),periodType,periodStart));
    }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) public Budget create(@AuthenticationPrincipal OwnerPrincipal owner,@Valid @RequestBody Input input) { return service.create(owner.id(),input); }
    @PutMapping("/{id}") public Budget update(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String match,@Valid @RequestBody Limit input) { return service.update(owner.id(),id,match,input); }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String match) { service.delete(owner.id(),id,match); }
    @PostMapping("/copy") public CopyResult copy(@AuthenticationPrincipal OwnerPrincipal owner,@Valid @RequestBody Copy input) { return service.copy(owner.id(),input); }
    @GetMapping("/{id}/activity") public ResponseEntity<LedgerDtos.ActivityPage> activity(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@RequestParam(defaultValue="0") int page) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.activity(owner.id(),id,page)); }
}
