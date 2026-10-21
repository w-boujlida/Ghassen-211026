import http, { unwrap } from '../utils/api.js'

export const productionApi = {
  createQte:   (body)                                          => http.post('/production/qte', body).then(unwrap),
  getQte:      (projet, module, dateFrom, dateTo)             => {
    const p = new URLSearchParams()
    if (projet)   p.set('projet',   projet)
    if (module)   p.set('module',   module)
    if (dateFrom) p.set('dateFrom', dateFrom)
    if (dateTo)   p.set('dateTo',   dateTo)
    return http.get(`/production/qte?${p}`).then(unwrap)
  },
  updateQte:   (id, qteGlobale)                               => http.put(`/production/qte/${id}`, { qteGlobale }).then(unwrap),
  deleteQte:   (id)                                           => http.delete(`/production/qte/${id}`).then(unwrap),
  getAnalyse:  (projet, module, period, dateFrom, dateTo)     => {
    const p = new URLSearchParams({ projet, module, period: period || 'today' })
    if (dateFrom) p.set('dateFrom', dateFrom)
    if (dateTo)   p.set('dateTo',   dateTo)
    return http.get(`/production/analyse?${p}`).then(unwrap)
  },
}
