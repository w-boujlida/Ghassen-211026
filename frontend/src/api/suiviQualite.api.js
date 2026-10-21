import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'

export const suiviQualiteApi = {
  // params: { projet (obligatoire), ligne, shift, date }
  getDashboard: (params) => http.get('/suivi-qualite/dashboard' + buildQuery(params)).then(unwrap),
}
