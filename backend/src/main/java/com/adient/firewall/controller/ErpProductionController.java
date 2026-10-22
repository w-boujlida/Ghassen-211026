package com.adient.firewall.controller;

import com.adient.firewall.dto.CoiffeDetailDTO;
import com.adient.firewall.dto.ProductionHoraireDTO;
import com.adient.firewall.dto.ProductionTempsReelDTO;
import com.adient.firewall.service.ErpProductionService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/erp")
@ConditionalOnExpression("!'${spring.datasource.sqlserver.url:}'.isBlank()")
@RequiredArgsConstructor
public class ErpProductionController {

    private final ErpProductionService erpProductionService;

    @GetMapping("/production/horaire")
    public ResponseEntity<List<ProductionHoraireDTO>> getProductionHoraire(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        LocalDate targetDate = date != null ? date : LocalDate.now();
        return ResponseEntity.ok(erpProductionService.getProductionParProjetLigneHeure(targetDate));
    }

    @GetMapping("/production/tableau")
    public ResponseEntity<ProductionTempsReelDTO> getTableauTempsReel(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(erpProductionService.getTableauTempsReel(date));
    }

    @GetMapping("/coiffes/detail")
    public ResponseEntity<List<CoiffeDetailDTO>> getCoiffesDetail(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) String projet,
            @RequestParam(required = false) String ligne,
            @RequestParam(required = false) Integer heure) {
        return ResponseEntity.ok(erpProductionService.getCoiffesDetail(date, projet, ligne, heure));
    }
}
