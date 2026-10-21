package com.adient.firewall.service.interfaces;

import com.adient.firewall.dto.EmployeeDto;
import com.adient.firewall.dto.EmployeeImportDto;
import com.adient.firewall.dto.PageResponse;

import java.util.List;
import java.util.Map;

public interface IEmployeeService {

    PageResponse<EmployeeDto> getAll(int page, int limit, Map<String, String> filters);

    void create(EmployeeDto e);

    void update(EmployeeDto e);

    void delete(String mat);

    Map<String, Integer> importEmployees(List<EmployeeImportDto> employees);
}
