package com.adient.firewall.repository;

import com.adient.firewall.dto.OperatorBulkRequest;
import com.adient.firewall.dto.OperatorBulkResult;
import com.adient.firewall.dto.OperatorBulkResult.PreservedTampon;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;

@Repository
@RequiredArgsConstructor
public class OperatorBulkRepository {

    private final JdbcTemplate db;

    private record Target(String table, String key, String name, Map<String, String> fields) {}

    private Target target(String kind) {
        return switch (kind) {
            case "employees" -> new Target("POLY", "MAT", "NAME", Map.of(
                    "projet", "PROJET", "equipe", "EQUIPE", "equipe2", "EQUIPE2",
                    "supervisor", "SUPERVISOR", "dateEmbauche", "DATE_EMBAUCHE"));
            case "supervisors" -> new Target("SUPERVISORS", "NAME", "NAME", Map.of());
            case "tampons" -> new Target("TAMPONS", "ID", "CODE", Map.of("description", "DESCRIPTION"));
            case "couturieres" -> new Target("DELIBERA_COUTURIERES", "ID", "NOM",
                    Map.of("projet", "PROJET", "equipe", "EQUIPE", "actif", "ACTIF"));
            default -> throw new IllegalArgumentException("Onglet opérateurs inconnu");
        };
    }

    @Transactional("oracleTransactionManager")
    public OperatorBulkResult apply(String kind, OperatorBulkRequest request) {
        Target target = target(kind);
        if (request == null || request.ids() == null || request.ids().isEmpty()
                || request.ids().stream().anyMatch(id -> id == null || id.isBlank())) {
            throw new IllegalArgumentException("Sélection obligatoire");
        }
        List<String> ids = request.ids().stream().distinct().sorted().toList();
        if (ids.size() != request.ids().size()) {
            throw new IllegalArgumentException("Identifiants répétés dans la sélection");
        }
        String action = request.action();
        if (!Set.of("update", "rename", "delete").contains(action == null ? "" : action)) {
            throw new IllegalArgumentException("Action groupée inconnue");
        }
        Map<String, String> changes = request.changes() == null ? Map.of() : request.changes();
        Map<String, String> names = request.names() == null ? Map.of() : request.names();
        if ("update".equals(action)) {
            if (changes.isEmpty() || !target.fields().keySet().containsAll(changes.keySet())
                    || changes.values().stream().anyMatch(Objects::isNull)) {
                throw new IllegalArgumentException("Champs de modification invalides");
            }
            if (changes.containsKey("dateEmbauche") && !changes.get("dateEmbauche").isBlank()) {
                try {
                    LocalDate.parse(changes.get("dateEmbauche"));
                } catch (DateTimeParseException e) {
                    throw new IllegalArgumentException("Date d'embauche invalide (AAAA-MM-JJ)");
                }
            }
            if (changes.containsKey("actif") && !Set.of("0", "1").contains(changes.get("actif"))) {
                throw new IllegalArgumentException("Le statut doit être actif ou inactif");
            }
        }
        if ("rename".equals(action) && (!names.keySet().equals(new HashSet<>(ids))
                || names.values().stream().anyMatch(name -> name == null || name.isBlank()))) {
            throw new IllegalArgumentException("Un nouveau nom est requis pour chaque élément sélectionné");
        }

        Map<String, Map<String, Object>> rows = new LinkedHashMap<>();
        for (String id : ids) {
            List<Map<String, Object>> matches = db.queryForList(
                    "SELECT * FROM SYSTEM." + target.table() + " WHERE " + target.key() + "=? FOR UPDATE", id);
            if (matches.isEmpty()) {
                throw new NoSuchElementException("Élément introuvable : " + id + ". Rechargez la liste.");
            }
            rows.put(id, matches.get(0));
        }
        List<PreservedTampon> preserved = new ArrayList<>();
        Set<String> preservedIds = new HashSet<>();
        if ("delete".equals(action) && "tampons".equals(kind)) {
            for (var entry : rows.entrySet()) {
                Map<String, Object> row = entry.getValue();
                Integer legacyAssignments = db.queryForObject(
                        "SELECT COUNT(*) FROM SYSTEM.POLY WHERE UPPER(TAMPON)=UPPER(?)",
                        Integer.class, row.get("CODE"));
                if (row.get("MAT") != null || (legacyAssignments != null && legacyAssignments > 0)) {
                    preservedIds.add(entry.getKey());
                    preserved.add(new PreservedTampon(entry.getKey(), String.valueOf(row.get("CODE")),
                            row.get("MAT") == null ? null : row.get("MAT").toString()));
                }
            }
        }
        if ("rename".equals(action) && ("tampons".equals(kind) || "supervisors".equals(kind))) {
            Set<String> unique = new HashSet<>();
            for (String id : ids) {
                String name = names.get(id).trim().toUpperCase(Locale.ROOT);
                if (!unique.add(name)) throw new IllegalArgumentException("Noms ou codes répétés : " + name);
                Integer collisions = db.queryForObject(
                        "SELECT COUNT(*) FROM SYSTEM." + target.table()
                                + " WHERE UPPER(" + target.name() + ")=? AND " + target.key() + "<>?",
                        Integer.class, name, id);
                if (collisions != null && collisions > 0) {
                    throw new IllegalArgumentException("Ce nom ou code existe déjà : " + name);
                }
            }
        }

        for (String id : ids) {
            if (preservedIds.contains(id)) continue;
            Map<String, Object> row = rows.get(id);
            if ("delete".equals(action)) {
                if ("employees".equals(kind)) {
                    db.update("UPDATE SYSTEM.TAMPONS SET MAT=NULL WHERE MAT=?", id);
                } else if ("supervisors".equals(kind)) {
                    db.update("UPDATE SYSTEM.POLY SET SUPERVISOR=NULL WHERE SUPERVISOR=?", id);
                }
                db.update("DELETE FROM SYSTEM." + target.table() + " WHERE " + target.key() + "=?", id);
            } else if ("rename".equals(action)) {
                String name = names.get(id).trim();
                if ("supervisors".equals(kind) || "tampons".equals(kind) || "employees".equals(kind)) {
                    name = name.toUpperCase(Locale.ROOT);
                }
                db.update("UPDATE SYSTEM." + target.table() + " SET " + target.name()
                        + "=? WHERE " + target.key() + "=?", name, id);
                if ("supervisors".equals(kind)) {
                    db.update("UPDATE SYSTEM.POLY SET SUPERVISOR=? WHERE SUPERVISOR=?", name, id);
                } else if ("tampons".equals(kind)) {
                    db.update("UPDATE SYSTEM.POLY SET TAMPON=? WHERE TAMPON=?", name, row.get("CODE"));
                }
            } else {
                List<String> assignments = new ArrayList<>();
                List<Object> params = new ArrayList<>();
                for (Map.Entry<String, String> entry : changes.entrySet()) {
                    String column = target.fields().get(entry.getKey());
                    String value = entry.getValue().trim();
                    if ("DATE_EMBAUCHE".equals(column)) {
                        assignments.add(column + "=TO_DATE(?,'YYYY-MM-DD')");
                    } else {
                        assignments.add(column + "=?");
                    }
                    params.add("employees".equals(kind) && !"DATE_EMBAUCHE".equals(column)
                            ? value.toUpperCase(Locale.ROOT) : value);
                }
                params.add(id);
                db.update("UPDATE SYSTEM." + target.table() + " SET " + String.join(",", assignments)
                        + " WHERE " + target.key() + "=?", params.toArray());
            }
        }
        return new OperatorBulkResult(ids.size() - preserved.size(), List.copyOf(preserved));
    }
}
