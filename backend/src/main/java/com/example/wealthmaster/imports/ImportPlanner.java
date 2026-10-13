package com.example.wealthmaster.imports;

import org.springframework.stereotype.Component;
import java.math.*;
import java.time.*;
import java.util.*;
import com.example.wealthmaster.budgets.CategoryDtos;
import static com.example.wealthmaster.imports.ImportDtos.*;

@Component
public class ImportPlanner {
    public record AccountInfo(UUID id, String name, String type, String currency, String opening,
                              LocalDate openingDate, long version, boolean active) {}
    public record Result(List<String> errors, List<String> warnings, List<Operation> operations, List<Integer> excluded) {}
    public static String value(SourceRow row, Selection selection, String field) {
        var cell=row.cells().get(selection.columns().get(field));return cell==null?"":cell.value().strip();
    }
    public static LocalDate date(String value, boolean date1904) {
        if(value.matches("[0-9]+(\\.0+)?")) {
            long serial=new BigDecimal(value).longValueExact();
            if(!date1904 && serial==60) throw new IllegalArgumentException("Excel's fictitious 1900-02-29 is invalid.");
            return (date1904?LocalDate.of(1904,1,1):LocalDate.of(1899,12,31)).plusDays(!date1904 && serial>60?serial-1:serial);
        }
        return LocalDate.parse(value);
    }
    public static BigDecimal decimal(String value) {
        if(value==null || !value.matches("-?[0-9]{1,20}(\\.[0-9]{1,8})?")) throw new IllegalArgumentException("Use an exact decimal with at most eight fractional digits.");
        return new BigDecimal(value);
    }
    // Excel numeric cells may contain binary arithmetic tails. Keep source cells untouched.
    private static String sourceAmount(SourceRow row, Selection selection, String field) {
        String raw=value(row,selection,field);
        var cell=row.cells().get(selection.columns().get(field));
        if(cell==null || !(cell.type().isEmpty() || cell.type().equals("n")))return raw;
        if(!raw.matches("-?[0-9]{1,40}(\\.[0-9]{1,40})?([eE][+-]?[0-9]{1,3})?"))return raw;
        var exact=new BigDecimal(raw);
        if(exact.precision()-exact.scale()>20)return raw;
        var normalized=exact.stripTrailingZeros();
        if(normalized.scale()>8) {
            var rounded=exact.setScale(8,RoundingMode.HALF_UP);
            if(rounded.signum()==0 || exact.subtract(rounded).abs().compareTo(new BigDecimal("0.0000000001"))>0)return raw;
            normalized=rounded.stripTrailingZeros();
        }
        return normalized.toPlainString();
    }
    private static BigDecimal rowAmount(Decision row, SourceRow original, Selection selection) {
        return decimal(Objects.equals(row.amount(),value(original,selection,"amount"))
            ?sourceAmount(original,selection,"amount"):row.amount());
    }
    private static boolean sameSourceAmount(Decision row, SourceRow original, Selection selection) {
        return Objects.equals(row.amount(),value(original,selection,"amount")) || Objects.equals(row.amount(),sourceAmount(original,selection,"amount"));
    }
    public static Sheet sheet(Workbook workbook, Selection selection) {
        if(selection==null || selection.columns()==null || selection.headerRow()<1) throw new IllegalArgumentException("Select a sheet, header row and columns.");
        for(var name:List.of("date","kind","account","amount","category","description","card","cardText","balance"))
            if(selection.columns().get(name)==null || !selection.columns().get(name).matches("[A-Z]{1,3}")) throw new IllegalArgumentException("Map all workbook columns.");
        if(new HashSet<>(selection.columns().values()).size()!=selection.columns().size()) throw new IllegalArgumentException("Map each field to a distinct column.");
        return workbook.sheets().stream().filter(s->s.name().equals(selection.sheet())).findFirst().orElseThrow(()->new IllegalArgumentException("Sheet not found."));
    }
    public Plan initial(Workbook workbook, Selection selection) {
        var sheet=sheet(workbook,selection);var decisions=new ArrayList<Decision>(); LocalDate first=null,last=null;
        var partners=new HashMap<Integer,Integer>();
        for(var row:sheet.rows()) {
            var cell=row.cells().get(selection.columns().get("balance"));
            if(cell!=null && cell.formula().matches("-\\$?[A-Z]{1,3}\\$?[0-9]+")) {
                int other=Integer.parseInt(cell.formula().replaceAll("[^0-9]",""));partners.put(row.number(),other);partners.put(other,row.number());
            }
        }
        // Pair only unique reciprocal matches; repeated amounts remain for manual review.
        var candidates=new HashMap<Integer,List<Integer>>();
        for(var outgoing:sheet.rows()) {
            if(outgoing.number()<=selection.headerRow() || partners.containsKey(outgoing.number()) || !value(outgoing,selection,"kind").equals("Transfer -"))continue;
            for(var incoming:sheet.rows()) {
                if(incoming.number()<=selection.headerRow() || partners.containsKey(incoming.number()) || !value(incoming,selection,"kind").equals("Transfer +"))continue;
                try {
                    var debit=decimal(sourceAmount(outgoing,selection,"amount"));var credit=decimal(sourceAmount(incoming,selection,"amount"));
                    if(debit.signum()<0 && credit.signum()>0 && debit.negate().compareTo(credit)==0
                        && date(value(outgoing,selection,"date"),workbook.date1904()).equals(date(value(incoming,selection,"date"),workbook.date1904()))
                        && !value(outgoing,selection,"account").equals(value(incoming,selection,"account"))) {
                        candidates.computeIfAbsent(outgoing.number(),k->new ArrayList<>()).add(incoming.number());
                        candidates.computeIfAbsent(incoming.number(),k->new ArrayList<>()).add(outgoing.number());
                    }
                } catch(RuntimeException ignored) { }
            }
        }
        for(var entry:candidates.entrySet())if(entry.getValue().size()==1) {
            int other=entry.getValue().getFirst();
            if(candidates.get(other).size()==1)partners.put(entry.getKey(),other);
        }
        for(var row:sheet.rows()) {
            if(row.number()<=selection.headerRow())continue;
            String rawDate=value(row,selection,"date"),kind=value(row,selection,"kind"),amount=sourceAmount(row,selection,"amount");
            String card=value(row,selection,"card"),cardText=value(row,selection,"cardText");
            boolean visa=card.toLowerCase(Locale.ROOT).contains("visa");
            String description=visa&&!cardText.isBlank()?cardText:value(row,selection,"description");
            String originalCategory=value(row,selection,"category");
            if(!originalCategory.isBlank()) description+=(description.isBlank()?"":" | ")+"Original category: "+originalCategory;
            String reason="";boolean include=true;String parsedDate=rawDate;
            if(rawDate.isEmpty() && amount.isEmpty()) { include=false;reason=kind.isEmpty()?"Template / empty row":"Structural marker"; }
            else {
                try { var date=date(rawDate,workbook.date1904());parsedDate=date.toString();if(first==null||date.isBefore(first))first=date;if(last==null||date.isAfter(last))last=date; } catch(RuntimeException ignored) { }
                try { if(decimal(amount).signum()==0){include=false;reason="Zero amount";} } catch(RuntimeException ignored) { }
            }
            decisions.add(new Decision(row.number(),include,reason,parsedDate,kind,"",visa?"":"COMMENT","NONE",amount,description,partners.get(row.number())));
        }
        return new Plan(selection,first==null?"":first.toString(),last==null?"":last.toString(),List.of(),List.of(),decisions,Map.of());
    }
    public Result build(Workbook workbook, Plan plan, Map<String,AccountInfo> accounts, Map<String,CategoryDtos.Category> categories) {
        var errors=new ArrayList<String>();var warnings=new ArrayList<String>();var operations=new ArrayList<Operation>();var excluded=new ArrayList<Integer>();
        var source=new TreeMap<Integer,SourceRow>();for(var row:sheet(workbook,plan.selection()).rows())if(row.number()>plan.selection().headerRow())source.put(row.number(),row);
        var decisions=new TreeMap<Integer,Decision>();
        for(var row:plan.rows())if(decisions.put(row.row(),row)!=null)errors.add("Duplicate decision for row "+row.row());
        if(!source.keySet().equals(decisions.keySet())) errors.add("Every source row after the selected header must have exactly one decision.");
        LocalDate start,end;
        try {start=LocalDate.parse(plan.start());end=LocalDate.parse(plan.end());if(end.isBefore(start))throw new IllegalArgumentException();}
        catch(RuntimeException error){errors.add("Choose a valid migration start/end period.");return new Result(errors,warnings,operations,excluded);}
        // Validate every source side, including transfer partners processed together below.
        for(var row:decisions.values()) {
            if(!row.include() || !source.containsKey(row.row()))continue;
            var original=source.get(row.row());
            for(var field:List.of("amount","balance")) {
                String raw=value(original,plan.selection(),field),normalized=sourceAmount(original,plan.selection(),field);
                if(!raw.equals(normalized))warnings.add("Row "+row.row()+": Excel "+field+" normalized from "+raw+" to "+normalized+"; original source retained.");
            }
            for(var field:List.of("date","kind","account","amount","balance","category","description","card","cardText")) {
                var cell=original.cells().get(plan.selection().columns().get(field));
                if(cell!=null && (cell.type().equals("e") || !cell.formula().isEmpty() && cell.value().isBlank())) errors.add("Row "+row.row()+": source error or missing formula cache; recalculate the workbook.");
            }
            if(!sameSourceAmount(row,original,plan.selection()) || !Objects.equals(row.kind(),value(original,plan.selection(),"kind")) || !Objects.equals(row.date(),dateOrRaw(value(original,plan.selection(),"date"),workbook.date1904())))
                if(row.reason()==null||row.reason().isBlank())errors.add("Row "+row.row()+": explain corrected amount, type or date.");
        }
        var processed=new HashSet<Integer>();var settlements=new TreeMap<String,List<Operation>>();
        for(var row:decisions.values()) {
            if(!row.include()) {excluded.add(row.row());if(row.reason()==null||row.reason().isBlank())errors.add("Row "+row.row()+": explain exclusion.");continue;}
            if(processed.contains(row.row()))continue;
            try {
                if(!source.containsKey(row.row())) throw new IllegalArgumentException("Source row not found.");
                var original=source.get(row.row());
                for(var field:List.of("date","kind","account","amount","balance","category","description","card","cardText")) {
                    var cell=original.cells().get(plan.selection().columns().get(field));
                    if(cell!=null && (cell.type().equals("e") || !cell.formula().isEmpty() && cell.value().isBlank()))throw new IllegalArgumentException("Recalculate workbook; a source cell has an error or missing cached result.");
                }
                var date=LocalDate.parse(row.date());if(date.getYear()<1||date.getYear()>9999)throw new IllegalArgumentException("Invalid date.");
                if(date.isBefore(start)||date.isAfter(end))throw new IllegalArgumentException("Outside migration period; exclude with a reason or change the period.");
                var amount=rowAmount(row,original,plan.selection());if(amount.signum()==0)throw new IllegalArgumentException("Zero amounts must be excluded explicitly.");
                var bank=required(accounts,row.account(),"Map the paying account.");
                if(!bank.active() || bank.openingDate().isAfter(start))throw new IllegalArgumentException("Restore account and confirm an opening date no later than the migration start.");
                String description=row.description()==null?"":row.description().strip();
                if(description.isEmpty()||description.length()>500)throw new IllegalArgumentException("Enter a description of 1–500 characters.");
                if(!sameSourceAmount(row,original,plan.selection()) || !Objects.equals(row.kind(),value(original,plan.selection(),"kind")) || !Objects.equals(row.date(),dateOrRaw(value(original,plan.selection(),"date"),workbook.date1904()))) {
                    if(row.reason()==null||row.reason().isBlank())throw new IllegalArgumentException("Explain corrected amount, type or date in the row reason.");
                    warnings.add("Row "+row.row()+": corrected source interpretation — "+row.reason());
                }
                if(row.kind().equals("Transfer -") || row.kind().equals("Transfer +")) {
                    var partner=row.partner()==null?null:decisions.get(row.partner());
                    if(partner==null||!partner.include()||!Objects.equals(partner.partner(),row.row())||processed.contains(partner.row()))throw new IllegalArgumentException("Confirm a reciprocal included transfer partner.");
                    var outgoing=row.kind().equals("Transfer -")?row:partner;var incoming=row.kind().equals("Transfer +")?row:partner;
                    if(!outgoing.kind().equals("Transfer -")||!incoming.kind().equals("Transfer +")||!row.date().equals(partner.date()))throw new IllegalArgumentException("Transfers require opposite types and the same date.");
                    var debit=rowAmount(outgoing,source.get(outgoing.row()),plan.selection());var credit=rowAmount(incoming,source.get(incoming.row()),plan.selection());
                    if(debit.signum()>=0||credit.signum()<=0||debit.negate().compareTo(credit)!=0)throw new IllegalArgumentException("Transfer amounts must be equal and opposite.");
                    var from=required(accounts,outgoing.account(),"Map transfer source.");var to=required(accounts,incoming.account(),"Map transfer destination.");
                    if(from==to || !from.currency().equals(to.currency()) || !from.active() || !to.active() || from.openingDate().isAfter(start)||to.openingDate().isAfter(start))throw new IllegalArgumentException("Transfer accounts must be distinct, active, same-currency and open at migration start.");
                    if(!"COMMENT".equals(outgoing.card())||!"COMMENT".equals(incoming.card()))throw new IllegalArgumentException("Transfer card-column values must be explicitly treated as comments.");
                    checkSource(outgoing,source.get(outgoing.row()),plan, debit, warnings);checkSource(incoming,source.get(incoming.row()),plan,credit,warnings);
                    operations.add(new Operation("transfer:"+outgoing.row()+":"+incoming.row(),"TRANSFER",outgoing.account(),incoming.account(),null,credit.toPlainString(),from.currency(),outgoing.date(),description,false,List.of(outgoing.row(),incoming.row())));
                    processed.add(partner.row());processed.add(row.row());continue;
                }
                boolean income=row.kind().equals("Income");if(!income&&!row.kind().equals("Expense"))throw new IllegalArgumentException("Choose Income, Expense, Transfer - or Transfer +.");
                if(income && amount.signum()<0)throw new IllegalArgumentException("Negative income requires explicit correction or exclusion.");
                if(row.card()==null||row.card().isEmpty())throw new IllegalArgumentException("Resolve the credit-card field as a card or comment.");
                String accountKey=row.account();AccountInfo account=bank;
                if(!row.card().equals("COMMENT")) {
                    if(income)throw new IllegalArgumentException("Card mapping is only supported for expenses/refunds.");
                    account=required(accounts,row.card(),"Map the card account.");accountKey=row.card();
                    if(!account.type().equals("CREDIT_CARD")||bank.type().equals("CREDIT_CARD")||!account.currency().equals(bank.currency())||!account.active()||account.openingDate().isAfter(start))throw new IllegalArgumentException("Choose an active credit card and distinct same-currency paying account, open at migration start.");
                }
                if(row.category()==null||row.category().isEmpty())throw new IllegalArgumentException("Map category or explicitly choose uncategorized.");
                String categoryKey=row.category().equals("NONE")?null:row.category();
                if(categoryKey!=null) {var category=required(categories,categoryKey,"Map the category.");if(!category.available()||category.type()!=(income?CategoryDtos.Type.INCOME:CategoryDtos.Type.SPENDING))throw new IllegalArgumentException("Choose an available category with the matching type.");}
                var op=new Operation("row:"+row.row(),income?"INCOME":amount.signum()<0?"REFUND":"EXPENSE",accountKey,null,categoryKey,amount.abs().toPlainString(),account.currency(),row.date(),description,false,List.of(row.row()));
                operations.add(op);processed.add(row.row());
                checkSource(row,original,plan,income?amount:amount.negate(),warnings);
                if(!accountKey.equals(row.account()))settlements.computeIfAbsent(YearMonth.from(date)+":"+row.account()+":"+accountKey+":"+account.currency(),k->new ArrayList<>()).add(op);
            } catch(RuntimeException error) {errors.add("Row "+row.row()+": "+(error.getMessage()==null?"Invalid mapping or value.":error.getMessage()));}
        }
        for(var entry:settlements.entrySet()) {
            var members=entry.getValue();var first=members.getFirst();var decision=decisions.get(first.rows().getFirst());
            BigDecimal net=BigDecimal.ZERO;var rows=new ArrayList<Integer>();
            for(var op:members){net=net.add(new BigDecimal(op.amount()).multiply(op.kind().equals("REFUND")?BigDecimal.ONE.negate():BigDecimal.ONE));rows.addAll(op.rows());}
            if(net.signum()==0)continue;
            String from=net.signum()>0?decision.account():first.account(),to=net.signum()>0?first.account():decision.account();
            String settlementDate=members.stream().map(Operation::date).max(String::compareTo).orElse(first.date());
            if(net.abs().precision()-net.abs().scale()>20)errors.add("Settlement exceeds ledger precision; split this migration into smaller batches.");
            operations.add(new Operation("settlement:"+entry.getKey(),"TRANSFER",from,to,null,net.abs().toPlainString(),first.currency(),settlementDate,"Legacy monthly card settlement (reconstructed)",true,rows));
        }
        return new Result(errors,warnings,operations,excluded);
    }
    private static String dateOrRaw(String raw,boolean system) {try{return date(raw,system).toString();}catch(RuntimeException e){return raw;}}
    private <T> T required(Map<String,T> map,String key,String message) {var item=map.get(key);if(item==null)throw new IllegalArgumentException(message);return item;}
    private void checkSource(Decision row,SourceRow original,Plan plan,BigDecimal movement,List<String> warnings) {
        var raw=sourceAmount(original,plan.selection(),"balance");
        if(!raw.isEmpty() && decimal(raw).compareTo(movement)!=0) {
            if(row.reason()==null||row.reason().isBlank())throw new IllegalArgumentException("Signed movement differs from Balance Amount; explain the correction.");
            warnings.add("Row "+row.row()+": source movement difference explained — "+row.reason());
        }
    }
}
