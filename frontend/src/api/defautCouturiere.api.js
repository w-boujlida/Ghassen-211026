import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'

export const defautCouturiereApi = {
  // params: { projet (obligatoire), ligne, shift, date }
  getTableau: (params) => http.get('/defauts-couturiere/tableau' + buildQuery(params)).then(unwrap),

  // params: { matricule (obligatoire), projet (obligatoire), ligne, shift, date }
  getDetail: (params) => http.get('/defauts-couturiere/detail' + buildQuery(params)).then(unwrap),

  // params: { projet, ligne, date }
  getAlertes: (params) => http.get('/defauts-couturiere/alertes' + buildQuery(params)).then(unwrap),

  // params: { projet (obligatoire), ligne, dateDebut (obligatoire), dateFin (obligatoire) }
  getRapport: (params) => http.get('/defauts-couturiere/rapport' + buildQuery(params)).then(unwrap),

  exportExcel: (params) => http.get('/defauts-couturiere/rapport/export.xlsx' + buildQuery(params), { responseType: 'blob' }),
  exportPdf:   (params) => http.get('/defauts-couturiere/rapport/export.pdf'  + buildQuery(params), { responseType: 'blob' }),
}
