package com.adient.firewall.service.interfaces;

import com.adient.firewall.dto.LoginRequest;
import com.adient.firewall.dto.LoginResponse;

public interface IAuthService {

    LoginResponse login(LoginRequest req);

    void changePassword(Long userId, String oldPwd, String newPwd);

    /** Re-issue a fresh JWT (new 24h window) from a still-valid token. */
    LoginResponse refreshToken(String token);
}
