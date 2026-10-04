package com.example.wealthmaster.users;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import static com.example.wealthmaster.users.MfaRepository.Operation.*;

@RestController
@RequestMapping("/api/v1/users/me")
public class MfaController {
    private final MfaService mfa;
    private final MfaSessions sessions;
    public MfaController(MfaService mfa, MfaSessions sessions) { this.mfa = mfa; this.sessions = sessions; }
    @GetMapping("/security") public MfaService.SecurityStatus status(HttpServletRequest request) {
        return mfa.status(sessions.require(request).userId(), sessions.binding(request));
    }
    @PostMapping("/mfa/enrollment/start") public MfaService.Setup enroll(@Valid @RequestBody Proof input, HttpServletRequest request) {
        var state = sessions.require(request);
        return mfa.begin(state.userId(), sessions.binding(request), ENROLL, input.password(), input.factor(), input.kind(), state.verifiedAt());
    }
    @PostMapping("/mfa/replacement/start") public MfaService.Setup replace(@Valid @RequestBody Proof input, HttpServletRequest request) {
        var state = sessions.require(request);
        return mfa.begin(state.userId(), sessions.binding(request), REPLACE, input.password(), input.factor(), input.kind(), state.verifiedAt());
    }
    @PostMapping("/mfa/recovery/start") public MfaService.Setup recovery(@Valid @RequestBody Proof input, HttpServletRequest request) {
        var state = sessions.require(request);
        return mfa.begin(state.userId(), sessions.binding(request), RECOVERY, input.password(), input.factor(), input.kind(), state.verifiedAt());
    }
    @PostMapping("/mfa/enrollment/verify") public MfaService.Codes verify(@Valid @RequestBody EnrollmentCode input, HttpServletRequest request) {
        return mfa.verifyEnrollment(sessions.require(request).userId(), sessions.binding(request), input.code());
    }
    @PostMapping("/mfa/enrollment/confirm") public AuthController.SessionResponse confirm(@Valid @RequestBody Confirmation input,
            HttpServletRequest request, HttpServletResponse response) {
        return sessions.verified(mfa.confirm(sessions.require(request).userId(), sessions.binding(request), input.recoveryCodesSaved()), request, response);
    }
    @PostMapping("/mfa/pending/cancel") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(HttpServletRequest request) { mfa.cancel(sessions.require(request).userId(), sessions.binding(request)); }
    public record Proof(@NotBlank @Size(max = 72) String password, @Size(max = 64) String factor, MfaService.FactorKind kind) {
        @Override public String toString() { return "Proof[redacted]"; }
    }
    public record EnrollmentCode(@NotBlank @Pattern(regexp = "[0-9]{6}") String code) {
        @Override public String toString() { return "EnrollmentCode[redacted]"; }
    }
    public record Confirmation(@AssertTrue(message = "Confirm that you saved your recovery codes.") boolean recoveryCodesSaved) {}
}
