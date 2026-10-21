import http, { unwrap } from '../utils/api.js'

export const echeancesApi = {
  getAllProjects:    ()                          => http.get('/echeances/projets').then(unwrap),
  getProject:       (proj, module)              => http.get(`/echeances/projets/${proj}${module ? `?module=${module}` : ''}`).then(unwrap),
  getRetard:        (proj, module)              => http.get(`/echeances/projets/${proj}/retard${module ? `?module=${module}` : ''}`).then(unwrap),
  getProches:       (proj, heures = 48, module) => http.get(`/echeances/projets/${proj}/proches?heures=${heures}${module ? `&module=${module}` : ''}`).then(unwrap),
  updateStatut:     (barcode, reprise, module, projet) =>
    http.patch(`/echeances/${encodeURIComponent(barcode)}/statut`, { reprise, module, projet }).then(unwrap),
}
