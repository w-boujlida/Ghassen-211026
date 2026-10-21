package com.adient.firewall.repository;

import com.adient.firewall.controller.UserConfigurationController;
import com.adient.firewall.dto.CustomRoleDto;
import com.adient.firewall.service.impl.UserConfigurationService;
import com.adient.firewall.service.impl.PermissionService;
import com.adient.firewall.service.impl.UserServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class UserConfigurationValidationTest {
    private final QualityRepository repo = mock(QualityRepository.class);
    private final UserServiceImpl users = new UserServiceImpl(repo, mock(PasswordEncoder.class), mock(PermissionService.class));

    @Test void removedBulkUserRouteHasNoHandler() throws Exception {
        UserConfigurationService service = mock(UserConfigurationService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new UserConfigurationController(service)).build();
        mvc.perform(post("/api/admin/users/bulk-actions")
                .contentType("application/json")
                .content("{\"action\":\"delete\",\"ids\":[\"1\"]}"))
                .andExpect(status().isNotFound());
        verifyNoInteractions(service);
    }

    @Test void configurationRouteStillSavesRolesAndPermissions() throws Exception {
        UserConfigurationService service = mock(UserConfigurationService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new UserConfigurationController(service)).build();
        mvc.perform(put("/api/admin/permissions/configuration")
                .contentType("application/json")
                .content("{\"roles\":[],\"permissions\":{}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
        verify(service).saveConfiguration(new UserConfigurationService.Configuration(List.of(), Map.of()));
    }

    @Test void configurationRequiresBodyAndSavesBothParts() {
        UserServiceImpl delegate = mock(UserServiceImpl.class);
        UserConfigurationService service = new UserConfigurationService(delegate);
        assertThrows(IllegalArgumentException.class, () -> service.saveConfiguration(null));
        verifyNoInteractions(delegate);
        service.saveConfiguration(new UserConfigurationService.Configuration(List.of(), Map.of()));
        var order = inOrder(delegate);
        order.verify(delegate).saveCustomRoles(List.of());
        order.verify(delegate).savePermissions(Map.of());
    }

    @Test void assignedCustomRolesCannotBeDeletedAndBuiltinsCannotBeReplaced() {
        CustomRoleDto custom = new CustomRoleDto("quality", "Qualité", null, null, null);
        when(repo.findAllCustomRoles()).thenReturn(List.of(custom));
        when(repo.countUsersWithRole("quality")).thenReturn(1);
        assertThrows(IllegalArgumentException.class, () -> users.saveCustomRoles(List.of()));
        assertThrows(IllegalArgumentException.class, () -> users.saveCustomRoles(
                List.of(new CustomRoleDto("admin", "Fake admin", null, null, null))));
        verify(repo, never()).deleteAllCustomRoles();
    }

    @Test void roleLabelRenamePreservesStableKey() {
        when(repo.findAllCustomRoles()).thenReturn(List.of(new CustomRoleDto("quality", "Old", null, null, null)));
        users.saveCustomRoles(List.of(new CustomRoleDto("quality", "New", null, null, null)));
        verify(repo).insertCustomRole("quality", "New", null, null, null);
        verify(repo, never()).countUsersWithRole(anyString());
    }

    @Test void administratorPermissionsCannotBeReducedAndInvalidLevelsCannotBeSaved() {
        assertThrows(IllegalArgumentException.class, () -> users.savePermissions(Map.of("admin", Map.of("users", "none"))));
        assertThrows(IllegalArgumentException.class, () -> users.savePermissions(Map.of("operator", Map.of("users", "invalid"))));
        verifyNoInteractions(repo);
    }
}
