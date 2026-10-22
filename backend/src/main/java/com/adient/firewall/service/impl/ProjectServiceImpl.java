package com.adient.firewall.service.impl;

import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.IProjectService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProjectServiceImpl implements IProjectService {

    private final QualityRepository repo;

    /** System projects that cannot be renamed or deleted by anyone. */
    private static final Set<String> LOCKED_PROJECTS = Set.of("P6", "P7", "P674", "CR3", "J4U", "AUDI", "SK316_7");
    private static final Set<String> RESERVED_PROJECT_NAMES =
            Set.of("DEF", "POLY", "APP_USERS", "SUPERVISORS", "REF_VERIF_MESSAGES", "REF_CHECKPOINTS");

    @Override
    public List<Map<String, Object>> getProjects() {
        List<String> names = repo.getProjectNames();
        List<Map<String, Object>> result = new ArrayList<>();
        for (String name : names) {
            try {
                int cnt = repo.countProjectRefs(name);
                Map<String, Object> p = new LinkedHashMap<>();
                p.put("name",        name);
                p.put("ref_count",   cnt);
                p.put("has_firewall", repo.tableExists("FIREWALL_" + name));
                p.put("has_csl",      repo.tableExists("CSL_" + name));
                p.put("locked",       LOCKED_PROJECTS.contains(name));
                result.add(p);
            } catch (Exception e) {
                log.warn("Failed to get info for project {}: {}", name, e.getMessage());
            }
        }
        return result;
    }

    @Override
    @Transactional
    public void createProject(String name) {
        if (name == null || name.isBlank())
            throw new IllegalArgumentException("Project name is required");
        String pn = QualityRepository.safe(name.trim());
        String pl = pn.toLowerCase();

        if (RESERVED_PROJECT_NAMES.contains(pn))
            throw new IllegalStateException("Le nom « " + pn + " » est réservé par le système.");
        if (repo.tableExists(pn)) throw new IllegalStateException("Project '" + pn + "' already exists.");

        JdbcTemplate db = repo.getJdbcTemplate();
        List<String> ddl = List.of(
            "CREATE TABLE SYSTEM.\"" + pn + "\" (" +
                "FAS_ADIENT_PART_NUMBER VARCHAR2(26 BYTE)," +
                "PDEF VARCHAR2(26 BYTE)," +
                "DESIGNATION VARCHAR2(128 BYTE)," +
                "VERSION VARCHAR2(26 BYTE)," +
                "REF_DETAIL VARCHAR2(26 BYTE)," +
                "LIGNE VARCHAR2(26 BYTE)" +
            ") TABLESPACE SYSTEM",
            "CREATE SEQUENCE " + pl + "_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE",
            buildFirewallTableDdl(pn),
            "CREATE OR REPLACE TRIGGER \"" + pn + "_BI\" " +
            "BEFORE INSERT ON \"FIREWALL_" + pn + "\" FOR EACH ROW WHEN (NEW.ID IS NULL) " +
            "BEGIN SELECT " + pl + "_seq.NEXTVAL INTO :NEW.ID FROM dual; END;",
            "CREATE SEQUENCE csl_" + pl + "_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE",
            buildCslTableDdl(pn),
            "CREATE OR REPLACE TRIGGER \"CSL_" + pn + "_BI\" " +
            "BEFORE INSERT ON \"CSL_" + pn + "\" FOR EACH ROW WHEN (NEW.ID IS NULL) " +
            "BEGIN SELECT csl_" + pl + "_seq.NEXTVAL INTO :NEW.ID FROM dual; END;"
        );

        for (String sql : ddl) {
            try {
                db.execute(sql);
            } catch (Exception e) {
                cleanupProject(pn, pl);
                throw new RuntimeException("Failed to create project: " + e.getMessage(), e);
            }
        }
    }

    @Override
    @Transactional
    public Map<String, Object> importProjectRefs(String project, List<Map<String, Object>> refs) {
        String pn = QualityRepository.safe(project);
        if (!repo.tableExists(pn)) throw new NoSuchElementException("Project not found: " + pn);

        int inserted = 0, errors = 0;
        for (Map<String, Object> row : refs) {
            try {
                repo.insertProjectRef(pn,
                        truncate(row.get("FAS_ADIENT_PART_NUMBER"), 26),
                        truncate(row.get("PDEF"), 26),
                        truncate(row.get("DESIGNATION"), 128),
                        truncate(row.get("VERSION"), 26),
                        truncate(row.get("REF_DETAIL"), 26),
                        truncate(row.get("LIGNE"), 26));
                inserted++;
            } catch (Exception e) {
                errors++;
            }
        }
        return Map.of("inserted", inserted, "errors", errors,
                "message", "Inserted " + inserted + " into " + pn + (errors > 0 ? " (" + errors + " failed)" : ""));
    }

    @Override
    @Transactional
    public void addProjectRef(String project, Map<String, Object> ref) {
        String pn = QualityRepository.safe(project);
        repo.insertProjectRef(pn,
                truncate(ref.get("FAS_ADIENT_PART_NUMBER"), 26),
                truncate(ref.get("PDEF"), 26),
                truncate(ref.get("DESIGNATION"), 128),
                truncate(ref.get("VERSION"), 26),
                truncate(ref.get("REF_DETAIL"), 26),
                truncate(ref.get("LIGNE"), 26));
    }

    @Override
    @Transactional
    public void updateProjectRef(String project, String rowid, Map<String, Object> ref) {
        String pn = QualityRepository.safe(project);
        repo.updateProjectRef(pn, rowid,
                truncate(ref.get("FAS_ADIENT_PART_NUMBER"), 26),
                truncate(ref.get("PDEF"), 26),
                truncate(ref.get("DESIGNATION"), 128),
                truncate(ref.get("VERSION"), 26),
                truncate(ref.get("REF_DETAIL"), 26),
                truncate(ref.get("LIGNE"), 26));
    }

    @Override
    @Transactional
    public void deleteProjectRef(String project, String rowid) {
        String pn = QualityRepository.safe(project);
        repo.deleteProjectRef(pn, rowid);
    }

    @Override
    public Map<String, Object> getProjectRefs(String project, int page, int limit) {
        String pn = QualityRepository.safe(project);
        if (!repo.tableExists(pn)) throw new NoSuchElementException("Project not found: " + pn);
        int total = repo.countProjectRefs(pn);
        List<Map<String, Object>> refs = repo.fetchProjectRefsWithRowid(pn, page, limit);
        int pages = Math.max(1, (int) Math.ceil((double) total / limit));
        return Map.of(
                "refs", refs,
                "pagination", Map.of("total", total, "page", page, "limit", limit, "pages", pages));
    }

    @Override
    @Transactional
    public void renameProject(String oldName, String newName) {
        String on = QualityRepository.safe(oldName);
        String nn = QualityRepository.safe(newName);
        if (LOCKED_PROJECTS.contains(on))
            throw new IllegalStateException("Project '" + on + "' is a system project and cannot be renamed.");
        String ol = on.toLowerCase();
        String nl = nn.toLowerCase();

        if (!repo.tableExists(on)) throw new NoSuchElementException("Project '" + on + "' not found.");
        if (repo.tableExists(nn))  throw new IllegalStateException("Project '" + nn + "' already exists.");

        JdbcTemplate db = repo.getJdbcTemplate();
        db.execute("ALTER TABLE SYSTEM.\"" + on + "\" RENAME TO \"" + nn + "\"");

        if (repo.tableExists("FIREWALL_" + on)) {
            db.execute("ALTER TABLE SYSTEM.\"FIREWALL_" + on + "\" RENAME TO \"FIREWALL_" + nn + "\"");
            Integer maxId = db.queryForObject("SELECT NVL(MAX(ID),0) FROM SYSTEM.\"FIREWALL_" + nn + "\"", Integer.class);
            db.execute("BEGIN EXECUTE IMMEDIATE 'DROP SEQUENCE " + ol + "_seq'; EXCEPTION WHEN OTHERS THEN NULL; END;");
            db.execute("CREATE SEQUENCE " + nl + "_seq START WITH " + (maxId + 1) + " INCREMENT BY 1 NOCACHE NOCYCLE");
            db.execute("CREATE OR REPLACE TRIGGER \"" + nn + "_BI\" " +
                    "BEFORE INSERT ON \"FIREWALL_" + nn + "\" FOR EACH ROW WHEN (NEW.ID IS NULL) " +
                    "BEGIN SELECT " + nl + "_seq.NEXTVAL INTO :NEW.ID FROM dual; END;");
        }

        if (repo.tableExists("CSL_" + on)) {
            db.execute("ALTER TABLE SYSTEM.\"CSL_" + on + "\" RENAME TO \"CSL_" + nn + "\"");
            Integer maxId = db.queryForObject("SELECT NVL(MAX(ID),0) FROM SYSTEM.\"CSL_" + nn + "\"", Integer.class);
            db.execute("BEGIN EXECUTE IMMEDIATE 'DROP SEQUENCE csl_" + ol + "_seq'; EXCEPTION WHEN OTHERS THEN NULL; END;");
            db.execute("CREATE SEQUENCE csl_" + nl + "_seq START WITH " + (maxId + 1) + " INCREMENT BY 1 NOCACHE NOCYCLE");
            db.execute("CREATE OR REPLACE TRIGGER \"CSL_" + nn + "_BI\" " +
                    "BEFORE INSERT ON \"CSL_" + nn + "\" FOR EACH ROW WHEN (NEW.ID IS NULL) " +
                    "BEGIN SELECT csl_" + nl + "_seq.NEXTVAL INTO :NEW.ID FROM dual; END;");
        }
    }

    @Override
    @Transactional
    public void deleteProject(String name) {
        String pn = QualityRepository.safe(name);
        if (!repo.tableExists(pn)) throw new NoSuchElementException("Project '" + pn + "' not found.");
        if (LOCKED_PROJECTS.contains(pn))
            throw new IllegalStateException("Project '" + pn + "' is a system project and cannot be deleted.");

        JdbcTemplate db = repo.getJdbcTemplate();
        if (repo.tableExists("FIREWALL_" + pn)) {
            Integer cnt = db.queryForObject("SELECT COUNT(*) FROM SYSTEM.\"FIREWALL_" + pn + "\"", Integer.class);
            if (cnt != null && cnt > 0) throw new IllegalStateException("Cannot delete: " + cnt + " record(s) in Firewall table.");
        }
        if (repo.tableExists("CSL_" + pn)) {
            Integer cnt = db.queryForObject("SELECT COUNT(*) FROM SYSTEM.\"CSL_" + pn + "\"", Integer.class);
            if (cnt != null && cnt > 0) throw new IllegalStateException("Cannot delete: " + cnt + " record(s) in CSL table.");
        }
        cleanupProject(pn, pn.toLowerCase());
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private void cleanupProject(String pn, String pl) {
        JdbcTemplate db = repo.getJdbcTemplate();
        for (String sql : List.of(
                "BEGIN EXECUTE IMMEDIATE 'DROP TRIGGER \"" + pn + "_BI\"'; EXCEPTION WHEN OTHERS THEN NULL; END;",
                "BEGIN EXECUTE IMMEDIATE 'DROP TRIGGER \"CSL_" + pn + "_BI\"'; EXCEPTION WHEN OTHERS THEN NULL; END;",
                "BEGIN EXECUTE IMMEDIATE 'DROP SEQUENCE " + pl + "_seq'; EXCEPTION WHEN OTHERS THEN NULL; END;",
                "BEGIN EXECUTE IMMEDIATE 'DROP SEQUENCE csl_" + pl + "_seq'; EXCEPTION WHEN OTHERS THEN NULL; END;",
                "BEGIN EXECUTE IMMEDIATE 'DROP TABLE SYSTEM.\"FIREWALL_" + pn + "\" CASCADE CONSTRAINTS'; EXCEPTION WHEN OTHERS THEN NULL; END;",
                "BEGIN EXECUTE IMMEDIATE 'DROP TABLE SYSTEM.\"CSL_" + pn + "\" CASCADE CONSTRAINTS'; EXCEPTION WHEN OTHERS THEN NULL; END;",
                "BEGIN EXECUTE IMMEDIATE 'DROP TABLE SYSTEM.\"" + pn + "\" CASCADE CONSTRAINTS'; EXCEPTION WHEN OTHERS THEN NULL; END;"
        )) {
            try { db.execute(sql); } catch (Exception ignored) {}
        }
    }

    private String buildFirewallTableDdl(String pn) {
        return "CREATE TABLE SYSTEM.\"FIREWALL_" + pn + "\" (" +
                "BARCODE VARCHAR2(128),DATEFW DATE,CQFW VARCHAR2(128),CQDELIBERA VARCHAR2(128)," +
                "REF VARCHAR2(128),CODDEF VARCHAR2(128),DESC_DEF VARCHAR2(256),QTY NUMBER(38,0)," +
                "REF2 VARCHAR2(128),REF3 VARCHAR2(128),VERSION VARCHAR2(128),POSTE VARCHAR2(128)," +
                "REMARQUEDEFAUT VARCHAR2(128),TAMPON VARCHAR2(128),REFDETAIL VARCHAR2(128)," +
                "PROJET VARCHAR2(128),EQUIPEPROD VARCHAR2(128),DEMERITE NUMBER(38,0)," +
                "SUPERVISEUR VARCHAR2(128),REPRISE VARCHAR2(128)," +
                "DEFECT_STATUS VARCHAR2(20) DEFAULT 'NOT FIXED' NOT NULL," +
                "ID NUMBER NOT NULL,CONSTRAINT \"" + pn + "_FW_PK\" PRIMARY KEY (ID)) TABLESPACE SYSTEM";
    }

    private String buildCslTableDdl(String pn) {
        return "CREATE TABLE SYSTEM.\"CSL_" + pn + "\" (" +
                "BARCODE VARCHAR2(128),DATEFW DATE,CQCSL VARCHAR2(128),CQDELIBERA VARCHAR2(128)," +
                "REF VARCHAR2(128),CODDEF VARCHAR2(128),DESC_DEF VARCHAR2(256),QTY NUMBER(38,0)," +
                "REF2 VARCHAR2(128),REF3 VARCHAR2(128),VERSION VARCHAR2(128),POSTE VARCHAR2(128)," +
                "REMARQUEDEFAUT VARCHAR2(128),TAMPON VARCHAR2(128),REFDETAIL VARCHAR2(128)," +
                "PROJET VARCHAR2(128),EQUIPEPROD VARCHAR2(128),DEMERITE NUMBER(38,0)," +
                "SUPERVISEUR VARCHAR2(128),REPRISE VARCHAR2(128)," +
                "DEFECT_STATUS VARCHAR2(20) DEFAULT 'NOT FIXED' NOT NULL," +
                "ID NUMBER NOT NULL,CONSTRAINT \"CSL_" + pn + "_PK\" PRIMARY KEY (ID)) TABLESPACE SYSTEM";
    }

    @Override
    @Transactional
    public int bulkDeleteProjectRefs(String project, List<String> rowids) {
        if (rowids == null || rowids.isEmpty()) return 0;
        String pn = QualityRepository.safe(project);
        if (!repo.tableExists(pn)) throw new NoSuchElementException("Project not found: " + pn);
        return repo.bulkDeleteProjectRefs(pn, rowids);
    }

    @Override
    @Transactional
    public Map<String, Object> upsertProjectRefs(String project, List<Map<String, Object>> refs) {
        String pn = QualityRepository.safe(project);
        if (!repo.tableExists(pn)) throw new NoSuchElementException("Project not found: " + pn);

        int inserted = 0, updated = 0, errors = 0;
        for (Map<String, Object> row : refs) {
            try {
                String pdef = truncate(row.get("PDEF"), 26);
                if (pdef.isBlank()) { errors++; continue; }
                boolean exists = repo.existsProjectRefByPdef(pn, pdef);
                repo.upsertProjectRef(pn,
                        truncate(row.get("FAS_ADIENT_PART_NUMBER"), 26),
                        pdef,
                        truncate(row.get("DESIGNATION"), 128),
                        truncate(row.get("VERSION"), 26),
                        truncate(row.get("REF_DETAIL"), 26),
                        truncate(row.get("LIGNE"), 26));
                if (exists) updated++; else inserted++;
            } catch (Exception e) {
                log.warn("Upsert failed for PDEF {}: {}", row.get("PDEF"), e.getMessage());
                errors++;
            }
        }
        return Map.of("inserted", inserted, "updated", updated, "errors", errors);
    }

    @Override
    public List<String> getRefVerifMessages(String project, String pdef) {
        String pn = QualityRepository.safe(project);
        return repo.getRefVerifMessages(pn, metadataPdef(pdef));
    }

    @Override
    public List<Map<String, Object>> getAllRefVerifMessages() {
        return repo.getAllRefVerifMessages();
    }

    @Override
    @Transactional("oracleTransactionManager")
    public void setRefVerifMessages(String project, String pdef, List<String> messages) {
        String pn = QualityRepository.safe(project);
        repo.setRefVerifMessages(pn, metadataPdef(pdef), metadataValues(messages));
    }

    @Override
    public List<String> getRefCheckpoints(String project, String pdef) {
        String pn = QualityRepository.safe(project);
        return repo.getRefCheckpoints(pn, metadataPdef(pdef));
    }

    @Override
    public List<Map<String, Object>> getAllRefCheckpoints() {
        return repo.getAllRefCheckpoints();
    }

    @Override
    @Transactional("oracleTransactionManager")
    public void setRefCheckpoints(String project, String pdef, List<String> checkpoints) {
        String pn = QualityRepository.safe(project);
        repo.setRefCheckpoints(pn, metadataPdef(pdef), metadataValues(checkpoints));
    }

    private String metadataPdef(String pdef) {
        if (pdef == null || pdef.isBlank() || pdef.trim().length() > 26) {
            throw new IllegalArgumentException("PDEF obligatoire (26 caractères maximum)");
        }
        return pdef.trim();
    }

    private List<String> metadataValues(List<String> values) {
        if (values == null) throw new IllegalArgumentException("Liste de messages ou checkpoints obligatoire");
        Set<String> normalized = new LinkedHashSet<>();
        for (String value : values) {
            if (value == null || value.isBlank()) continue;
            String text = value.trim();
            if (text.length() > 500) {
                throw new IllegalArgumentException("Chaque message ou checkpoint est limité à 500 caractères");
            }
            normalized.add(text);
        }
        return new ArrayList<>(normalized);
    }

    @Override
    public List<String> getLignesProjet(String project) {
        String pn = QualityRepository.safe(project);
        if (!repo.tableExists(pn)) throw new NoSuchElementException("Project not found: " + pn);
        return repo.getDistinctLignes(pn);
    }

    private String truncate(Object o, int max) {
        if (o == null) return "";
        String s = o.toString();
        return s.length() > max ? s.substring(0, max) : s;
    }
}
