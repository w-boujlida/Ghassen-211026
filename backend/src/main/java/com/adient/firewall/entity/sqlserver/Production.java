package com.adient.firewall.entity.sqlserver;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Maps the external SQL Server ERP (SAGE/Gamma) production declarations table.
 * @Immutable prevents Hibernate from ever issuing INSERT/UPDATE/DELETE for this
 * entity, enforcing the read-only access requirement at the ORM level.
 */
@Entity
@Table(name = "CDAV30_DICHIARAZIONI", schema = "dbo")
@Immutable
@Getter
@Setter
public class Production {

    @Id
    @Column(name = "CDAV30_ID")
    private Long id;

    @Column(name = "CDAV30_DATA")
    private LocalDateTime data;

    @Column(name = "CDAV30_CODART_MG66")
    private String codArt;

    @Column(name = "CDAV30_QTABUONA")
    private BigDecimal qtaBuona;

    @Column(name = "CDAV30_QTASCARTO")
    private BigDecimal qtaScarto;

    @Column(name = "CDAV30_FASE_PD12")
    private Integer fase;

    @Column(name = "CDAV30_TIPO")
    private Integer tipo;
}
