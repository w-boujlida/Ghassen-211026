import http, { unwrap } from '../utils/api.js'

export const tamponsApi = {
  getAll:                  ()        => http.get('/tampons').then(unwrap),
  importAll:               (rows)    => http.post('/tampons/import', rows).then(unwrap),
  create:                  (code, description) => http.post('/tampons', { code, description }).then(unwrap),
  update:                  (id, code, desc) => http.put(`/tampons/${id}`, { code, description: desc }).then(unwrap),
  delete:                  (id)      => http.delete(`/tampons/${id}`).then(unwrap),
  getSupervisor:           (code)    => http.get(`/tampons/${encodeURIComponent(code)}/supervisor`).then(unwrap),
  getByEmployee:           (mat)     => http.get(`/tampons/employee/${encodeURIComponent(mat)}`).then(unwrap),
  assign:                  (id, mat) => http.post(`/tampons/assign/${id}/employee/${encodeURIComponent(mat)}`).then(unwrap),
  unassign:                (id)      => http.delete(`/tampons/assign/${id}`).then(unwrap),
  getAvailable:            ()        => http.get('/tampons/available').then(unwrap),
  getAvailableForEmployee: (mat)     => http.get(`/tampons/available/${encodeURIComponent(mat)}`).then(unwrap),
}
