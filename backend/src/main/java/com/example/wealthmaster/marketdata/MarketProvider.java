package com.example.wealthmaster.marketdata;
import java.util.List;
import static com.example.wealthmaster.marketdata.MarketDtos.*;
public interface MarketProvider {
    List<Listing> search(String query);
    Quote quote(String symbol);
}
