package com.example.wealthmaster.imports;

import org.junit.jupiter.api.Test;
import java.util.*;
import java.time.*;
import com.example.wealthmaster.budgets.CategoryDtos;
import static com.example.wealthmaster.imports.ImportDtos.*;
import static org.junit.jupiter.api.Assertions.*;

class ImportPlannerTest {
    final WorkbookReader reader=new WorkbookReader();final ImportPlanner planner=new ImportPlanner();
    ImportPlanner.AccountInfo account(String name,String type){return new ImportPlanner.AccountInfo(null,name,type,"CHF","0",LocalDate.of(2024,1,1),0,true);}
    @Test void exactRefundsAndNetSettlementsPreserveBankMovementsWithoutDoubleCounting() {
        var workbook=reader.read(WorkbookFixtures.workbook(WorkbookFixtures.row(2,"2024-01-05","Expense","Bank","100.12345678","-100.12345678","Visa Gold","")+WorkbookFixtures.row(3,"2024-01-25","Expense","Bank","-20","20","Visa Gold","")));
        var initial=planner.initial(workbook,WorkbookFixtures.selection());
        assertEquals("",initial.rows().getFirst().card());assertEquals("Synthetic extra text | Original category: Synthetic category",initial.rows().getFirst().description());assertEquals("NONE",initial.rows().getFirst().category());
        var plan=new Plan(WorkbookFixtures.selection(),"2024-01-01","2024-01-31",List.of(),List.of(),List.of(
            new Decision(2,true,"","2024-01-05","Expense","bank","card","NONE","100.12345678","Synthetic purchase",null),
            new Decision(3,true,"","2024-01-25","Expense","bank","card","NONE","-20","Synthetic refund",null)),Map.of());
        var result=planner.build(workbook,plan,Map.of("bank",account("Bank","CHECKING"),"card",account("Visa","CREDIT_CARD")),Map.of());
        assertTrue(result.errors().isEmpty(),result.errors().toString());assertEquals(3,result.operations().size());
        var settlement=result.operations().getLast();assertTrue(settlement.reconstructed());assertEquals("80.12345678",settlement.amount());assertEquals("bank",settlement.account());assertEquals("card",settlement.destination());assertEquals("2024-01-25",settlement.date());assertEquals(List.of(2,3),settlement.rows());assertEquals("REFUND",result.operations().get(1).kind());
    }
    @Test void mixedVisaLabelsRequireExplicitResolutionAndCommentsRemainDirectExpenses() {
        var workbook=reader.read(WorkbookFixtures.workbook(WorkbookFixtures.row(2,"2024-01-05","Expense","Bank","10","-10","ambiguous Visa","")));
        var plan=planner.initial(workbook,WorkbookFixtures.selection());
        var row=plan.rows().getFirst();assertEquals("",row.card());
        var unresolved=new Plan(plan.selection(),plan.start(),plan.end(),List.of(),List.of(),List.of(new Decision(2,true,"",row.date(),row.kind(),"bank","","NONE",row.amount(),row.description(),null)),Map.of());
        assertFalse(planner.build(workbook,unresolved,Map.of("bank",account("Bank","CHECKING")),Map.of()).errors().isEmpty());
        var comment=new Plan(plan.selection(),plan.start(),plan.end(),List.of(),List.of(),List.of(new Decision(2,true,"",row.date(),row.kind(),"bank","COMMENT","NONE",row.amount(),row.description(),null)),Map.of());
        var result=planner.build(workbook,comment,Map.of("bank",account("Bank","CHECKING")),Map.of());assertTrue(result.errors().isEmpty());assertEquals(1,result.operations().size());assertEquals("bank",result.operations().getFirst().account());
    }
    @Test void nonVisaCardColumnTextIsTreatedAsAComment() {
        var workbook=reader.read(WorkbookFixtures.workbook(WorkbookFixtures.row(2,"2024-01-05","Expense","Bank","10","-10","cash note","")));
        var row=planner.initial(workbook,WorkbookFixtures.selection()).rows().getFirst();
        assertEquals("COMMENT",row.card());assertEquals("NONE",row.category());
        assertEquals("Synthetic row 2 | Original category: Synthetic category",row.description());
    }
    @Test void formulaLinkedTransfersBecomeOneOperationAndZeroRowsStayExcluded() {
        var workbook=reader.read(WorkbookFixtures.workbook(WorkbookFixtures.row(2,"2024-01-05","Transfer -","Bank","-75","-75","","")+WorkbookFixtures.row(3,"2024-01-05","Transfer +","Savings","75","75","","-G2")+WorkbookFixtures.row(4,"2024-01-05","Expense","Bank","0","0","","")));
        var initial=planner.initial(workbook,WorkbookFixtures.selection());assertEquals(3,initial.rows().getFirst().partner());assertFalse(initial.rows().getLast().include());
        var plan=new Plan(initial.selection(),initial.start(),initial.end(),List.of(),List.of(),List.of(
          new Decision(2,true,"","2024-01-05","Transfer -","bank","COMMENT","","-75","Synthetic transfer",3),
          new Decision(3,true,"","2024-01-05","Transfer +","savings","COMMENT","","75","Synthetic transfer",2),initial.rows().getLast()),Map.of());
        var result=planner.build(workbook,plan,Map.of("bank",account("Bank","CHECKING"),"savings",account("Savings","SAVINGS")),Map.of());assertTrue(result.errors().isEmpty(),result.errors().toString());assertEquals(1,result.operations().size());assertEquals("TRANSFER",result.operations().getFirst().kind());
    }
    @Test void uniqueOppositeSourceRowsPairButAmbiguousMatchesRequireReview() {
        var debit=WorkbookFixtures.row(2,"2024-01-05","Transfer -","Bank","-75","-75","","");
        var credit=WorkbookFixtures.row(3,"2024-01-05","Transfer +","Savings","75","75","","");
        var pair=planner.initial(reader.read(WorkbookFixtures.workbook(debit+credit)),WorkbookFixtures.selection());
        assertEquals(3,pair.rows().getFirst().partner());assertEquals(2,pair.rows().getLast().partner());
        var ambiguous=planner.initial(reader.read(WorkbookFixtures.workbook(debit+credit+WorkbookFixtures.row(4,"2024-01-05","Transfer +","Other savings","75","75","",""))),WorkbookFixtures.selection());
        assertTrue(ambiguous.rows().stream().allMatch(row->row.partner()==null));
    }
    @Test void excelDatesAndMissingFormulaCachesAreHandledWithoutEvaluation() {
        assertEquals(LocalDate.of(1900,3,1),ImportPlanner.date("61",false));assertEquals(LocalDate.of(1904,1,1),ImportPlanner.date("0",true));assertThrows(IllegalArgumentException.class,()->ImportPlanner.date("60",false));
        var workbook=reader.read(WorkbookFixtures.workbook(WorkbookFixtures.row(2,"2024-01-05","Expense","Bank","10","","","SUM(F2)").replace("<v></v>","")));
        var plan=new Plan(WorkbookFixtures.selection(),"2024-01-01","2024-01-31",List.of(),List.of(),List.of(new Decision(2,true,"","2024-01-05","Expense","bank","COMMENT","NONE","10","Synthetic",null)),Map.of());
        assertFalse(planner.build(workbook,plan,Map.of("bank",account("Bank","CHECKING")),Map.of()).errors().isEmpty());
    }
    @Test void numericExcelTailsNormalizeForExistingDraftsWithoutChangingOriginalCells() {
        var xml=WorkbookFixtures.row(2,"2024-01-05","Expense","Bank","27.600000000000001","-27.600000000000001","","")
            .replace("F2\" t=\"str", "F2\" t=\"n").replace("G2\" t=\"str", "G2\" t=\"n");
        var workbook=reader.read(WorkbookFixtures.workbook(xml));
        var initial=planner.initial(workbook,WorkbookFixtures.selection());
        assertEquals("27.6",initial.rows().getFirst().amount());
        assertEquals("27.600000000000001",ImportPlanner.value(workbook.sheets().getFirst().rows().getLast(),initial.selection(),"amount"));
        var oldDraft=new Plan(initial.selection(),initial.start(),initial.end(),List.of(),List.of(),List.of(
            new Decision(2,true,"","2024-01-05","Expense","bank","COMMENT","NONE","27.600000000000001","Synthetic",null)),Map.of());
        var result=planner.build(workbook,oldDraft,Map.of("bank",account("Bank","CHECKING")),Map.of());
        assertTrue(result.errors().isEmpty(),result.errors().toString());assertEquals("27.6",result.operations().getFirst().amount());
        assertTrue(result.warnings().stream().anyMatch(w->w.contains("Excel amount normalized")));
    }
    @Test void genuineExcessPrecisionAndManualPrecisionErrorsStillRequireCorrection() {
        for(var amount:List.of("1.123456789", "0.000000000001")) {
            var xml=WorkbookFixtures.row(2,"2024-01-05","Expense","Bank",amount,"-"+amount,"","")
                .replace("F2\" t=\"str", "F2\" t=\"n").replace("G2\" t=\"str", "G2\" t=\"n");
            var workbook=reader.read(WorkbookFixtures.workbook(xml));var initial=planner.initial(workbook,WorkbookFixtures.selection());
            var plan=new Plan(initial.selection(),initial.start(),initial.end(),List.of(),List.of(),List.of(
                new Decision(2,true,"","2024-01-05","Expense","bank","COMMENT","NONE",amount,"Synthetic",null)),Map.of());
            assertFalse(planner.build(workbook,plan,Map.of("bank",account("Bank","CHECKING")),Map.of()).errors().isEmpty());
        }
        assertThrows(IllegalArgumentException.class,()->ImportPlanner.decimal("27.600000000000001"));
    }
    @Test void maliciousXmlAndInvalidFilesAreRejected() {
        assertThrows(IllegalArgumentException.class,()->reader.read(new byte[]{1,2,3}));
        var file=WorkbookFixtures.archive(Map.of("xl/workbook.xml","<!DOCTYPE workbook [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><workbook>&x;</workbook>","xl/_rels/workbook.xml.rels","<Relationships/>"));assertThrows(IllegalArgumentException.class,()->reader.read(file));
    }
}
