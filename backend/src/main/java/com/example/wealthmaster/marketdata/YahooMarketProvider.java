package com.example.wealthmaster.marketdata;

import com.example.wealthmaster.accounts.AccountFailure;
import org.springframework.stereotype.Component;
import tools.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.math.*;
import java.util.*;
import static com.example.wealthmaster.marketdata.MarketDtos.*;

@Component
public class YahooMarketProvider implements MarketProvider {
    private final ObjectMapper mapper;
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    public YahooMarketProvider(ObjectMapper mapper){this.mapper=mapper;}
    private String encode(String s){return URLEncoder.encode(s,StandardCharsets.UTF_8);}
    private JsonNode get(String path) {
        try {
            var request=HttpRequest.newBuilder(URI.create("https://query1.finance.yahoo.com"+path)).timeout(Duration.ofSeconds(12)).header("User-Agent","WealthMaster/1.0").GET().build();
            var response=client.send(request,HttpResponse.BodyHandlers.ofInputStream());
            try(var body=response.body()) {
                if(response.statusCode()!=200)throw new AccountFailure(502,"Market source unavailable or rate limited. Saved quotes are retained; try again later.");
                byte[] bytes=body.readNBytes(2_000_001);
                if(bytes.length>2_000_000)throw new IllegalArgumentException();
                return mapper.reader().with(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).readTree(bytes);
            }
        } catch(InterruptedException e){Thread.currentThread().interrupt();throw new AccountFailure(502,"Market request interrupted. Try again later.");}
        catch(AccountFailure e){throw e;}
        catch(Exception e){throw new AccountFailure(502,"Unable to read market data. Saved quotes are retained; try again later.");}
    }
    static String type(String value){return switch(value){case "EQUITY"->"STOCK";case "ETF"->"ETF";default->null;};}
    public List<Listing> search(String query) {
        if(query==null||query.strip().length()<2||query.length()>100)throw new IllegalArgumentException("Enter 2–100 characters to search.");
        var result=new ArrayList<Listing>();
        for(var row:get("/v1/finance/search?q="+encode(query.strip())+"&quotesCount=12&newsCount=0").path("quotes")) {
            var type=type(row.path("quoteType").asText());if(type==null)continue;
            result.add(new Listing(row.path("symbol").asText(),row.path("longname").asText(row.path("shortname").asText()),row.path("exchange").asText(),type));
        }
        return result;
    }
    static BigDecimal price(JsonNode node) {
        if(node.isMissingNode()||node.isNull())return null;
        var value=new BigDecimal(node.asText());
        if(value.signum()<=0||value.scale()>12||value.precision()-value.scale()>26)throw new IllegalArgumentException("Invalid market price.");return value;
    }
    public Quote quote(String symbol) {
        if(symbol==null||!symbol.matches("[A-Za-z0-9.^=_-]{1,64}"))throw new IllegalArgumentException("Choose a valid market symbol.");
        return parse(get("/v8/finance/chart/"+encode(symbol)+"?range=1mo&interval=1d"),symbol);
    }
    static Quote parse(JsonNode root,String expected) {
        try {
            var row=root.path("chart").path("result").get(0);var meta=row.path("meta");
            if(!expected.equalsIgnoreCase(meta.path("symbol").asText()))throw new IllegalArgumentException();
            String rawCurrency=meta.path("currency").asText();BigDecimal unit=rawCurrency.equals("GBp")?new BigDecimal("0.01"):BigDecimal.ONE;
            String currency=rawCurrency.equals("GBp")?"GBP":rawCurrency;
            if(!currency.matches("[A-Z]{3}")||Currency.getInstance(currency).getDefaultFractionDigits()<0)throw new IllegalArgumentException();
            var at=Instant.ofEpochSecond(meta.path("regularMarketTime").asLong());
            if(at.isAfter(Instant.now().plusSeconds(300))||at.isBefore(Instant.parse("1970-01-01T00:00:01Z")))throw new IllegalArgumentException();
            var latest=Objects.requireNonNull(price(meta.path("regularMarketPrice"))).multiply(unit);var points=new ArrayList<Point>();
            var times=row.path("timestamp");var closes=row.path("indicators").path("quote").get(0).path("close");
            for(int i=0;i<times.size();i++) {
                // Chart bars are often binary-encoded numbers with spurious tails. Round source quotes
                // explicitly to twelve decimals; user-entered amounts retain strict input validation.
                if(i>=closes.size()||closes.get(i).isNull())continue;
                var value=new BigDecimal(closes.get(i).asText()).multiply(unit).setScale(12,RoundingMode.HALF_UP).stripTrailingZeros();
                var day=Instant.ofEpochSecond(times.get(i).asLong());if(value.signum()>0&&!day.isAfter(at))points.add(new Point(day,value.toPlainString()));
            }
            points.sort(Comparator.comparing(Point::at));
            String previous=null;var zone=ZoneId.of(meta.path("exchangeTimezoneName").asText("UTC"));
            var quoteDay=at.atZone(zone).toLocalDate();
            for(var point:points)if(point.at().atZone(zone).toLocalDate().isBefore(quoteDay))previous=point.close();
            return new Quote(expected,meta.path("longName").asText(meta.path("shortName").asText(expected)),meta.path("exchangeName").asText(),type(meta.path("instrumentType").asText()),currency,latest.stripTrailingZeros().toPlainString(),previous,at,List.copyOf(points));
        }catch(Exception e){throw new AccountFailure(502,"Market source returned an unsupported or incomplete quote. No saved price was replaced.");}
    }
}
