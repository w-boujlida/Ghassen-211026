package com.adient.firewall.service.impl;

import com.adient.firewall.repository.QualityRepository;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class VersionPhotoServiceTest {
    static String photo(int color) throws Exception {
        var image = new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, color);
        var output = new ByteArrayOutputStream();
        ImageIO.write(image, "png", output);
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(output.toByteArray());
    }

    static String largePhoto() throws Exception {
        var image = new BufferedImage(256, 256, BufferedImage.TYPE_INT_RGB);
        var random = new java.util.Random(42);
        for (int x = 0; x < 256; x++) for (int y = 0; y < 256; y++) image.setRGB(x, y, random.nextInt());
        var output = new ByteArrayOutputStream();
        ImageIO.write(image, "png", output);
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(output.toByteArray());
    }

    @Test
    void rejectsInvalidOrOversizedImagesBeforeDatabaseWrite() {
        var repo = mock(QualityRepository.class);
        when(repo.getProjectNames()).thenReturn(List.of("P6"));
        var service = new VersionPhotoService(repo);
        for (String invalid : List.of("data:image/svg+xml;base64,PHN2Zz4=",
                "data:image/png;base64,AA==", "data:image/png;base64,?", "x".repeat(3_000_000))) {
            assertThrows(IllegalArgumentException.class, () -> service.save("P6", "L1", "A", invalid));
        }
        verify(repo, never()).getJdbcTemplate();
    }

    @Test
    void rejectsUnknownTupleAndMismatchedImageType() throws Exception {
        var repo = mock(QualityRepository.class);
        var db = mock(JdbcTemplate.class);
        when(repo.getProjectNames()).thenReturn(List.of("P6"));
        when(repo.getJdbcTemplate()).thenReturn(db);
        var service = new VersionPhotoService(repo);
        String png = photo(0xff0000);
        assertThrows(IllegalArgumentException.class, () -> service.save("P6", "L1", "A", png));
        assertThrows(IllegalArgumentException.class,
                () -> service.save("P6", "L1", "A", png.replace("image/png", "image/jpeg")));
        verify(db, never()).update(any(org.springframework.jdbc.core.PreparedStatementCreator.class));
    }
}
