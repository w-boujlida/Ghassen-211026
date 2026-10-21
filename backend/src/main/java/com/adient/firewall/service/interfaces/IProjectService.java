package com.adient.firewall.service.interfaces;

import java.util.List;
import java.util.Map;

public interface IProjectService {

    List<Map<String, Object>> getProjects();

    Map<String, Object> getProjectRefs(String project, int page, int limit);

    void createProject(String name);

    Map<String, Object> importProjectRefs(String project, List<Map<String, Object>> refs);

    void addProjectRef(String project, Map<String, Object> ref);

    void updateProjectRef(String project, String rowid, Map<String, Object> ref);

    void deleteProjectRef(String project, String rowid);

    void renameProject(String oldName, String newName);

    void deleteProject(String name);

    int bulkDeleteProjectRefs(String project, List<String> rowids);

    Map<String, Object> upsertProjectRefs(String project, List<Map<String, Object>> refs);

    List<String> getRefVerifMessages(String project, String pdef);

    void setRefVerifMessages(String project, String pdef, List<String> messages);

    List<String> getRefCheckpoints(String project, String pdef);

    void setRefCheckpoints(String project, String pdef, List<String> checkpoints);

    List<String> getLignesProjet(String project);
}
