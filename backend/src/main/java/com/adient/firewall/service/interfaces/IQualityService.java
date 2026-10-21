package com.adient.firewall.service.interfaces;

import com.adient.firewall.dto.PageResponse;
import com.adient.firewall.dto.QualityRecordDto;
import com.adient.firewall.dto.QualityRecordInput;

import java.util.List;
import java.util.Map;

public interface IQualityService {

    PageResponse<QualityRecordDto> getRecords(
            String tablePrefix, String operatorCol, String projet,
            int page, int limit, Map<String, String> filters);

    Map<String, Object> getStats(String tablePrefix, String projet);

    Map<String, Object> getStats(String tablePrefix, String projet, String period, String dateFrom, String dateTo);

    Map<String, Object> getStats(String tablePrefix, String projet, String period, String dateFrom, String dateTo,
                                 String superviseur, String poste);

    Map<String, Object> getReport(String tablePrefix, String projet, Map<String, String> filters);

    void createRecord(String tablePrefix, String operatorCol, QualityRecordInput in);

    Map<String, Object> importRecords(String tablePrefix, String operatorCol, String projet, List<QualityRecordInput> records);

    void updateRecord(String tablePrefix, String operatorCol, String projet, Long id, QualityRecordInput in);

    void deleteRecord(String tablePrefix, String projet, Long id, String codDef);

    void deleteByKey(String tablePrefix, String projet, String barCode, String codDef);

    List<String> getSources(String tablePrefix);

    void bulkUpdateReprise(String tablePrefix, String projet, List<String> barcodes, String reprise);
}
