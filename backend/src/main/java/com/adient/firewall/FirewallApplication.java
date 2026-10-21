package com.adient.firewall;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;

/**
 * Hibernate/Spring-Data-JPA autoconfiguration is excluded: Oracle (the primary datasource)
 * is accessed exclusively via JdbcTemplate, and the read-only SQL Server EntityManagerFactory
 * is built manually in SQLServerDataSourceConfig. Without this exclusion, Spring Boot would
 * still auto-create a default JPA EntityManagerFactory bound to Oracle — since it's the single
 * @Primary DataSource — and scan the whole com.adient.firewall package, sweeping in the
 * SQL-Server-only entities under entity.sqlserver.
 */
@SpringBootApplication(exclude = {HibernateJpaAutoConfiguration.class, JpaRepositoriesAutoConfiguration.class})
public class
FirewallApplication {
    public static void main(String[] args) {
        SpringApplication.run(FirewallApplication.class, args);
    }
}

