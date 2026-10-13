package com.example.wealthmaster.imports;

import org.springframework.stereotype.Component;
import org.w3c.dom.*;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.XMLConstants;
import java.io.*;
import java.util.*;
import java.util.zip.*;
import static com.example.wealthmaster.imports.ImportDtos.*;

/** Bounded OOXML data reader. Never loads macros, external links, or evaluates formulas. */
@Component
public class WorkbookReader {
    private static final int MAX_EXPANDED = 40 * 1024 * 1024;
    private Document xml(byte[] bytes) throws Exception {
        if(bytes==null) throw new IllegalArgumentException("Workbook XML is missing.");
        var factory=DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities",false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities",false);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");
        var builder=factory.newDocumentBuilder();
        builder.setErrorHandler(new org.xml.sax.helpers.DefaultHandler());
        return builder.parse(new ByteArrayInputStream(bytes));
    }
    private String text(Element element, String tag) {
        var list=element.getElementsByTagName(tag);
        return list.getLength()==0 ? "" : list.item(0).getTextContent();
    }
    public Workbook read(byte[] source) {
        if(source.length==0 || source.length>10*1024*1024) throw new IllegalArgumentException("Choose an XLSX/XLSM workbook up to 10 MiB.");
        try {
            var files=new HashMap<String,byte[]>(); int expanded=0,entries=0;
            try(var zip=new ZipInputStream(new ByteArrayInputStream(source))) {
                ZipEntry entry;
                while((entry=zip.getNextEntry())!=null) {
                    if(++entries>2000) throw new IllegalArgumentException();
                    var output=new ByteArrayOutputStream(); byte[] buffer=new byte[8192]; int size;
                    while((size=zip.read(buffer))!=-1) {
                        expanded+=size; if(expanded>MAX_EXPANDED) throw new IllegalArgumentException();
                        if(entry.getName().startsWith("xl/") && entry.getName().endsWith(".xml")) output.write(buffer,0,size);
                        else if(entry.getName().equals("xl/_rels/workbook.xml.rels")) output.write(buffer,0,size);
                    }
                    if(output.size()>0 && files.put(entry.getName(),output.toByteArray())!=null) throw new IllegalArgumentException();
                }
            }
            var strings=new ArrayList<String>();
            if(files.containsKey("xl/sharedStrings.xml")) {
                var items=xml(files.get("xl/sharedStrings.xml")).getElementsByTagName("si");
                for(int i=0;i<items.getLength();i++) {
                    var texts=((Element)items.item(i)).getElementsByTagName("t");var value=new StringBuilder();
                    for(int j=0;j<texts.getLength();j++)value.append(texts.item(j).getTextContent());
                    strings.add(value.toString());
                }
            }
            var relationships=new HashMap<String,String>();
            var rels=xml(files.get("xl/_rels/workbook.xml.rels")).getElementsByTagName("Relationship");
            for(int i=0;i<rels.getLength();i++) {
                var rel=(Element)rels.item(i);
                if(!rel.getAttribute("TargetMode").equals("External")) relationships.put(rel.getAttribute("Id"),rel.getAttribute("Target"));
            }
            var book=xml(files.get("xl/workbook.xml"));var sheets=new ArrayList<Sheet>();
            boolean date1904=false; var properties=book.getElementsByTagName("workbookPr");
            if(properties.getLength()>0) { var value=((Element)properties.item(0)).getAttribute("date1904");date1904=value.equals("1") || value.equals("true"); }
            var sheetNodes=book.getElementsByTagName("sheet"); int rowCount=0;
            if(sheetNodes.getLength()>20) throw new IllegalArgumentException();
            for(int i=0;i<sheetNodes.getLength();i++) {
                var sheet=(Element)sheetNodes.item(i);var target=relationships.get(sheet.getAttribute("r:id"));
                if(target==null) throw new IllegalArgumentException();
                var path=target.startsWith("/")?target.substring(1):"xl/"+target;
                if(!path.startsWith("xl/worksheets/") || path.contains("..")) throw new IllegalArgumentException();
                var sheetRows=xml(files.get(path)).getElementsByTagName("row");var rows=new ArrayList<SourceRow>();
                for(int j=0;j<sheetRows.getLength();j++) {
                    if(++rowCount>5000) throw new IllegalArgumentException("The migration supports at most 5,000 source rows.");
                    var row=(Element)sheetRows.item(j);var cells=new TreeMap<String,Cell>();var nodes=row.getElementsByTagName("c");
                    if(nodes.getLength()>100) throw new IllegalArgumentException();
                    for(int k=0;k<nodes.getLength();k++) {
                        var cell=(Element)nodes.item(k);String ref=cell.getAttribute("r"),type=cell.getAttribute("t");
                        if(!ref.matches("[A-Z]{1,3}[1-9][0-9]*")) throw new IllegalArgumentException();
                        String value=text(cell,"v");
                        if(type.equals("s") && !value.isEmpty())value=strings.get(Integer.parseInt(value));
                        if(type.equals("inlineStr"))value=text(cell,"is");
                        if(value.length()>4000) throw new IllegalArgumentException();
                        cells.put(ref.replaceAll("[0-9]",""),new Cell(value,text(cell,"f"),type));
                    }
                    rows.add(new SourceRow(Integer.parseInt(row.getAttribute("r")),cells));
                }
                sheets.add(new Sheet(sheet.getAttribute("name"),rows));
            }
            return new Workbook(date1904,sheets);
        } catch(IllegalArgumentException e) { throw new IllegalArgumentException("Invalid or oversized workbook; use a saved XLSX/XLSM copy with at most 5,000 rows."); }
        catch(Exception e) { throw new IllegalArgumentException("Cannot read this workbook. Save a recalculated XLSX/XLSM copy and try again."); }
    }
}
