import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'

export const suiviQualiteShiftApi = {
  // params: { projet (obligatoire), shift (1 ou 2, défaut 1), date, ligne }
  getShift: (params) => http.get('/suivi-qualite/shift' + buildQuery(params)).then(unwrap),
}
