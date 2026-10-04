package com.example.wealthmaster.ledger;
import com.example.wealthmaster.users.OwnerPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
import static com.example.wealthmaster.ledger.LedgerDtos.*;
@RestController
@RequestMapping("/api/v1")
public class LedgerController {
 private final LedgerService service;
 public LedgerController(LedgerService service) { this.service=service; }
 @GetMapping("/transactions") public ActivityPage list(@AuthenticationPrincipal OwnerPrincipal owner,@RequestParam(required=false) UUID accountId,@RequestParam(defaultValue="0") int page) { return service.list(owner.id(),accountId,page); }
 @PostMapping("/transactions") @ResponseStatus(HttpStatus.CREATED) public Operation create(@AuthenticationPrincipal OwnerPrincipal owner,@Valid @RequestBody TransactionInput input) { return service.transaction(owner.id(),null,null,input); }
 @PutMapping("/transactions/{id}") public Operation update(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String match,@Valid @RequestBody TransactionInput input) { return service.transaction(owner.id(),id,match,input); }
 @DeleteMapping("/transactions/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String match) { service.delete(owner.id(),id,match,false); }
 @PostMapping("/transfers") @ResponseStatus(HttpStatus.CREATED) public Operation transfer(@AuthenticationPrincipal OwnerPrincipal owner,@Valid @RequestBody TransferInput input) { return service.transfer(owner.id(),null,null,input); }
 @PutMapping("/transfers/{id}") public Operation updateTransfer(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String match,@Valid @RequestBody TransferInput input) { return service.transfer(owner.id(),id,match,input); }
 @DeleteMapping("/transfers/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteTransfer(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String match) { service.delete(owner.id(),id,match,true); }
}
