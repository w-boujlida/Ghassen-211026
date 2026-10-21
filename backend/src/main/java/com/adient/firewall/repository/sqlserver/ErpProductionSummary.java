package com.adient.firewall.repository.sqlserver;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Projection for the per-projet/ligne/jour aggregated native query. */
public interface ErpProductionSummary {
    String getProjet();
    String getLigne();
    LocalDate getJour();
    BigDecimal getQuantite();
}
