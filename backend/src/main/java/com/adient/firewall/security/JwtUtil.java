package com.adient.firewall.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Date;
import java.util.Map;

@Component
public class JwtUtil {

    private final SecretKey key;
    private final long expirationMs;

    public JwtUtil(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.expiration-ms}") long expirationMs) {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            keyBytes = Arrays.copyOf(keyBytes, 32); // zero-pad to 256 bits minimum for HS256
        }
        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.expirationMs = expirationMs;
    }

    public String generate(String matricule, String fullName, String role, long userId) {
        return Jwts.builder()
                .subject(matricule)
                .claims(Map.of(
                        "username",  matricule,
                        "matricule", matricule,
                        "full_name", fullName,
                        "role",      role,
                        "user_id",   userId
                ))
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(key)
                .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public boolean isValid(String token) {
        try {
            parse(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    public String getMatricule(String token) {
        return parse(token).getSubject();
    }

    public String getRole(String token) {
        return (String) parse(token).get("role");
    }

    public Long getUserId(String token) {
        Object id = parse(token).get("user_id");
        if (id instanceof Integer i) return i.longValue();
        if (id instanceof Long l) return l;
        return 0L;
    }
}
