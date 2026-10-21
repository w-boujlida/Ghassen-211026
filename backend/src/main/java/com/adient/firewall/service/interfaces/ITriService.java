package com.adient.firewall.service.interfaces;

import com.adient.firewall.dto.PageResponse;
import com.adient.firewall.dto.TriFicheDto;
import com.adient.firewall.dto.TriFicheInput;

import java.util.List;
import java.util.Map;

public interface ITriService {

    PageResponse<TriFicheDto> getFiches(String projet, String status, int page, int limit);

    TriFicheDto getFicheById(Long id);

    TriFicheDto createFiche(TriFicheInput input);

    TriFicheDto updateFiche(Long id, TriFicheInput input);

    void deleteFiche(Long id);

    List<String> getAvailableProjects();

    Map<String, Object> getStats(String projet);

    byte[] exportExcel(String projet, String status) throws Exception;

    Map<String, Object> importExcel(byte[] data) throws Exception;
}
