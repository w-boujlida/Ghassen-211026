package com.adient.firewall.dto;

/** Un code défaut individuel dans le détail d'une couturière (avec l'heure du scan). */
public record DefautDetailItemDto(
        Long    defautId,
        Long    recordId,
        String  codeDefaut,
        String  descDefaut,
        boolean verifie,
        String  heure // "yyyy-MM-dd HH:mm:ss", heure de scan (CREATED_AT du record parent)
) {}
