import http from './api.js'

export function reportClientExport(module) {
  // Report only a fixed module/format, never workbook contents or filenames.
  return http.post('/activity/client-export', { module, format: 'xlsx' }).catch(() => {
    console.error('[business-audit] Échec de l’enregistrement de la déclaration d’export')
    window.alert("Le fichier a été généré, mais la déclaration d’export n’a pas pu être enregistrée dans l’historique. Prévenez l’administrateur.")
  })
}
