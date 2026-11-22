package com.example.wealthmaster.investments;

import com.example.wealthmaster.users.OwnerPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.example.wealthmaster.investments.InvestmentDtos.*;

@RestController
@RequestMapping("/api/v1/investments")
public class InvestmentController {
    private final InvestmentService service;
    public InvestmentController(InvestmentService service){this.service=service;}
    @GetMapping("/securities") public ResponseEntity<List<Security>> securities(@AuthenticationPrincipal OwnerPrincipal o){return read(service.securities(o.id()));}
    @PostMapping("/securities") @ResponseStatus(HttpStatus.CREATED) public Security security(@AuthenticationPrincipal OwnerPrincipal o,@Valid @RequestBody SecurityInput input){return service.createSecurity(o.id(),input);}
    @GetMapping("/accounts/{id}") public ResponseEntity<AccountView> account(@AuthenticationPrincipal OwnerPrincipal o,@PathVariable UUID id){return read(service.view(o.id(),id));}
    @PostMapping("/preview") public ResponseEntity<Preview> preview(@AuthenticationPrincipal OwnerPrincipal o,@Valid @RequestBody Input input){return read(service.preview(o.id(),input));}
    @PostMapping("/activities") @ResponseStatus(HttpStatus.CREATED) public Activity commit(@AuthenticationPrincipal OwnerPrincipal o,@Valid @RequestBody Commit input){return service.commit(o.id(),input);}
    @GetMapping("/activities/{id}/reversal-preview") public ResponseEntity<ReversalPreview> reversal(@AuthenticationPrincipal OwnerPrincipal o,@PathVariable UUID id){return read(service.reversalPreview(o.id(),id));}
    @PostMapping("/activities/{id}/reverse") public Activity reverse(@AuthenticationPrincipal OwnerPrincipal o,@PathVariable UUID id,@Valid @RequestBody Reversal input){return service.reverse(o.id(),id,input);}
    private <T> ResponseEntity<T> read(T value){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);}
}
