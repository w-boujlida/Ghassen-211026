import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'

export const triApi = {
  getFiches:  (projet, status, page, limit) =>
    http.get('/tri/fiches' + buildQuery({ projet, status, page, limit })).then(unwrap),
  getFicheById: (id) =>
    http.get(`/tri/fiches/${id}`).then(unwrap),
  createFiche: (input) =>
    http.post('/tri/fiches', input).then(unwrap),
  updateFiche: (id, input) =>
    http.put(`/tri/fiches/${id}`, input).then(unwrap),
  deleteFiche: (id) =>
    http.delete(`/tri/fiches/${id}`).then(unwrap),
  getProjects: () =>
    http.get('/tri/projects').then(unwrap),
  getStats: (projet) =>
    http.get('/tri/stats' + buildQuery({ projet })).then(unwrap),
  exportExcel: (projet, status) =>
    http.get('/tri/export' + buildQuery({ projet, status }), { responseType: 'blob' }),
  importExcel: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return http.post('/tri/import', fd).then(unwrap)
  },
}
