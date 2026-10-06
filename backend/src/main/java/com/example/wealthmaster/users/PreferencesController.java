package com.example.wealthmaster.users;

import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/users/me/preferences")
public class PreferencesController {
    private final PreferencesService service;
    public PreferencesController(PreferencesService service) { this.service=service; }
    @GetMapping public ResponseEntity<PreferencesService.View> get(@AuthenticationPrincipal OwnerPrincipal owner) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(owner.id()));
    }
    @PutMapping public PreferencesService.View save(@AuthenticationPrincipal OwnerPrincipal owner,@Valid @RequestBody PreferencesService.Input input) {
        return service.save(owner.id(),input);
    }
}
