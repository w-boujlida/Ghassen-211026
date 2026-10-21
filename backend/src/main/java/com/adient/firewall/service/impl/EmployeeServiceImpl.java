package com.adient.firewall.service.impl;

import com.adient.firewall.dto.EmployeeDto;
import com.adient.firewall.dto.EmployeeImportDto;
import com.adient.firewall.dto.PageResponse;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.service.interfaces.IEmployeeService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class EmployeeServiceImpl implements IEmployeeService {

    private final QualityRepository repo;

    @Override
    public PageResponse<EmployeeDto> getAll(int page, int limit, Map<String, String> filters) {
        String where = buildWhere(filters);
        Object[] params = buildParams(filters);
        int total = repo.countEmployees(where, params);
        List<EmployeeDto> records = repo.fetchEmployees(where, params, page, limit);
        return PageResponse.of(records, page, limit, total);
    }

    @Override
    @Transactional
    public void create(EmployeeDto e) {
        repo.insertEmployee(e);
    }

    @Override
    @Transactional
    public void update(EmployeeDto e) {
        int rows = repo.updateEmployee(e);
        if (rows == 0) throw new NoSuchElementException("Employee not found: " + e.mat());
    }

    @Override
    @Transactional
    public void delete(String mat) {
        int rows = repo.deleteEmployee(mat);
        if (rows == 0) throw new NoSuchElementException("Employee not found: " + mat);
    }

    @Override
    @Transactional
    public Map<String, Integer> importEmployees(List<EmployeeImportDto> employees) {
        if (employees == null || employees.isEmpty()) {
            throw new IllegalArgumentException("Aucune ligne à importer");
        }

        Set<String> seenMats = new HashSet<>();
        Map<String, String> tamponOwners = new HashMap<>();
        int inserted = 0;
        int skipped = 0;

        for (int i = 0; i < employees.size(); i++) {
            int rowNumber = i + 2;
            EmployeeImportDto row = employees.get(i);
            if (row == null || row.mat() == null || row.mat().isBlank()
                    || row.name() == null || row.name().isBlank()) {
                throw new IllegalArgumentException("Ligne " + rowNumber + " : matricule et nom obligatoires");
            }
            String mat = row.mat().trim();
            if (row.dateEmbauche() != null && !row.dateEmbauche().isBlank()) {
                try {
                    LocalDate.parse(row.dateEmbauche().trim());
                } catch (DateTimeParseException e) {
                    throw new IllegalArgumentException("Ligne " + rowNumber + " : date d'embauche invalide (AAAA-MM-JJ)");
                }
            }

            String normalizedMat = mat.toUpperCase();
            if (!seenMats.add(normalizedMat) || repo.employeeExists(mat)) {
                skipped++;
                continue;
            }

            List<String> rowTampons = row.tampons() == null ? List.of() : row.tampons().stream()
                    .filter(code -> code != null && !code.isBlank())
                    .map(String::trim)
                    .distinct()
                    .toList();
            for (String code : rowTampons) {
                String normalizedCode = code.toUpperCase();
                String priorOwner = tamponOwners.putIfAbsent(normalizedCode, mat);
                if (priorOwner != null && !priorOwner.equalsIgnoreCase(mat)) {
                    throw new IllegalArgumentException("Ligne " + rowNumber + " : le tampon " + code + " est attribué plusieurs fois");
                }
                Map<String, Object> tampon = repo.findTamponByCode(code)
                        .orElseThrow(() -> new IllegalArgumentException("Ligne " + rowNumber + " : tampon introuvable " + code));
                Object owner = tampon.get("MAT");
                if (owner != null && !owner.toString().equalsIgnoreCase(mat)) {
                    throw new IllegalArgumentException("Ligne " + rowNumber + " : le tampon " + code + " est déjà attribué");
                }
            }

            String primaryTampon = rowTampons.isEmpty() ? null : rowTampons.get(0);
            EmployeeDto employee = new EmployeeDto(mat, row.name().trim(), primaryTampon,
                    row.dateEmbauche(), row.projet(), row.equipe(), row.equipe2(), row.supervisor());
            repo.insertEmployee(employee);
            for (String code : rowTampons) {
                repo.assignTamponToEmployee(code, mat);
            }
            inserted++;
        }
        return Map.of("inserted", inserted, "skipped", skipped);
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private String getParam(Map<String, String> f, String... keys) {
        for (String k : keys) {
            if (f.containsKey(k) && !f.get(k).isBlank()) return f.get(k);
        }
        return null;
    }

    private String buildWhere(Map<String, String> f) {
        List<String> conds = new ArrayList<>();
        if (f.containsKey("search") && !f.get("search").isBlank())
            conds.add("(UPPER(TO_CHAR(MAT)) LIKE UPPER(?) OR UPPER(NAME) LIKE UPPER(?) OR " +
                    "UPPER(TAMPON) LIKE UPPER(?) OR UPPER(PROJET) LIKE UPPER(?) OR " +
                    "UPPER(EQUIPE) LIKE UPPER(?) OR UPPER(EQUIPE2) LIKE UPPER(?) OR UPPER(SUPERVISOR) LIKE UPPER(?))");
        if (getParam(f, "projectFilter", "equipe") != null) conds.add("LOWER(EQUIPE)=?");
        if (getParam(f, "shiftFilter",   "equipe2") != null) conds.add("LOWER(EQUIPE2)=?");
        if (getParam(f, "functionFilter","projet")  != null) conds.add("LOWER(PROJET)=?");
        if (getParam(f, "supervisorFilter","supervisor") != null) conds.add("LOWER(SUPERVISOR)=?");
        return conds.isEmpty() ? "" : String.join(" AND ", conds);
    }

    private Object[] buildParams(Map<String, String> f) {
        List<Object> p = new ArrayList<>();
        if (f.containsKey("search") && !f.get("search").isBlank()) {
            String s = "%" + f.get("search") + "%";
            for (int i = 0; i < 7; i++) p.add(s);
        }
        String equipeVal = getParam(f, "projectFilter", "equipe");
        if (equipeVal != null) p.add(equipeVal.toLowerCase());
        String equipe2Val = getParam(f, "shiftFilter", "equipe2");
        if (equipe2Val != null) p.add(equipe2Val.toLowerCase());
        String projetVal = getParam(f, "functionFilter", "projet");
        if (projetVal != null) p.add(projetVal.toLowerCase());
        String supervisorVal = getParam(f, "supervisorFilter", "supervisor");
        if (supervisorVal != null) p.add(supervisorVal.toLowerCase());
        return p.toArray();
    }
}
