package com.example.wealthmaster.users;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DemoConfigTest {
    @Test void disabledIsDefaultAndEnabledRequiresAnUnambiguousHttpsOriginAndProd() {
        var dev=new MockEnvironment();dev.setActiveProfiles("dev");
        assertFalse(new DemoConfig(false,"",dev).enabled());
        assertThrows(IllegalStateException.class,()->new DemoConfig(true,"https://demo.example.test",dev));
        var prod=new MockEnvironment();prod.setActiveProfiles("prod");
        for(var origin:List.of("","http://demo.example.test","https://demo.example.test/","https://demo.example.test/x","https://user:secret@demo.example.test","https://demo.example.test?q=1","https://demo.example.test#x"))
            assertThrows(IllegalStateException.class,()->new DemoConfig(true,origin,prod),origin);
        assertTrue(new DemoConfig(true,"https://demo.example.test",prod).enabled());
    }
    @Test void refusesWrongDatabaseOwnerCredentialsAndUnmarkedUsersBeforeAnySeeding() {
        var config=mock(DemoConfig.class);when(config.enabled()).thenReturn(true);
        var db=mock(JdbcTemplate.class);var users=mock(UserRepository.class);var dataset=mock(DemoDataset.class);
        when(db.query(anyString(),org.mockito.ArgumentMatchers.<org.springframework.jdbc.core.RowMapper<DemoInstallation.Marker>>any())).thenReturn(List.of());
        var wrong=new DemoInstallation(config,db,users,null,dataset,null,"owner@example.test","secret");
        assertThrows(IllegalStateException.class,wrong::initialize);
        var install=new DemoInstallation(config,db,users,null,dataset,null,"","");
        when(db.queryForObject("SELECT current_database()",String.class)).thenReturn("wealthmaster");
        assertThrows(IllegalStateException.class,install::initialize);
        when(db.queryForObject("SELECT current_database()",String.class)).thenReturn("wealthmaster_demo");when(users.count()).thenReturn(1L);
        assertThrows(IllegalStateException.class,install::initialize);
        verifyNoInteractions(dataset);verify(users,never()).saveAndFlush(any());
    }
    @Test void markedDemoDatabaseCannotStartAsNormalProduction() {
        var config=mock(DemoConfig.class);var db=mock(JdbcTemplate.class);
        when(db.query(anyString(),org.mockito.ArgumentMatchers.<org.springframework.jdbc.core.RowMapper<DemoInstallation.Marker>>any()))
            .thenReturn(List.of(new DemoInstallation.Marker(UUID.randomUUID(),UUID.randomUUID(),1,Instant.now())));
        var installation=new DemoInstallation(config,db,null,null,null,null,"","");
        assertThrows(IllegalStateException.class,installation::initialize);
    }
}
