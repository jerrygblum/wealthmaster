package com.example.wealthmaster.users;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

@Component
public final class DemoConfig {
    private final boolean enabled;
    private final String origin;
    public DemoConfig(@Value("${APP_DEMO_ENABLED:false}") boolean enabled,
                      @Value("${APP_DEMO_PUBLIC_ORIGIN:}") String origin, Environment environment) {
        this.enabled = enabled;
        this.origin = origin;
        if (enabled) {
            URI uri;
            try { uri = URI.create(origin); } catch (IllegalArgumentException e) { throw new IllegalStateException("A public HTTPS demo origin is required."); }
            if (!environment.acceptsProfiles(Profiles.of("prod")) || !"https".equals(uri.getScheme())
                || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null
                || uri.getRawFragment() != null || !(uri.getPath().isEmpty()) || !origin.equals(uri.getScheme()+"://"+uri.getRawAuthority()))
                throw new IllegalStateException("Demo requires the prod profile and an HTTPS origin without a path, credentials or query.");
        }
    }
    public boolean enabled() { return enabled; }
    public String origin() { return origin; }
}
