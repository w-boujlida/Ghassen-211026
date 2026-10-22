package com.adient.firewall.repository;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class ReferenceMetadataRepositoryTest {
    @Test
    void readFailuresAreNotReturnedAsEmptyLists() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        QualityRepository repo = new QualityRepository(db);
        when(db.queryForList(anyString(), eq(String.class), eq("AUDI"), eq("P1")))
                .thenThrow(new DataAccessResourceFailureException("Unavailable"));
        assertThrows(DataAccessResourceFailureException.class, () -> repo.getRefVerifMessages("AUDI", "P1"));
        assertThrows(DataAccessResourceFailureException.class, () -> repo.getRefCheckpoints("AUDI", "P1"));
    }

    @Test
    void insertFailureDoesNotRunDdlOrRetryInsideTransaction() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        QualityRepository repo = new QualityRepository(db);
        when(db.update(startsWith("INSERT"), any(Object[].class)))
                .thenThrow(new DataIntegrityViolationException("Invalid row"));
        assertThrows(DataIntegrityViolationException.class,
                () -> repo.setRefVerifMessages("AUDI", "P1", List.of("Message")));
        verify(db, never()).execute(anyString());
        verify(db, times(1)).update(startsWith("INSERT"), any(Object[].class));
    }
}
