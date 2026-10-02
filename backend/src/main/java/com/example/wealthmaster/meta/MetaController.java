package com.example.wealthmaster.meta;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/meta")
public class MetaController {

    private final JdbcTemplate jdbcTemplate;

    public MetaController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        Integer databaseResult =
                jdbcTemplate.queryForObject("SELECT 1", Integer.class);

        return Map.of(
                "application", "WealthMaster",
                "backend", "UP",
                "database", databaseResult != null && databaseResult == 1 ? "UP" : "DOWN"
        );
    }
}