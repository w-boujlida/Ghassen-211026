package com.adient.firewall.service.interfaces;

import java.util.List;
import java.util.Map;

public interface IProjectService {

    List<Map<String, Object>> getProjects();

    Map<String, Object> getProjectRefs(String project, int page, int limit);

    void createProject(String name);
    void createProject(String name, Integer barcodeLength);
    void createProject(String name, Integer barcodeLength, java.util.List<com.adient.firewall.dto.ScanRule> rules);
    void setBarcodeLength(String name, Integer barcodeLength);
    java.util.List<com.adient.firewall.dto.ScanRule> getDeliberaScanRules(String name);
    void setDeliberaScanRules(String name, java.util.List<com.adient.firewall.dto.ScanRule> rules);
    void setScanSettings(String name, Integer length, java.util.List<com.adient.firewall.dto.ScanRule> rules);
    java.util.Map<String, Object> getVersionScanSettings(String name, String version);
    void setVersionScanSettings(String name, String version, Integer length, java.util.List<com.adient.firewall.dto.ScanRule> rules);
    java.util.Map<String, Object> getReferenceScanSettings(String name, String pdef, String version);
    void setReferenceScanSettings(String name, String pdef, String version, Integer length, java.util.List<com.adient.firewall.dto.ScanRule> rules);

    Map<String, Object> importProjectRefs(String project, List<Map<String, Object>> refs);

    void addProjectRef(String project, Map<String, Object> ref);

    void updateProjectRef(String project, String rowid, Map<String, Object> ref);

    void deleteProjectRef(String project, String rowid);

    void renameProject(String oldName, String newName);

    void deleteProject(String name);

    int bulkDeleteProjectRefs(String project, List<String> rowids);

    Map<String, Object> upsertProjectRefs(String project, List<Map<String, Object>> refs);

    List<String> getRefVerifMessages(String project, String pdef);

    List<Map<String, Object>> getAllRefVerifMessages();

    void setRefVerifMessages(String project, String pdef, List<String> messages);

    List<String> getRefCheckpoints(String project, String pdef);

    List<Map<String, Object>> getAllRefCheckpoints();

    void setRefCheckpoints(String project, String pdef, List<String> checkpoints);

    List<String> getLignesProjet(String project);
}
