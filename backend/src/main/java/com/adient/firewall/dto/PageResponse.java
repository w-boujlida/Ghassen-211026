package com.adient.firewall.dto;

import java.util.List;

public record PageResponse<T>(
        List<T> records,
        PaginationMeta pagination
) {
    public record PaginationMeta(int currentPage, int totalPages, int totalRecords, int recordsPerPage) {}

    public static <T> PageResponse<T> of(List<T> records, int page, int limit, int total) {
        int pages = (int) Math.ceil((double) total / limit);
        return new PageResponse<>(records, new PaginationMeta(page, pages, total, limit));
    }
}
