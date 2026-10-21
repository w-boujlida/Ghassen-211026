package com.adient.firewall.service.impl;

import com.adient.firewall.dto.CustomRoleDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class UserConfigurationService {
    private final UserServiceImpl users;

    public record Configuration(List<CustomRoleDto> roles, Map<String, Map<String, String>> permissions) {}

    @Transactional("oracleTransactionManager")
    public void saveConfiguration(Configuration configuration) {
        if (configuration == null) throw new IllegalArgumentException("Configuration requise");
        users.saveCustomRoles(configuration.roles());
        users.savePermissions(configuration.permissions());
    }
}
