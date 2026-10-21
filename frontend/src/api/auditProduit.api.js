import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'

export const auditProduitApi = {
  list:    (params)      => http.get('/audit-produit' + buildQuery(params)).then(unwrap),
  getOne:  (id)          => http.get(`/audit-produit/${id}`).then(unwrap),
  create:  (body)        => http.post('/audit-produit', body).then(unwrap),
  update:  (id, body)    => http.put(`/audit-produit/${id}`, body).then(unwrap),
  remove:  (id)          => http.delete(`/audit-produit/${id}`).then(unwrap),
  verify:  (id, body)    => http.post(`/audit-produit/${id}/verify`, body).then(unwrap),
  projets: ()            => http.get('/audit-produit/projets').then(unwrap),
}
