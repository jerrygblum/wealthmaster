package com.example.wealthmaster.users;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component
@Order(-100)
public class DemoBootstrap implements ApplicationRunner {
    private final DemoInstallation installation;
    public DemoBootstrap(DemoInstallation installation) { this.installation=installation; }
    @Override public void run(ApplicationArguments args) { installation.initialize(); }
}
