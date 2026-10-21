package com.adient.firewall.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Format identique PHP config1.php :
 *   Succès : { success: true,  data: {}, message: "...", timestamp: "..." }
 *   Erreur  : { success: false, error:  "...", timestamp: "..." }
 * @JsonInclude(NON_NULL) garantit que les champs null ne sont pas sérialisés.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiResponse<T>(
        boolean success,
        T data,
        String message,
        String error,
        String timestamp
) {
    private static final DateTimeFormatter FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** Succès sans message */
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, null, null, LocalDateTime.now().format(FMT));
    }

    /** Succès avec message */
    public static <T> ApiResponse<T> ok(T data, String message) {
        return new ApiResponse<>(true, data, message, null, LocalDateTime.now().format(FMT));
    }

    /** Erreur — champ "error" comme PHP sendError() */
    public static <T> ApiResponse<T> error(String errorMessage) {
        return new ApiResponse<>(false, null, null, errorMessage, LocalDateTime.now().format(FMT));
    }
}
