package com.example.wealthmaster.ledger;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class LedgerAmountTest {
 @Test void rejectsRoundingOverflowAndNonpositiveAmounts() {
  for(var value:new String[]{"0","0.00000000","-1","1e2","NaN","1,2","1.123456789","100000000000000000000"}) assertThrows(IllegalArgumentException.class,()->LedgerService.amount(value));
  assertEquals("99999999999999999999.12345678",LedgerService.amount("99999999999999999999.12345678").toPlainString());
 }
}
