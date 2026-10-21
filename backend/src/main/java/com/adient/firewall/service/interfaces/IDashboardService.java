package com.adient.firewall.service.interfaces;

import java.util.Map;

public interface IDashboardService {

    Map<String, Object> getDashboard();

    Map<String, Object> getDashboardFiltered(String date1, String date2,
                                              String projet, String coddef, String superviseur);
}
