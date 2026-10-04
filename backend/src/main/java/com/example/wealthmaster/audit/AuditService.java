package com.example.wealthmaster.audit;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.UUID;

@Service
public class AuditService {
    private final JdbcTemplate jdbc;
    public AuditService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public void accountCreated(UUID ownerId, UUID accountId) {
        jdbc.update("INSERT INTO audit_events (id, actor_id, event_type, resource_id) VALUES (?, ?, 'ACCOUNT_CREATED', ?)",
                UUID.randomUUID(), ownerId, accountId);
    }
}
