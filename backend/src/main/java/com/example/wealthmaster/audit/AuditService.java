package com.example.wealthmaster.audit;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.UUID;
import tools.jackson.databind.ObjectMapper;
import com.example.wealthmaster.accounts.AccountDtos.AccountResponse;

@Service
public class AuditService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public AuditService(JdbcTemplate jdbc, ObjectMapper mapper) { this.jdbc = jdbc; this.mapper = mapper; }
    public void accountCreated(UUID ownerId, UUID accountId) {
        jdbc.update("INSERT INTO audit_events (id, actor_id, event_type, resource_id) VALUES (?, ?, 'ACCOUNT_CREATED', ?)",
                UUID.randomUUID(), ownerId, accountId);
    }
    public void accountChanged(UUID owner, UUID id, String event, AccountResponse before, AccountResponse after) {
        var details = new AccountChange(before, after);
        jdbc.update("INSERT INTO audit_events(id, actor_id, event_type, resource_id, details) VALUES (?, ?, ?, ?, CAST(? AS jsonb))",
                UUID.randomUUID(), owner, event, id, mapper.writeValueAsString(details));
    }
    private record AccountChange(AccountResponse before, AccountResponse after) {}
}
