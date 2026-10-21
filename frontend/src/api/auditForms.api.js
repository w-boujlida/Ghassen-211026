import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'

// types: 'routine' | 'revuposte' | 'palliatives'

export const auditFormsApi = {
  list:   (type, params) => http.get(`/audit-forms/${type}` + buildQuery(params)).then(unwrap),
  getOne: (type, id)     => http.get(`/audit-forms/${type}/${id}`).then(unwrap),
  create: (type, body)   => http.post(`/audit-forms/${type}`, body).then(unwrap),
  update: (type, id, body) => http.put(`/audit-forms/${type}/${id}`, body).then(unwrap),
  remove: (type, id)     => http.delete(`/audit-forms/${type}/${id}`).then(unwrap),
  // TODO: backend endpoint POST /api/audit-forms/{type}/{id}/verify
  // Stores: VERIF_STATUS ('OK'|'NOT_OK'), VERIF_COMMENT, VERIFIED_BY, VERIFIED_AT
  verify: (type, id, body) => http.post(`/audit-forms/${type}/${id}/verify`, body).then(unwrap),
}
