import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'

// types: 'demarrage' | 'pokayoke' | 'ok1ere'

export const deliberaFormsApi = {
  list:   (type, params) => http.get(`/delibera-forms/${type}` + buildQuery(params)).then(unwrap),
  getOne: (type, id)     => http.get(`/delibera-forms/${type}/${id}`).then(unwrap),
  create: (type, body)   => http.post(`/delibera-forms/${type}`, body).then(unwrap),
  update: (type, id, body) => http.put(`/delibera-forms/${type}/${id}`, body).then(unwrap),
  remove: (type, id)     => http.delete(`/delibera-forms/${type}/${id}`).then(unwrap),
  // TODO: backend endpoint POST /api/delibera-forms/{type}/{id}/verify
  // Stores: VERIF_STATUS ('OK'|'NOT_OK'), VERIF_COMMENT, VERIFIED_BY, VERIFIED_AT
  verify: (type, id, body) => http.post(`/delibera-forms/${type}/${id}/verify`, body).then(unwrap),
}
