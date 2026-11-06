package com.example.wealthmaster.users;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DemoAccessTest {
    final String id="11111111-1111-4111-8111-111111111111";
    @Test void explicitlyAllowsFinancialCapabilitiesAndRejectsUnknownMethodsAndSubpaths() {
        for(var path:new String[]{"accounts","transactions","categories","spending","spending/activity","expected-transactions","investments/securities","net-worth/current","net-worth/trend","net-worth/trend/options","users/me/preferences","accounts/"+id,"investments/accounts/"+id,"investments/activities/"+id+"/reversal-preview","market-data/securities/"+id+"/nav-history","expected-transactions/"+id+"/occurrences/2026-11-01/candidates"})
            assertTrue(DemoAccess.allowed("GET","/api/v1/"+path),path);
        for(var path:new String[]{"accounts","transactions","transfers","categories","categories/starter-set","expected-transactions","investments/securities","investments/preview","investments/activities","accounts/"+id+"/archive","accounts/"+id+"/restore","categories/"+id+"/archive","categories/"+id+"/restore","investments/activities/"+id+"/reverse","market-data/securities/"+id+"/nav","expected-transactions/"+id+"/occurrences/2026-11-01/record"})
            assertTrue(DemoAccess.allowed("POST","/api/v1/"+path),path);
        for(var path:new String[]{"accounts/order","accounts/"+id,"accounts/"+id+"/appearance","transactions/"+id,"transfers/"+id,"categories/"+id,"expected-transactions/"+id,"expected-transactions/"+id+"/occurrences/2026-11-01","users/me/preferences"})
            assertTrue(DemoAccess.allowed("PUT","/api/v1/"+path),path);
        for(var resource:new String[]{"accounts","transactions","transfers","categories","expected-transactions"})assertTrue(DemoAccess.allowed("DELETE","/api/v1/"+resource+"/"+id));
        for(var method:new String[]{"GET","POST","PUT","DELETE","PATCH"})for(var path:new String[]{"users/me/security","users/me/registration","imports/workbooks","market-data/search","market-data/accounts/"+id+"/refresh","accounts/"+id+"/new-feature","future"})
            assertFalse(DemoAccess.allowed(method,"/api/v1/"+path),method+path);
    }
}
