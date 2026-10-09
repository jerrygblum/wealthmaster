package com.example.wealthmaster.budgets;

import com.example.wealthmaster.users.OwnerPrincipal;
import com.example.wealthmaster.ledger.LedgerDtos.ActivityPage;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.UUID;
import static com.example.wealthmaster.budgets.ExpectedDtos.*;

@RestController
@RequestMapping("/api/v1/expected-transactions")
public class ExpectedController {
    private final ExpectedService service;
    public ExpectedController(ExpectedService service) {this.service=service;}
    @GetMapping public ResponseEntity<Report> report(@AuthenticationPrincipal OwnerPrincipal o,@RequestParam(required=false) LocalDate month) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.report(o.id(),month));
    }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) public Definition create(@AuthenticationPrincipal OwnerPrincipal o,@Valid @RequestBody Input i) {return service.save(o.id(),null,null,i);}
    @PutMapping("/{id}") public Definition update(@AuthenticationPrincipal OwnerPrincipal o,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String version,@Valid @RequestBody Input i) {return service.save(o.id(),id,version,i);}
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@AuthenticationPrincipal OwnerPrincipal o,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String version) {service.delete(o.id(),id,version);}
    @GetMapping("/{id}/occurrences/{month}/candidates") public ResponseEntity<ActivityPage> candidates(@AuthenticationPrincipal OwnerPrincipal o,@PathVariable UUID id,@PathVariable LocalDate month,@RequestParam(defaultValue="0") int page) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.candidates(o.id(),id,month,page));
    }
    @PutMapping("/{id}/occurrences/{month}") public Occurrence reconcile(@AuthenticationPrincipal OwnerPrincipal o,@PathVariable UUID id,@PathVariable LocalDate month,@RequestHeader(value="If-Match",required=false) String version,@Valid @RequestBody Reconcile i) {return service.reconcile(o.id(),id,month,version,i);}
    @PostMapping("/{id}/occurrences/{month}/record") public Occurrence record(@AuthenticationPrincipal OwnerPrincipal o,@PathVariable UUID id,@PathVariable LocalDate month,@RequestHeader(value="If-Match",required=false) String version,@Valid @RequestBody RecordInput i) {return service.record(o.id(),id,month,version,i);}
}
