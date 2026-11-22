package com.example.wealthmaster.marketdata;
import com.example.wealthmaster.users.OwnerPrincipal;
import com.example.wealthmaster.investments.InvestmentDtos;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.example.wealthmaster.marketdata.MarketDtos.*;
@RestController
@RequestMapping("/api/v1/market-data")
public class MarketDataController {
    private final MarketDataService service;private final ManualNavService nav;
    public MarketDataController(MarketDataService service,ManualNavService nav){this.service=service;this.nav=nav;}
    @GetMapping("/securities/{id}/nav-history") public ResponseEntity<List<NavEntry>> navHistory(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(nav.history(owner.id(),id));}
    @PostMapping("/securities/{id}/nav") @ResponseStatus(HttpStatus.CREATED) public NavEntry recordNav(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@Valid @RequestBody NavInput input){return nav.record(owner.id(),id,input);}
    @GetMapping("/search") public ResponseEntity<List<Listing>> search(@RequestParam String q){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.search(q));}
    @PostMapping("/securities") @ResponseStatus(HttpStatus.CREATED) public InvestmentDtos.Security create(@AuthenticationPrincipal OwnerPrincipal owner,@Valid @RequestBody SymbolInput input){return service.create(owner.id(),input.symbol());}
    @PutMapping("/securities/{id}/listing") @ResponseStatus(HttpStatus.NO_CONTENT) public void bind(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@Valid @RequestBody SymbolInput input){service.bind(owner.id(),id,input.symbol());}
    @PostMapping("/accounts/{id}/refresh") public Refresh refresh(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id){return service.refresh(owner.id(),id);}
}
