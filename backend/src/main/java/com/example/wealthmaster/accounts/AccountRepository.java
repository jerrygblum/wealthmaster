package com.example.wealthmaster.accounts;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import java.util.UUID;

public interface AccountRepository extends JpaRepository<FinancialAccount, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<FinancialAccount> findByIdAndOwnerId(UUID id, UUID ownerId);
    List<FinancialAccount> findByOwnerIdOrderByCreatedAtDescIdAsc(UUID ownerId);
}
