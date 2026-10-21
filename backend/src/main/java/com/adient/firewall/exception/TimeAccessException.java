package com.adient.firewall.exception;

/** Thrown when a user attempts to log in outside their allowed time window. */
public class TimeAccessException extends RuntimeException {
    public TimeAccessException(String message) {
        super(message);
    }
}
