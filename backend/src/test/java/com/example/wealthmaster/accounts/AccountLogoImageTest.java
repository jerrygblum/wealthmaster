package com.example.wealthmaster.accounts;

import org.junit.jupiter.api.Test;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import javax.imageio.ImageIO;
import static org.junit.jupiter.api.Assertions.*;
class AccountLogoImageTest {
    String data(byte[] bytes) {return "data:image/png;base64,"+Base64.getEncoder().encodeToString(bytes);}
    byte[] png(int width,int height)throws Exception {
        var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(width,height,BufferedImage.TYPE_INT_ARGB),"png",out);return out.toByteArray();
    }
    @Test void dimensionsAndDecodedLengthAreBounded()throws Exception {
        assertThrows(IllegalArgumentException.class,()->AccountLogoImage.normalize(data(png(257,1))));
        assertThrows(IllegalArgumentException.class,()->AccountLogoImage.normalize(data(new byte[32769])));
        assertThrows(IllegalArgumentException.class,()->AccountLogoImage.normalize("https://example.test/logo.png"));
    }
    @Test void normalizedPngDiscardsTrailingContent()throws Exception {
        var original=png(16,16);var extra=new ByteArrayOutputStream();extra.write(original);extra.write("Synthetic trailing metadata".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertEquals(AccountLogoImage.normalize(data(original)),AccountLogoImage.normalize(data(extra.toByteArray())));
    }
}
