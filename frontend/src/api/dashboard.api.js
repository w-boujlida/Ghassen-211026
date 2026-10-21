import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'

export const dashboardApi = {
  get:      ()       => http.get('/dashboard').then(unwrap),
  filtered: (params) => http.get('/dashboard/filtered' + buildQuery(params)).then(unwrap),
}
