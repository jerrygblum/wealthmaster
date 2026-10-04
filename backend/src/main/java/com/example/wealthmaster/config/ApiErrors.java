package com.example.wealthmaster.config;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import com.example.wealthmaster.users.SecurityFailure;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(com.example.wealthmaster.accounts.AccountFailure.class)
    public ResponseEntity<Map<String, String>> account(com.example.wealthmaster.accounts.AccountFailure error) {
        return ResponseEntity.status(error.status()).body(Map.of("message", error.getMessage()));
    }
    @ExceptionHandler(SecurityFailure.class)
    public ResponseEntity<Map<String, Object>> security(SecurityFailure error) {
        var builder = ResponseEntity.status(error.status());
        if (error.retryAfter() > 0) builder.header("Retry-After", Long.toString(error.retryAfter()));
        return builder.body(Map.of("message", error.getMessage(), "retryAfterSeconds", error.retryAfter()));
    }
    @ExceptionHandler(MethodArgumentNotValidException.class) @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, Object> validation(MethodArgumentNotValidException error) {
        Map<String, String> fields = new LinkedHashMap<>();
        error.getBindingResult().getFieldErrors().forEach(field -> fields.putIfAbsent(field.getField(), field.getDefaultMessage()));
        return Map.of("message", "Check the entered details.", "fields", fields);
    }
    @ExceptionHandler(IllegalArgumentException.class) @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> invalid(IllegalArgumentException error) {
        return Map.of("message", error.getMessage());
    }
    @ExceptionHandler(HttpMessageNotReadableException.class) @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> unreadable() {
        return Map.of("message", "Invalid request. Check the entered details.");
    }
}
