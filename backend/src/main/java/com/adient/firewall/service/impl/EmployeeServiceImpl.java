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
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
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
    @Transactional("oracleTransactionManager")
    public void create(EmployeeDto e) {
        EmployeeDto employee = withTampon(e);
        repo.synchronizeEmployeeTampon(employee.tampon(), employee.mat());
        repo.insertEmployee(employee);
    }

    @Override
    @Transactional("oracleTransactionManager")
    public void update(EmployeeDto e) {
        EmployeeDto employee = withTampon(e);
        int rows = repo.updateEmployee(employee);
        if (rows == 0) throw new NoSuchElementException("Employee not found: " + e.mat());
        repo.synchronizeEmployeeTampon(employee.tampon(), employee.mat());
    }

    @Override
    @Transactional("oracleTransactionManager")
    public void delete(String mat) {
        int rows = repo.deleteEmployee(mat);
        if (rows == 0) throw new NoSuchElementException("Employee not found: " + mat);
        repo.releaseEmployeeTampons(mat);
    }

    @Override
    @Transactional("oracleTransactionManager")
    public Map<String, Integer> importEmployees(List<EmployeeImportDto> employees) {
        if (employees == null || employees.isEmpty()) {
            throw new IllegalArgumentException("Aucune ligne à importer");
        }

        Set<String> seenMats = new HashSet<>();
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

            String normalizedMat = mat.toUpperCase(Locale.ROOT);
            if (!seenMats.add(normalizedMat) || repo.employeeExists(mat)) {
                skipped++;
                continue;
            }

            List<String> rowTampons = row.tampons() == null ? List.of() : row.tampons().stream()
                    .filter(code -> code != null && !code.isBlank())
                    .map(code -> code.trim().toUpperCase(Locale.ROOT))
                    .distinct()
                    .toList();
            if (rowTampons.size() != 1) {
                throw new IllegalArgumentException("Ligne " + rowNumber + " : un seul tampon est obligatoire par employé");
            }

            EmployeeDto employee = new EmployeeDto(mat, row.name().trim(), rowTampons.get(0),
                    row.dateEmbauche(), row.projet(), row.equipe(), row.equipe2(), row.supervisor());
            try {
                create(employee);
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Ligne " + rowNumber + " : " + e.getMessage(), e);
            }
            inserted++;
        }
        return Map.of("inserted", inserted, "skipped", skipped);
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private EmployeeDto withTampon(EmployeeDto e) {
        if (e.tampon() == null || e.tampon().isBlank()) {
            throw new IllegalArgumentException("Code tampon requis");
        }
        String code = e.tampon().trim().toUpperCase(Locale.ROOT);
        if (code.length() > 50 || code.contains(",") || code.contains(";") || code.contains("|")) {
            throw new IllegalArgumentException("Saisissez un seul code tampon (50 caractères maximum)");
        }
        return new EmployeeDto(e.mat(), e.name(), code, e.dateEmbauche(),
                e.projet(), e.equipe(), e.equipe2(), e.supervisor());
    }

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
