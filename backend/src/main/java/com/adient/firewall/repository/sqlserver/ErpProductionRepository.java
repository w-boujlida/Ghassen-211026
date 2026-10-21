package com.adient.firewall.repository.sqlserver;

import com.adient.firewall.entity.sqlserver.Production;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ErpProductionRepository extends JpaRepository<Production, Long> {

    @Query(value = """
            SELECT
                LEFT(a.[Codice Famiglia], 3)    AS projet,
                LEFT(a.[Codice Sottogruppo], 2) AS ligne,
                CAST(p.CDAV30_DATA AS DATE)     AS jour,
                SUM(p.CDAV30_QTABUONA)          AS quantite
            FROM dbo.CDAV30_DICHIARAZIONI p
            INNER JOIN dbo.QLK_VISTAARTICOLI a ON p.CDAV30_CODART_MG66 = a._KEYARTVARIANTE
            WHERE p.CDAV30_FASE_PD12 = 99
              AND p.CDAV30_TIPO = 4
              AND CAST(p.CDAV30_DATA AS DATE) = :date
            GROUP BY LEFT(a.[Codice Famiglia], 3), LEFT(a.[Codice Sottogruppo], 2), CAST(p.CDAV30_DATA AS DATE)
            """, nativeQuery = true)
    List<ErpProductionSummary> findProductionByDate(@Param("date") LocalDate date);

    @Query(value = """
            SELECT
                LEFT(Q.[Codice Famiglia], 3)    AS projet,
                LEFT(Q.[Codice Sottogruppo], 2) AS ligne,
                DATEPART(HOUR, P.CDAV30_DATA)   AS heure,
                SUM(P.CDAV30_QTABUONA)          AS quantite,
                CAST(P.CDAV30_DATA AS DATE)     AS date
            FROM CDAV30_DICHIARAZIONI P
            INNER JOIN QLK_VISTAARTICOLI Q ON P.CDAV30_CODART_MG66 = Q._KEYARTVARIANTE
            WHERE P.CDAV30_DATA >= CAST(:date AS DATETIME)
              AND P.CDAV30_DATA < CAST(:date AS DATETIME) + 1
              AND P.CDAV30_FASE_PD12 = 99
              AND P.CDAV30_TIPO = 4
            GROUP BY
                LEFT(Q.[Codice Famiglia], 3),
                LEFT(Q.[Codice Sottogruppo], 2),
                DATEPART(HOUR, P.CDAV30_DATA),
                CAST(P.CDAV30_DATA AS DATE)
            ORDER BY projet, ligne, heure
            """, nativeQuery = true)
    List<Object[]> getProductionParProjetLigneHeure(@Param("date") String date);

    @Query(value = """
            SELECT
                P.CDAV30_ID                           AS id,
                P.CDAV30_CODART_MG66                  AS reference,
                LEFT(Q.[Codice Famiglia], 3)          AS projet,
                LEFT(Q.[Codice Sottogruppo], 2)       AS ligne,
                DATEPART(HOUR, P.CDAV30_DATA)         AS heure,
                CONVERT(VARCHAR, P.CDAV30_DATA, 120)  AS horodatage,
                P.CDAV30_QTABUONA                     AS quantite,
                CASE WHEN P.CDAV30_QTASCARTO = -1
                     THEN 1 ELSE 0 END                AS estRetouche,
                CAST(P.CDAV30_DATA AS DATE)           AS date
            FROM CDAV30_DICHIARAZIONI P
            INNER JOIN QLK_VISTAARTICOLI Q ON P.CDAV30_CODART_MG66 = Q._KEYARTVARIANTE
            WHERE P.CDAV30_DATA >= CAST(:date AS DATETIME)
              AND P.CDAV30_DATA <  CAST(:date AS DATETIME) + 1
              AND P.CDAV30_FASE_PD12 = 99
              AND P.CDAV30_TIPO = 4
              AND (:projet IS NULL OR LEFT(Q.[Codice Famiglia], 3)    = :projet)
              AND (:ligne  IS NULL OR LEFT(Q.[Codice Sottogruppo], 2) = :ligne)
              AND (:heure  IS NULL OR DATEPART(HOUR, P.CDAV30_DATA)   = :heure)
            ORDER BY P.CDAV30_DATA ASC
            """, nativeQuery = true)
    List<Object[]> getCoiffesDetail(@Param("date") String date,
                                     @Param("projet") String projet,
                                     @Param("ligne") String ligne,
                                     @Param("heure") Integer heure);
}
