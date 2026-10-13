package com.example.wealthmaster.imports;

import java.util.*;
import java.io.*;
import java.util.zip.*;
import java.nio.charset.StandardCharsets;
import static com.example.wealthmaster.imports.ImportDtos.*;

final class WorkbookFixtures {
    static Selection selection(){return new Selection("Synthetic",1,Map.of("date","A","kind","C","account","D","description","E","amount","F","balance","G","category","H","card","I","cardText","J"));}
    static String row(int number,String date,String kind,String account,String amount,String movement,String card,String formula) {
        return "<row r=\""+number+"\">"+cell("A"+number,date,"")+cell("C"+number,kind,"")+cell("D"+number,account,"")+cell("E"+number,"Synthetic row "+number,"")+cell("F"+number,amount,"")+cell("G"+number,movement,formula)+cell("H"+number,"Synthetic category","")+cell("I"+number,card,"")+cell("J"+number,"Synthetic extra text","")+"</row>";
    }
    static String cell(String ref,String value,String formula){return "<c r=\""+ref+"\" t=\"str\">"+(formula.isEmpty()?"":"<f>"+formula+"</f>")+"<v>"+value+"</v></c>";}
    static byte[] workbook(String rows) {return archive(Map.of(
        "xl/workbook.xml","<workbook xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Synthetic\" r:id=\"r1\"/></sheets></workbook>",
        "xl/_rels/workbook.xml.rels","<Relationships><Relationship Id=\"r1\" Target=\"worksheets/sheet1.xml\"/></Relationships>",
        "xl/worksheets/sheet1.xml","<worksheet><sheetData><row r=\"1\">"+cell("A1","Date","")+"</row>"+rows+"</sheetData></worksheet>",
        "xl/vbaProject.bin","Unexecuted synthetic macro placeholder"));}
    static byte[] archive(Map<String,String> entries) {
        try {var bytes=new ByteArrayOutputStream();try(var zip=new ZipOutputStream(bytes)){for(var entry:entries.entrySet()){zip.putNextEntry(new ZipEntry(entry.getKey()));zip.write(entry.getValue().getBytes(StandardCharsets.UTF_8));zip.closeEntry();}}return bytes.toByteArray();}catch(IOException e){throw new IllegalStateException(e);}
    }
}
