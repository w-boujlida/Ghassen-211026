import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'

export const suiviQualiteStatsApi = {
  // params: { dateDebut, dateFin, granularite }
  getStatsGlobal: (params) => http.get('/suivi-qualite/stats/global' + buildQuery(params)).then(unwrap),

  // params: { projet, ligne, dateDebut, dateFin, granularite, shift }
  getStatsProjet: (params) => http.get('/suivi-qualite/stats/projet' + buildQuery(params)).then(unwrap),

  // params: { projet, dateDebut, dateFin, shift }
  getRapport: (params) => http.get('/suivi-qualite/rapport' + buildQuery(params)).then(unwrap),

  exportExcel: (params) => http.get('/suivi-qualite/rapport/export.xlsx' + buildQuery(params), { responseType: 'blob' }),
  exportPdf:   (params) => http.get('/suivi-qualite/rapport/export.pdf'  + buildQuery(params), { responseType: 'blob' }),
}
