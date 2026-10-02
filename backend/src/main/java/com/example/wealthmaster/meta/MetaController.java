package com.example.wealthmaster.meta;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/meta")
public class MetaController {

    @GetMapping
    public Map<String, String> meta() {
        return Map.of(
            "name", "Wealth Master API",
            "status", "scaffold",
            "apiVersion", "v1"
        );
    }
}
