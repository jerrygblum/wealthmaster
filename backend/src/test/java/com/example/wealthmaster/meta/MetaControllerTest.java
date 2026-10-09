package com.example.wealthmaster.meta;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MetaControllerTest {

    @Test
    void statusReportsBackendAndDatabaseUp() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject("SELECT 1", Integer.class))
                .thenReturn(1);

        MetaController controller = new MetaController(jdbcTemplate);

        Map<String, Object> result = controller.status();

        assertEquals("WealthMaster", result.get("application"));
        assertEquals("UP", result.get("backend"));
        assertEquals("UP", result.get("database"));
    }
}