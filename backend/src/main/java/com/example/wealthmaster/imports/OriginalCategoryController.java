package com.example.wealthmaster.imports;

import com.example.wealthmaster.users.OwnerPrincipal;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/v1/imports/original-categories")
public class OriginalCategoryController {
    private final OriginalCategoryService service;
    public OriginalCategoryController(OriginalCategoryService service) {this.service=service;}
    @GetMapping public ResponseEntity<List<OriginalCategoryService.Group>> groups(@AuthenticationPrincipal OwnerPrincipal owner) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.groups(owner.id()));
    }
    @PostMapping public OriginalCategoryService.Applied apply(@AuthenticationPrincipal OwnerPrincipal owner,
        @Valid @RequestBody OriginalCategoryService.Mapping mapping) {return service.apply(owner.id(),mapping);}
}
