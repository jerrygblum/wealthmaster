package com.example.wealthmaster.networth;

import com.example.wealthmaster.users.OwnerPrincipal;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static com.example.wealthmaster.networth.NetWorthDtos.*;

@RestController
@RequestMapping("/api/v1/net-worth")
public class NetWorthController {
    private final NetWorthService service;
    private final NetWorthTrendService trends;
    public NetWorthController(NetWorthService service, NetWorthTrendService trends) { this.service = service; this.trends = trends; }
    @GetMapping("/trend/options")
    public ResponseEntity<TrendDtos.Options> trendOptions(@AuthenticationPrincipal OwnerPrincipal owner) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(trends.options(owner.id()));
    }
    @GetMapping("/trend")
    public ResponseEntity<TrendDtos.Trend> trend(@AuthenticationPrincipal OwnerPrincipal owner,
            @RequestParam java.util.List<java.util.UUID> accountIds,
            @RequestParam java.time.LocalDate startDate, @RequestParam java.time.LocalDate endDate,
            @RequestParam TrendDtos.Bucket bucket) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(trends.trend(owner.id(), accountIds, startDate, endDate, bucket));
    }
    @GetMapping("/current")
    public ResponseEntity<CurrentNetWorth> current(@AuthenticationPrincipal OwnerPrincipal owner) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.current(owner.id()));
    }
}
