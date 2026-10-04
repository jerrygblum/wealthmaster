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
    public AccountController(AccountService service) { this.service = service; }
    @GetMapping
    public List<AccountResponse> list(@AuthenticationPrincipal OwnerPrincipal owner) {
        return service.list(owner.id());
    }
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
