package com.example.wealthmaster.meta;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class MetaControllerTest {

    private final MetaController controller = new MetaController();

    @Test
    void exposesScaffoldMetadata() {
        var metadata = controller.meta();
        assertThat(metadata.get("name")).isEqualTo("Wealth Master API");
        assertThat(metadata.get("apiVersion")).isEqualTo("v1");
    }
}
