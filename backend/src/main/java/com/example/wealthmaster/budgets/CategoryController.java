package com.example.wealthmaster.budgets;

import com.example.wealthmaster.users.OwnerPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
import static com.example.wealthmaster.budgets.CategoryDtos.*;

@RestController
@RequestMapping("/api/v1/categories")
public class CategoryController {
    private final CategoryService service;
    public CategoryController(CategoryService service) { this.service = service; }
    @GetMapping public CategoryList list(@AuthenticationPrincipal OwnerPrincipal owner) { return service.list(owner.id()); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public Category create(@AuthenticationPrincipal OwnerPrincipal owner, @Valid @RequestBody Input input) { return service.create(owner.id(), input); }
    @PutMapping("/{id}")
    public Category update(@AuthenticationPrincipal OwnerPrincipal owner, @PathVariable UUID id, @RequestHeader(value="If-Match",required=false) String match, @Valid @RequestBody Input input) { return service.update(owner.id(), id, match, input); }
    @PostMapping("/{id}/archive")
    public Category archive(@AuthenticationPrincipal OwnerPrincipal owner, @PathVariable UUID id, @RequestHeader(value="If-Match",required=false) String match) { return service.setActive(owner.id(),id,match,false); }
    @PostMapping("/{id}/restore")
    public Category restore(@AuthenticationPrincipal OwnerPrincipal owner, @PathVariable UUID id, @RequestHeader(value="If-Match",required=false) String match) { return service.setActive(owner.id(),id,match,true); }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal OwnerPrincipal owner, @PathVariable UUID id, @RequestHeader(value="If-Match",required=false) String match) { service.delete(owner.id(),id,match); }
    @PostMapping("/starter-set") @ResponseStatus(HttpStatus.CREATED)
    public CategoryList starterSet(@AuthenticationPrincipal OwnerPrincipal owner) { return service.starterSet(owner.id()); }
}
