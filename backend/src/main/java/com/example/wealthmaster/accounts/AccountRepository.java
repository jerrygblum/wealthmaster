package com.example.wealthmaster.accounts;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface AccountRepository extends JpaRepository<FinancialAccount, UUID> {
    List<FinancialAccount> findByOwnerIdOrderByCreatedAtDescIdAsc(UUID ownerId);
}
