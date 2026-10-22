package com.adient.firewall.service.impl;

import com.adient.firewall.dto.EmployeeDto;
import com.adient.firewall.dto.EmployeeImportDto;
import com.adient.firewall.repository.QualityRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EmployeeServiceImplTest {
    @Mock QualityRepository repo;
    @InjectMocks EmployeeServiceImpl service;

    private EmployeeDto employee(String code) {
        return new EmployeeDto("123", "Employee", code, "", "CSL", "PROJECT", "A", "SUP");
    }

    private EmployeeImportDto imported(String mat, List<String> codes) {
        return new EmployeeImportDto(mat, "Employee", "", "CSL", "PROJECT", "A", "SUP", codes);
    }

    @Test
    void createsAndAssignsNormalizedStampWithEmployee() {
        service.create(employee(" cq108 "));
        var order = inOrder(repo);
        order.verify(repo).synchronizeEmployeeTampon("CQ108", "123");
        order.verify(repo).insertEmployee(employee("CQ108"));
    }

    @Test
    void rejectsMissingOrMultipleStampCodesBeforeWriting() {
        for (String code : new String[] { null, "", " ", "CQ1,CQ2", "CQ1;CQ2", "CQ1|CQ2", "X".repeat(51) }) {
            assertThrows(IllegalArgumentException.class, () -> service.create(employee(code)));
        }
        verifyNoInteractions(repo);
    }

    @Test
    void rejectsAnAssignedStampWithoutCreatingEmployee() {
        doThrow(new IllegalArgumentException("Already assigned")).when(repo).synchronizeEmployeeTampon("CQ108", "123");
        assertThrows(IllegalArgumentException.class, () -> service.create(employee("CQ108")));
        verify(repo, never()).insertEmployee(any());
    }

    @Test
    void replacesStampWhenUpdatingEmployee() {
        when(repo.updateEmployee(employee("CQ109"))).thenReturn(1);
        service.update(employee(" cq109 "));
        verify(repo).synchronizeEmployeeTampon("CQ109", "123");
    }

    @Test
    void doesNotAssignStampToMissingEmployee() {
        assertThrows(NoSuchElementException.class, () -> service.update(employee("CQ108")));
        verify(repo, never()).synchronizeEmployeeTampon(anyString(), anyString());
    }

    @Test
    void releasesStampOnEmployeeDeletion() {
        when(repo.deleteEmployee("123")).thenReturn(1);
        service.delete("123");
        verify(repo).releaseEmployeeTampons("123");
    }

    @Test
    void importsNewStampThroughSameEmployeeCreationFlow() {
        assertEquals(Map.of("inserted", 1, "skipped", 0),
                service.importEmployees(List.of(imported("123", List.of(" cq108 ")))));
        verify(repo).synchronizeEmployeeTampon("CQ108", "123");
        verify(repo).insertEmployee(employee("CQ108"));
    }

    @Test
    void importRejectsMissingOrMultipleStampsWithRowNumber() {
        for (List<String> codes : List.of(List.<String>of(), List.of("CQ1", "CQ2"))) {
            var error = assertThrows(IllegalArgumentException.class,
                    () -> service.importEmployees(List.of(imported("123", codes))));
            assertTrue(error.getMessage().contains("Ligne 2"));
        }
        verify(repo, never()).insertEmployee(any());
    }

    @Test
    void importPreservesExistingEmployees() {
        when(repo.employeeExists("123")).thenReturn(true);
        assertEquals(Map.of("inserted", 0, "skipped", 1),
                service.importEmployees(List.of(imported("123", List.of()))));
        verify(repo, never()).synchronizeEmployeeTampon(anyString(), anyString());
        verify(repo, never()).insertEmployee(any());
    }
}
