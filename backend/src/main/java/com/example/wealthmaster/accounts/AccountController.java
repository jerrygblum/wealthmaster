package com.example.wealthmaster.accounts;

import com.example.wealthmaster.users.OwnerPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.List;
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
}
