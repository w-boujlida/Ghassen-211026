package com.adient.firewall.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;
import java.util.Properties;

/**
 * Read-only JPA setup for the external SQL Server ERP (SAGE) database.
 * Kept fully separate from Oracle: no @Primary bean here, entities/repositories
 * live under entity.sqlserver / repository.sqlserver only.
 * Disabled entirely when spring.datasource.sqlserver.url is blank (local dev without ERP).
 */
@Configuration
@ConditionalOnExpression("!'${spring.datasource.sqlserver.url:}'.isBlank()")
@EnableConfigurationProperties(SQLServerDataSourceProperties.class)
@EnableJpaRepositories(
        basePackages = "com.adient.firewall.repository.sqlserver",
        entityManagerFactoryRef = "sqlServerEntityManagerFactory",
        transactionManagerRef = "sqlServerTransactionManager"
)
public class SQLServerDataSourceConfig {

    @Bean(name = "sqlServerDataSource")
    public DataSource sqlServerDataSource(SQLServerDataSourceProperties props) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(props.getUrl());
        config.setUsername(props.getUsername());
        config.setPassword(props.getPassword());
        config.setDriverClassName(props.getDriverClassName());
        config.setReadOnly(true);
        config.setMaximumPoolSize(5);
        config.setMinimumIdle(1);
        config.setConnectionTimeout(30000);
        config.setIdleTimeout(600000);
        config.setPoolName("sqlServerHikariPool");
        return new HikariDataSource(config);
    }

    @Bean(name = "sqlServerEntityManagerFactory")
    public LocalContainerEntityManagerFactoryBean sqlServerEntityManagerFactory(
            @Qualifier("sqlServerDataSource") DataSource sqlServerDataSource) {

        Properties jpaProperties = new Properties();
        jpaProperties.put("hibernate.dialect", "org.hibernate.dialect.SQLServerDialect");
        jpaProperties.put("hibernate.hbm2ddl.auto", "none");
        jpaProperties.put("hibernate.show_sql", "false");

        LocalContainerEntityManagerFactoryBean emf = new LocalContainerEntityManagerFactoryBean();
        emf.setDataSource(sqlServerDataSource);
        emf.setPackagesToScan("com.adient.firewall.entity.sqlserver");
        emf.setPersistenceUnitName("sqlserver");
        emf.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        emf.setJpaProperties(jpaProperties);
        return emf;
    }

    @Bean(name = "sqlServerTransactionManager")
    public PlatformTransactionManager sqlServerTransactionManager(
            @Qualifier("sqlServerEntityManagerFactory") EntityManagerFactory sqlServerEntityManagerFactory) {
        return new JpaTransactionManager(sqlServerEntityManagerFactory);
    }
}
