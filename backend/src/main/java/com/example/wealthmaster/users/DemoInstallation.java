package com.example.wealthmaster.users;

import com.example.wealthmaster.config.BusinessTime;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
public class DemoInstallation {
    public static final String EMAIL = "demo@wealthmaster.example";
    private final DemoConfig config;
    private final JdbcTemplate db;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final DemoDataset dataset;
    private final BusinessTime time;
    private final String ownerEmail, ownerPassword;
    public DemoInstallation(DemoConfig config, JdbcTemplate db, UserRepository users, PasswordEncoder passwords,
            DemoDataset dataset, BusinessTime time, @Value("${app.initial-owner.email:}") String ownerEmail,
            @Value("${app.initial-owner.password:}") String ownerPassword) {
        this.config=config; this.db=db; this.users=users; this.passwords=passwords; this.dataset=dataset; this.time=time;
        this.ownerEmail=ownerEmail; this.ownerPassword=ownerPassword;
    }
    public record Marker(UUID userId, UUID generation, int datasetVersion, Instant seededAt) {}
    public record Availability(boolean enabled, Instant nextResetAt, String resetZone, Integer datasetVersion) {}
    public Marker marker() {
        var rows=db.query("SELECT * FROM demo_installation WHERE id=1",(r,n)->new Marker(r.getObject("user_id",UUID.class),r.getObject("generation",UUID.class),r.getInt("dataset_version"),r.getTimestamp("seeded_at").toInstant()));
        return rows.isEmpty()?null:rows.getFirst();
    }
    @Transactional
    public void initialize() {
        var marker=marker();
        if (!config.enabled()) {
            if (marker!=null) throw new IllegalStateException("A demo database must only run in demo mode.");
            return;
        }
        if (!ownerEmail.isBlank() || !ownerPassword.isBlank()) throw new IllegalStateException("Demo must not configure initial-owner credentials.");
        if (!"wealthmaster_demo".equals(db.queryForObject("SELECT current_database()",String.class)))
            throw new IllegalStateException("Demo requires its dedicated wealthmaster_demo database.");
        // Serialize initial provisioning even if two backends are accidentally started.
        db.execute("SELECT pg_advisory_xact_lock(682190432)");
        marker=marker();
        if (marker!=null) {
            var user=users.findById(marker.userId()).orElseThrow(()->new IllegalStateException("Demo identity missing."));
            if (users.count()!=1 || !EMAIL.equals(user.getEmail()) || user.getRole()!=AppUser.Role.MEMBER)
                throw new IllegalStateException("Demo database contains an unrecognised user.");
            return;
        }
        // A user-free database must also have no retained business data/audit history.
        if (users.count()!=0 || db.queryForObject("SELECT count(*) FROM audit_events",Long.class)!=0)
            throw new IllegalStateException("Refusing to seed an unrecognised installation.");
        var user=users.saveAndFlush(new AppUser(EMAIL,passwords.encode((UUID.randomUUID().toString()+UUID.randomUUID()).replace("-","")),AppUser.Role.MEMBER));
        dataset.seed(user.getId());
        db.update("INSERT INTO demo_installation(id,user_id,generation,dataset_version,seeded_at) VALUES(1,?,?,?,?)",
            user.getId(),UUID.randomUUID(),DemoDataset.VERSION,java.sql.Timestamp.from(time.now()));
    }
    public Availability availability() {
        if (!config.enabled()) return new Availability(false,null,null,null);
        var marker=marker();
        if (marker==null) throw new SecurityFailure(503,"The shared demo is being restored. Please retry shortly.",30);
        var zone=ZoneId.of("Europe/Zurich"); var now=time.now().atZone(zone);
        var next=now.toLocalDate().atTime(3,0).atZone(zone);
        if (!next.isAfter(now)) next=next.plusDays(1);
        return new Availability(true,next.toInstant(),zone.getId(),marker.datasetVersion());
    }
    public Marker require() {
        if (!config.enabled()) throw new SecurityFailure(404,"Demo access is not available.");
        var marker=marker();
        if (marker==null) throw new SecurityFailure(503,"The shared demo is being restored. Please retry shortly.",30);
        return marker;
    }
    public boolean valid(UUID userId,UUID generation) {
        if (!config.enabled()) return false;
        var marker=marker();
        return marker!=null && marker.userId().equals(userId) && marker.generation().equals(generation);
    }
    @Transactional
    public void consumeMutation(UUID userId,UUID generation) {
        if (!config.enabled() || db.update("UPDATE demo_installation SET mutation_requests=mutation_requests+1 WHERE id=1 AND user_id=? AND generation=? AND mutation_requests<5000",userId,generation)!=1)
            throw new SecurityFailure(429,"The shared demo has reached its editing limit. Please return after the scheduled reset.",60);
    }
}
