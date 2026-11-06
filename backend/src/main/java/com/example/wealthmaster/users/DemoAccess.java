package com.example.wealthmaster.users;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import java.util.regex.Pattern;

/** Explicit guest capability list; unknown routes/methods never inherit ordinary user access. */
public final class DemoAccess {
    private DemoAccess() {}
    private static final String ID="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
    private static final String MONTH="[0-9]{4}-[0-9]{2}-01";
    private static final Set<String> READ=Set.of("/accounts","/transactions","/categories","/spending","/spending/activity",
        "/expected-transactions","/investments/securities","/net-worth/current","/net-worth/trend","/net-worth/trend/options","/users/me/preferences");
    private static final Set<String> POST=Set.of("/accounts","/transactions","/transfers","/categories","/categories/starter-set",
        "/expected-transactions","/investments/securities","/investments/preview","/investments/activities");
    private static final Pattern GET_IDS=Pattern.compile("/(accounts/"+ID+"|investments/accounts/"+ID+"|investments/activities/"+ID+"/reversal-preview|market-data/securities/"+ID+"/nav-history|expected-transactions/"+ID+"/occurrences/"+MONTH+"/candidates)");
    public static boolean allowed(HttpServletRequest request) { return allowed(request.getMethod(),request.getRequestURI().substring(request.getContextPath().length())); }
    public static boolean allowed(String method,String path) {
        if (!path.startsWith("/api/v1/")) return false;
        String p=path.substring(7);
        return switch (method) {
            case "GET" -> READ.contains(p) || GET_IDS.matcher(p).matches();
            case "POST" -> POST.contains(p) || p.matches("/accounts/"+ID+"/(archive|restore)")
                || p.matches("/categories/"+ID+"/(archive|restore)")
                || p.matches("/investments/activities/"+ID+"/reverse")
                || p.matches("/market-data/securities/"+ID+"/nav")
                || p.matches("/expected-transactions/"+ID+"/occurrences/"+MONTH+"/record");
            case "PUT" -> p.equals("/accounts/order") || p.equals("/users/me/preferences")
                || p.matches("/(accounts|transactions|transfers|categories|expected-transactions)/"+ID)
                || p.matches("/accounts/"+ID+"/appearance")
                || p.matches("/expected-transactions/"+ID+"/occurrences/"+MONTH);
            case "DELETE" -> p.matches("/(accounts|transactions|transfers|categories|expected-transactions)/"+ID);
            default -> false;
        };
    }
}
