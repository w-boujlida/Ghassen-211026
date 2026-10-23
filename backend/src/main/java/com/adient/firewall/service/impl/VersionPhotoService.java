package com.adient.firewall.service.impl;

import com.adient.firewall.repository.QualityRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class VersionPhotoService {
    private static final int MAX_BYTES = 2 * 1024 * 1024;
    private final QualityRepository repo;

    @PostConstruct
    public void init() {
        if (!repo.tableExists("PROJECT_VERSION_PHOTOS")) {
            repo.getJdbcTemplate().execute("CREATE TABLE SYSTEM.PROJECT_VERSION_PHOTOS (" +
                    "PROJECT_NAME VARCHAR2(30) NOT NULL, TYPE_KEY VARCHAR2(64) NOT NULL, " +
                    "MIME_TYPE VARCHAR2(20) NOT NULL, PHOTO BLOB NOT NULL, " +
                    "PRIMARY KEY (PROJECT_NAME,TYPE_KEY))");
        }
    }

    private String project(String project) {
        String name = QualityRepository.safe(project);
        if (!repo.getProjectNames().contains(name))
            throw new IllegalArgumentException("Projet introuvable : " + name);
        return name;
    }

    private static String key(String line, String version) {
        String l = line.trim();
        String v = version.trim();
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest((l.length() + ":" + l + v.length() + ":" + v).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 indisponible", e);
        }
    }

    public Map<String, Object> get(String project, String line, String version) {
        String name = project(project);
        var photos = repo.getJdbcTemplate().query(
                "SELECT MIME_TYPE,PHOTO FROM SYSTEM.PROJECT_VERSION_PHOTOS WHERE PROJECT_NAME=? AND TYPE_KEY=?",
                (rs, row) -> "data:" + rs.getString("MIME_TYPE") + ";base64,"
                        + Base64.getEncoder().encodeToString(rs.getBytes("PHOTO")), name, key(line, version));
        return photos.isEmpty() ? Map.of("available", false)
                : Map.of("available", true, "dataUrl", photos.get(0));
    }

    public void save(String project, String line, String version, String dataUrl) {
        String name = project(project);
        if (dataUrl == null || dataUrl.length() > (MAX_BYTES + 2) / 3 * 4 + 50)
            throw new IllegalArgumentException("Photo trop volumineuse : 2 Mo maximum.");
        int comma = dataUrl.indexOf(',');
        if (comma < 0 || !Set.of("data:image/png;base64", "data:image/jpeg;base64")
                .contains(dataUrl.substring(0, comma)))
            throw new IllegalArgumentException("Utilisez une photo JPEG ou PNG.");
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(dataUrl.substring(comma + 1));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Données de photo invalides.", e);
        }
        if (bytes.length == 0 || bytes.length > MAX_BYTES)
            throw new IllegalArgumentException("Photo vide ou trop volumineuse : 2 Mo maximum.");
        String mime = dataUrl.substring(5, comma - 7);
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new IllegalArgumentException("Le fichier n'est pas une image valide.");
            var reader = readers.next();
            try {
                reader.setInput(input);
                String format = reader.getFormatName();
                if (!(mime.equals("image/png") && format.equalsIgnoreCase("png"))
                        && !(mime.equals("image/jpeg") && format.equalsIgnoreCase("JPEG")))
                    throw new IllegalArgumentException("Le format de la photo ne correspond pas au fichier.");
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width < 1 || height < 1 || (long) width * height > 20_000_000)
                    throw new IllegalArgumentException("Photo trop grande : 20 millions de pixels maximum.");
                reader.read(0);
            } finally {
                reader.dispose();
            }
        } catch (IOException e) {
            throw new IllegalArgumentException("Impossible de lire la photo.", e);
        }
        JdbcTemplate db = repo.getJdbcTemplate();
        Integer count = db.queryForObject("SELECT COUNT(*) FROM SYSTEM.\"" + name +
                "\" WHERE NVL(TRIM(LIGNE),' ')=? AND NVL(TRIM(VERSION),' ')=?", Integer.class,
                line.isBlank() ? " " : line.trim(), version.isBlank() ? " " : version.trim());
        if (count == null || count == 0)
            throw new IllegalArgumentException("Cette ligne et cette version n'existent pas dans les références du projet.");
        db.update(connection -> {
            var statement = connection.prepareStatement(
                    "MERGE INTO SYSTEM.PROJECT_VERSION_PHOTOS s USING (SELECT ? PROJECT_NAME,? TYPE_KEY FROM DUAL) p " +
                    "ON (s.PROJECT_NAME=p.PROJECT_NAME AND s.TYPE_KEY=p.TYPE_KEY) " +
                    "WHEN MATCHED THEN UPDATE SET MIME_TYPE=?,PHOTO=? " +
                    "WHEN NOT MATCHED THEN INSERT (PROJECT_NAME,TYPE_KEY,MIME_TYPE,PHOTO) " +
                    "VALUES (p.PROJECT_NAME,p.TYPE_KEY,?,?)");
            statement.setString(1, name);
            statement.setString(2, key(line, version));
            statement.setString(3, mime);
            statement.setBlob(4, new ByteArrayInputStream(bytes), bytes.length);
            statement.setString(5, mime);
            statement.setBlob(6, new ByteArrayInputStream(bytes), bytes.length);
            return statement;
        });
    }

    public void delete(String project, String line, String version) {
        repo.getJdbcTemplate().update(
                "DELETE FROM SYSTEM.PROJECT_VERSION_PHOTOS WHERE PROJECT_NAME=? AND TYPE_KEY=?",
                project(project), key(line, version));
    }
}
