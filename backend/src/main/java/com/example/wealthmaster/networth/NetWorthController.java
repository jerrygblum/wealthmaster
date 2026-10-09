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
    public NetWorthController(NetWorthService service) { this.service = service; }
    @GetMapping("/current")
    public ResponseEntity<CurrentNetWorth> current(@AuthenticationPrincipal OwnerPrincipal owner) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.current(owner.id()));
    }
}
