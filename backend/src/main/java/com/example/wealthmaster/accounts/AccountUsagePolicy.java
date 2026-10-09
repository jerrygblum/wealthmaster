package com.example.wealthmaster.accounts;

import org.springframework.stereotype.Component;
import java.util.List;
import java.util.UUID;

/** Ledger/import/investment modules must contribute checks before they persist account references. */
@Component
public class AccountUsagePolicy {
    public interface ActivitySource { boolean hasActivity(UUID accountId); }
    private final List<ActivitySource> sources;
    public AccountUsagePolicy(List<ActivitySource> sources) { this.sources = List.copyOf(sources); }
    public boolean hasActivity(UUID accountId) { return sources.stream().anyMatch(source -> source.hasActivity(accountId)); }
}
