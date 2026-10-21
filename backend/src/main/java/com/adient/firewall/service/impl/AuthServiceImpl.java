package com.adient.firewall.service.impl;

import com.adient.firewall.dto.LoginRequest;
import com.adient.firewall.dto.LoginResponse;
import com.adient.firewall.exception.TimeAccessException;
import com.adient.firewall.repository.QualityRepository;
import com.adient.firewall.security.JwtUtil;
import com.adient.firewall.service.interfaces.IAuthService;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.net.InetAddress;
import java.net.NetworkInterface;

import java.time.LocalTime;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthServiceImpl implements IAuthService {

    private final QualityRepository repo;
    private final JwtUtil jwtUtil;
    private final PasswordEncoder passwordEncoder;
    private final com.adient.firewall.repository.DeliberaRepository deliberaRepo;

    @Value("${app.admin.initial-password}")
    private String initialAdminPassword;

    @PostConstruct
    public void init() {
        try {
            repo.ensureMasterTables();
        } catch (Exception e) {
            log.warn("Could not ensure DEF/POLY master tables: {}", e.getMessage());
        }
        try {
            repo.ensureTamponsTable();
            if (repo.countTampons() == 0) {
                int migrated = repo.migrateTamponsFromPoly();
                if (migrated > 0) log.info("Auto-migrated {} tampon(s) from POLY.TAMPON", migrated);
            }
        } catch (Exception e) {
            log.warn("Could not auto-migrate tampons: {}", e.getMessage());
        }
        try {
            repo.ensureUsersTable();
            repo.ensureUserExtendedColumns();
            repo.ensureLoginHistoryTable();
            repo.ensurePermissionsTable();
            migrateAdminPassword();
        } catch (Exception e) {
            log.warn("Could not run startup migrations: {}", e.getMessage());
        }
        try {
            repo.ensureDeliberaTables();
        } catch (Exception e) {
            log.warn("Could not create delibera tables: {}", e.getMessage());
        }
    }

    private void migrateAdminPassword() {
        repo.findAdminHashByMatricule("admin").ifPresent(row -> {
            String currentHash = (String) row.get("PWD_HASH");
            if (passwordEncoder.matches("admin", currentHash)) {
                Long id = ((Number) row.get("ID")).longValue();
                repo.updatePassword(id, passwordEncoder.encode(initialAdminPassword));
                log.info("Admin password migrated to new default.");
            }
        });
    }

    @Override
    public LoginResponse login(LoginRequest req) {
        repo.ensureUsersTable();
        if (repo.countAdmins() == 0) {
            repo.insertDefaultAdmin(passwordEncoder.encode(initialAdminPassword));
        }

        String ip        = getClientIp();
        String serverMac = getServerMac();

        // Find user including inactive ones (needed to track failed attempts)
        var userOpt = repo.findUserByMatriculeAll(req.matricule());

        if (userOpt.isEmpty()) {
            repo.insertLoginHistory(null, req.matricule(), ip, serverMac, "failed");
            throw new RuntimeException("Identifiants incorrects");
        }

        Map<String, Object> user = userOpt.get();
        long   uid      = toLong(user.get("ID"));
        String matricule = (String) user.get("MATRICULE");
        int    isActive = toInt(user.get("IS_ACTIVE"));
        int    failedAttempts = toInt(user.get("FAILED_ATTEMPTS"));

        // Blocked account
        if (isActive == 0) {
            repo.insertLoginHistory(uid, matricule, ip, serverMac, "failed");
            if (failedAttempts >= 5) {
                throw new RuntimeException(
                    "Compte suspendu après 5 tentatives échouées. Contactez l'administrateur.");
            }
            throw new RuntimeException("Compte désactivé. Contactez l'administrateur.");
        }

        // Wrong password
        if (!passwordEncoder.matches(req.password(), (String) user.get("PWD_HASH"))) {
            repo.incrementFailedAttempts(matricule);
            Integer newFailed = repo.getFailedAttempts(matricule);
            if (newFailed != null && newFailed >= 5) {
                repo.autoBlockUser(matricule);
                repo.insertLoginHistory(uid, matricule, ip, serverMac, "failed");
                throw new RuntimeException(
                    "Compte suspendu après 5 tentatives échouées. Contactez l'administrateur.");
            }
            repo.insertLoginHistory(uid, matricule, ip, serverMac, "failed");
            throw new RuntimeException("Identifiants incorrects");
        }

        // Time restriction check (done after successful password verification)
        checkTimeAccess(
            (String) user.get("LOGIN_TIME_PRESET"),
            (String) user.get("LOGIN_TIME_START"),
            (String) user.get("LOGIN_TIME_END")
        );

        // Success
        repo.resetFailedAttempts(uid);
        repo.updateLastLogin(uid);
        repo.insertLoginHistory(uid, matricule, ip, serverMac, "success");

        String role  = ((String) user.get("ROLE")).toLowerCase();
        String name  = (String) user.get("FULL_NAME");
        String token = jwtUtil.generate(matricule, name, role, uid);
        return new LoginResponse(token, matricule, name, role);
    }

    private void checkTimeAccess(String preset, String start, String end) {
        if (preset == null || "always".equalsIgnoreCase(preset) || preset.isBlank()) return;

        LocalTime now    = LocalTime.now();
        int current      = now.getHour() * 60 + now.getMinute();

        int startMin, endMin;
        String label;

        switch (preset.toLowerCase()) {
            case "morning"   -> { startMin = 6 * 60;  endMin = 14 * 60; label = "06:00 - 14:00"; }
            case "afternoon" -> { startMin = 14 * 60; endMin = 22 * 60; label = "14:00 - 22:00"; }
            case "night"     -> { startMin = 22 * 60; endMin = 6 * 60;  label = "22:00 - 06:00"; }
            case "custom"    -> {
                if (start == null || end == null || start.isBlank() || end.isBlank()) return;
                String[] s = start.split(":"), e = end.split(":");
                startMin = Integer.parseInt(s[0]) * 60 + Integer.parseInt(s[1]);
                endMin   = Integer.parseInt(e[0]) * 60 + Integer.parseInt(e[1]);
                label    = start + " - " + end;
            }
            default -> { return; }
        }

        boolean allowed;
        if (startMin <= endMin) {
            allowed = current >= startMin && current < endMin;
        } else {
            // Wraps midnight (e.g., 22:00-06:00)
            allowed = current >= startMin || current < endMin;
        }

        if (!allowed) {
            throw new TimeAccessException(
                "Accès non autorisé en dehors de vos horaires (" + label + ")");
        }
    }

    @Override
    public void changePassword(Long userId, String oldPwd, String newPwd) {
        if (newPwd == null || newPwd.length() < 4) {
            throw new IllegalArgumentException("Mot de passe min. 4 caractères");
        }
        Map<String, Object> row = repo.findUserById(userId)
                .orElseThrow(() -> new RuntimeException("Utilisateur non trouvé"));
        if (!passwordEncoder.matches(oldPwd, (String) row.get("PWD_HASH"))) {
            throw new IllegalArgumentException("Ancien mot de passe incorrect");
        }
        repo.updatePassword(userId, passwordEncoder.encode(newPwd));
    }

    @Override
    public LoginResponse refreshToken(String token) {
        if (!jwtUtil.isValid(token)) throw new RuntimeException("Token invalide ou expiré");
        io.jsonwebtoken.Claims c = jwtUtil.parse(token);
        String matr = (String) c.get("matricule");
        String name = (String) c.get("full_name");
        String role = (String) c.get("role");
        long   uid  = toLong(c.get("user_id"));
        return new LoginResponse(jwtUtil.generate(matr, name, role, uid), matr, name, role);
    }

    private static final String[] PROXY_HEADERS = {
        "X-Forwarded-For", "X-Real-IP", "Proxy-Client-IP",
        "WL-Proxy-Client-IP", "HTTP_X_FORWARDED_FOR", "HTTP_CLIENT_IP"
    };

    private String extractClientIp(HttpServletRequest request) {
        for (String header : PROXY_HEADERS) {
            String ip = request.getHeader(header);
            if (ip != null && !ip.isBlank() && !"unknown".equalsIgnoreCase(ip)) {
                // X-Forwarded-For may contain "ip1, ip2, ip3" — take the first (original client)
                return ip.split(",")[0].trim();
            }
        }
        String addr = request.getRemoteAddr();
        // Normalize IPv6 loopback to IPv4
        if ("0:0:0:0:0:0:0:1".equals(addr) || "::1".equals(addr)) return "127.0.0.1";
        return addr;
    }

    private String getClientIp() {
        try {
            var attrs = (ServletRequestAttributes) RequestContextHolder.currentRequestAttributes();
            return extractClientIp(attrs.getRequest());
        } catch (Exception e) {
            log.warn("Could not extract client IP: {}", e.getMessage());
            return "unknown";
        }
    }

    private String getServerMac() {
        try {
            InetAddress localHost = InetAddress.getLocalHost();
            NetworkInterface ni   = NetworkInterface.getByInetAddress(localHost);
            if (ni == null) return "N/A";
            byte[] mac = ni.getHardwareAddress();
            if (mac == null) return "N/A";
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < mac.length; i++) {
                if (i > 0) sb.append(':');
                sb.append(String.format("%02X", mac[i]));
            }
            return sb.toString();
        } catch (Exception e) {
            return "N/A";
        }
    }

    private long toLong(Object o) { return o instanceof Number n ? n.longValue() : 0L; }
    private int  toInt(Object o)  { return o instanceof Number n ? n.intValue()  : 0; }
}
