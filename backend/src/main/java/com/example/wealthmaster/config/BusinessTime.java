package com.example.wealthmaster.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.time.*;

/** One calendar policy for date-only financial activity and current reports. */
@Component
public class BusinessTime {
    private final Clock clock;
    private final ZoneId zone;
    public BusinessTime(Clock clock, @Value("${APP_BUSINESS_TIME_ZONE:Europe/Zurich}") String zone) {
        this.clock = clock; this.zone = ZoneId.of(zone);
    }
    public Instant now() { return clock.instant(); }
    public LocalDate dateAt(Instant instant) { return LocalDate.ofInstant(instant, zone); }
    public LocalDate today() { return dateAt(now()); }
}
