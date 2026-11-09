package com.example.wealthmaster.accounts;

import com.example.wealthmaster.users.OwnerPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;
import static com.example.wealthmaster.accounts.AccountDtos.*;

@RestController
@RequestMapping("/api/v1/accounts")
public class AccountController {
    private final AccountService service;
    private final AccountBalanceService balances;
    public AccountController(AccountService service, AccountBalanceService balances) { this.service = service; this.balances=balances; }
    @GetMapping
    public List<AccountResponse> list(@AuthenticationPrincipal OwnerPrincipal owner) {
        return service.list(owner.id());
    }
    @GetMapping("/{id}/balance")
    public org.springframework.http.ResponseEntity<AccountBalanceDtos.Balance> balance(@AuthenticationPrincipal OwnerPrincipal owner,
            @PathVariable UUID id,@RequestParam java.time.LocalDate date,
            @RequestParam(defaultValue="false") boolean includeExpected,@RequestParam(defaultValue="0") int page) {
        return org.springframework.http.ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).body(balances.balance(owner.id(),id,date,includeExpected,page));
    }
    @PutMapping("/order")
    public List<AccountResponse> reorder(@AuthenticationPrincipal OwnerPrincipal owner, @Valid @RequestBody AccountOrder input) {
        return service.reorder(owner.id(), input);
    }
    @PutMapping("/{id}/appearance")
    public AccountResponse appearance(@AuthenticationPrincipal OwnerPrincipal owner, @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String match, @Valid @RequestBody Appearance input) {
        return service.appearance(owner.id(), id, match, input);
    }
    @GetMapping("/{id}")
    public AccountResponse detail(@AuthenticationPrincipal OwnerPrincipal owner, @PathVariable UUID id) { return service.detail(owner.id(), id); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public AccountResponse create(@AuthenticationPrincipal OwnerPrincipal owner, @Valid @RequestBody CreateAccount input) {
        return service.create(owner.id(), input);
    }
    @PutMapping("/{id}")
    public AccountResponse update(@AuthenticationPrincipal OwnerPrincipal owner, @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String match, @Valid @RequestBody CreateAccount input) {
        return service.update(owner.id(), id, match, input);
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal OwnerPrincipal owner, @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String match) { service.delete(owner.id(), id, match); }
    @PostMapping("/{id}/archive")
    public AccountResponse archive(@AuthenticationPrincipal OwnerPrincipal owner, @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String match) { return service.setActive(owner.id(), id, match, false); }
    @PostMapping("/{id}/restore")
    public AccountResponse restore(@AuthenticationPrincipal OwnerPrincipal owner, @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String match) { return service.setActive(owner.id(), id, match, true); }
}
