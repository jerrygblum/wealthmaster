package com.example.wealthmaster.users;

import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.example.wealthmaster.users.RegistrationService.*;

@RestController
@RequestMapping("/api/v1")
public class RegistrationController {
    private final RegistrationService registration;
    private final AttemptLimiter limits;
    private final MfaSessions sessions;
    public RegistrationController(RegistrationService registration,AttemptLimiter limits,MfaSessions sessions) {
        this.registration=registration;this.limits=limits;this.sessions=sessions;
    }
    private <T> ResponseEntity<T> read(T value) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value); }
    @GetMapping("/auth/registration") public ResponseEntity<Map<String,Boolean>> policy() { return read(Map.of("enabled",registration.enabled())); }
    @PostMapping("/auth/register") public ResponseEntity<AuthController.SessionResponse> signup(@Valid @RequestBody Signup input,HttpServletRequest request,HttpServletResponse response) {
        if(request.getUserPrincipal()!=null) throw new SecurityFailure(409,"Sign out before creating another account.");
        var user=limits.guard("registration:"+request.getRemoteAddr(),()-> {
            try { return registration.register(input); }
            catch(DataIntegrityViolationException error) { throw new SecurityFailure(403,"Unable to register with these details. Ask the owner for a valid invitation."); }
        });
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(sessions.passwordAccepted(new OwnerPrincipal(user.getId(),user.getEmail(),""),request,response));
    }
    @GetMapping("/registration") public ResponseEntity<Management> management(@AuthenticationPrincipal OwnerPrincipal actor) { return read(registration.management(actor.id())); }
    @PutMapping("/registration") public ResponseEntity<Settings> configure(@AuthenticationPrincipal OwnerPrincipal actor,@RequestHeader(value="If-Match",required=false) String match,@Valid @RequestBody SettingInput input) { return read(registration.configure(actor.id(),match,input)); }
    @PostMapping("/registration/invitations") public ResponseEntity<Issued> invite(@AuthenticationPrincipal OwnerPrincipal actor,@Valid @RequestBody InviteInput input) {
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(registration.invite(actor.id(),input));
    }
    @PostMapping("/registration/invitations/{id}/replace") public ResponseEntity<Issued> replace(@AuthenticationPrincipal OwnerPrincipal actor,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String match) { return read(registration.replace(actor.id(),id,match)); }
    @PostMapping("/registration/invitations/{id}/revoke") public ResponseEntity<Invitation> revoke(@AuthenticationPrincipal OwnerPrincipal actor,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String match) { return read(registration.revoke(actor.id(),id,match)); }
}
