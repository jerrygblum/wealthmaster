package com.example.wealthmaster.users;

import jakarta.servlet.http.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth/demo")
public class DemoController {
    private final DemoInstallation installation;
    private final MfaSessions sessions;
    public DemoController(DemoInstallation installation,MfaSessions sessions) {this.installation=installation;this.sessions=sessions;}
    @GetMapping public ResponseEntity<DemoInstallation.Availability> availability() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(installation.availability());
    }
    @PostMapping("/session") public ResponseEntity<AuthController.SessionResponse> enter(HttpServletRequest request,HttpServletResponse response) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(sessions.demo(installation.require(),request,response));
    }
}
