package com.example.wealthmaster.accounts;

import javax.imageio.ImageIO;
import java.io.*;
import java.util.Base64;

/** Bounded raster-only images; re-encoding strips metadata and trailing content. */
final class AccountLogoImage {
    private static final String PREFIX="data:image/png;base64,";
    private AccountLogoImage() {}
    static String normalize(String value) {
        try {
            if(value==null || value.length()>44000 || !value.startsWith(PREFIX))throw invalid();
            byte[] bytes=Base64.getDecoder().decode(value.substring(PREFIX.length()));
            if(bytes.length>32768)throw invalid();
            try(var stream=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
                if(stream==null)throw invalid();
                var readers=ImageIO.getImageReaders(stream);
                if(!readers.hasNext())throw invalid();
                var reader=readers.next();
                try {
                    if(!reader.getFormatName().equalsIgnoreCase("png"))throw invalid();
                    reader.setInput(stream,true,true);
                    int w=reader.getWidth(0),h=reader.getHeight(0);
                    if(w<1 || h<1 || w>256 || h>256)throw invalid();
                    var image=reader.read(0);
                    var out=new ByteArrayOutputStream();
                    if(!ImageIO.write(image,"png",out) || out.size()>32768)throw invalid();
                    return PREFIX+Base64.getEncoder().encodeToString(out.toByteArray());
                } finally { reader.dispose(); }
            }
        } catch(IOException | IllegalArgumentException error) { throw invalid(); }
    }
    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("Choose a PNG logo up to 256 × 256 pixels and 32 KiB. The account settings uploader resizes images automatically.");
    }
}
