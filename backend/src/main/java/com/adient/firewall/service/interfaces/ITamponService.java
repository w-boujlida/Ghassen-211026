package com.adient.firewall.service.interfaces;

import com.adient.firewall.dto.TamponImportDto;

import java.util.List;
import java.util.Map;

public interface ITamponService {

    List<Map<String, Object>> getAllTampons();

    Map<String, Integer> importTampons(List<TamponImportDto> tampons);

    Map<String, Object> createTampon(String code, String description);

    void updateTampon(Long id, String code, String description);

    void deleteTampon(Long id);

    void assignTampon(Long id, String mat);

    void unassignTampon(Long id);

    List<Map<String, Object>> getEmployeeTampons(String mat);

    Map<String, Object> getSupervisorByTampon(String code);

    List<Map<String, Object>> getAvailableTampons();

    List<Map<String, Object>> getAvailableTamponsForEmployee(String mat);
}
