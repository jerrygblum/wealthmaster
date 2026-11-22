package com.example.wealthmaster.marketdata;
import com.example.wealthmaster.accounts.AccountFailure;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class YahooMarketProviderTest {
    private final ObjectMapper mapper=new ObjectMapper();
    private String data(String symbol,String currency) {
        return """
          {"chart":{"result":[{"meta":{"symbol":"%s","currency":"%s","instrumentType":"EQUITY","regularMarketTime":1735830000,"regularMarketPrice":257.125,"exchangeTimezoneName":"UTC","exchangeName":"SYNTHETIC","longName":"Synthetic stock"},"timestamp":[1735660800,1735747200],"indicators":{"quote":[{"close":[250.000000001,255]}]}}]}}
          """.formatted(symbol,currency);
    }
    @Test void pricesUseExactDecimalsAndPenceAreNormalizedToPounds() {
        var quote=YahooMarketProvider.parse(mapper.readTree(data("SYN.L","GBp")),"SYN.L");
        assertEquals("GBP",quote.currency());assertEquals("2.57125",quote.price());assertEquals("2.55",quote.previousClose());assertEquals("2.50000000001",quote.series().getFirst().close());
    }
    @Test void mismatchedSymbolsAndInvalidCurrenciesNeverBecomeQuotes() {
        assertThrows(AccountFailure.class,()->YahooMarketProvider.parse(mapper.readTree(data("OTHER","USD")),"SYN"));
        assertThrows(AccountFailure.class,()->YahooMarketProvider.parse(mapper.readTree(data("SYN","XYZ")),"SYN"));
        assertThrows(AccountFailure.class,()->YahooMarketProvider.parse(mapper.readTree("{\"chart\":{\"error\":{}}}"),"SYN"));
    }
}
