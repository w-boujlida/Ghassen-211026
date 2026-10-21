package com.adient.firewall.service.interfaces;

import java.util.List;
import java.util.Map;

public interface ITargetService {

    List<Map<String, Object>> listTargets();

    Map<String, Object> getTargetDetail(long id);

    long createTarget(String projet, String shift, List<Map<String, Object>> cells, String createdBy);

    void updateTarget(long id, List<Map<String, Object>> cells);

    void deleteTarget(long id);
}
