package com.adient.firewall.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;

/**
 * Spring Boot's implicit DataSourceAutoConfiguration only fires when no DataSource bean
 * already exists in the context. Once SQLServerDataSourceConfig registers "sqlServerDataSource",
 * that auto-configuration backs off entirely, so Oracle must be defined explicitly here to keep
 * working and to be marked @Primary. Property values are bound from the same spring.datasource.*
 * keys as before, so behavior is unchanged.
 */
@Configuration
public class OracleDataSourceConfig {

    @Bean
    @Primary
    public PlatformTransactionManager oracleTransactionManager(
            @Qualifier("oracleDataSource") DataSource dataSource) {
        return new JdbcTransactionManager(dataSource);
    }

    @Bean
    @Primary
    @ConfigurationProperties(prefix = "spring.datasource")
    public DataSourceProperties oracleDataSourceProperties() {
        return new DataSourceProperties();
    }

    @Bean
    @Primary
    @ConfigurationProperties(prefix = "spring.datasource.hikari")
    public DataSource oracleDataSource(DataSourceProperties oracleDataSourceProperties) {
        return oracleDataSourceProperties
                .initializeDataSourceBuilder()
                .type(HikariDataSource.class)
                .build();
    }
}
