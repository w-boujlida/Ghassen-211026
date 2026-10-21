package com.adient.firewall.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "spring.datasource.sqlserver")
public class SQLServerDataSourceProperties {

    private String url;
    private String username;
    private String password;
    private String driverClassName;
}
