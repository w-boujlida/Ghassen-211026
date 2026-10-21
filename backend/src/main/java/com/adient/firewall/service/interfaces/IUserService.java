package com.adient.firewall.service.interfaces;

import com.adient.firewall.dto.CustomRoleDto;
import com.adient.firewall.dto.LoginHistoryDto;
import com.adient.firewall.dto.UserDto;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

public interface IUserService {
    List<LoginHistoryDto> selectLoginHistory(Long userId, String matricule, String from, String to, String status);

    List<UserDto> listUsers();

    void createUser(String matricule, String fullName, String email, String phone, String role);

    void updateUser(Long id, String fullName, String email, String phone, String role, boolean active);

    void toggleActive(Long id, boolean active);

    void unlockUser(Long id);

    @Transactional
    void deleteUser(Long id);

    void resetPassword(Long id);

    void updateTimeAccess(Long id, String preset, String start, String end);

    List<LoginHistoryDto> listLoginHistory(Long userId, String dateFrom, String dateTo);

    List<LoginHistoryDto> listAllLoginHistory(String matricule, String dateFrom, String dateTo, String status);

    Map<String, Map<String, String>> getPermissions();

    void savePermissions(Map<String, Map<String, String>> permissions);

    List<CustomRoleDto> getCustomRoles();

    void saveCustomRoles(List<CustomRoleDto> roles);
}
