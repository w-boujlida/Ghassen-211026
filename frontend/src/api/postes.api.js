import http, { unwrap } from '../utils/api.js'

export const postesApi = {
  getAll:      ()                  => http.get('/postes').then(unwrap),
  create:      (nom, code)         => http.post('/postes', { nom, code }).then(unwrap),
  update:      (id, nom, code)     => http.put(`/postes/${id}`, { nom, code }).then(unwrap),
  delete:      (id)                => http.delete(`/postes/${id}`).then(unwrap),
  bulkCreate:  (noms)              => http.post('/postes/bulk', { noms }).then(unwrap),
}
