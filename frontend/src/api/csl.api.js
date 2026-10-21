import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'

// Convert full table name "CSL_CR3" → project name "CR3"
const toProjet = (src) => String(src || '').replace(/^CSL_/i, '')

export const cslApi = {
  getSources:    ()                              => http.get('/csl/sources').then(unwrap),
  getAll:        ({ source, page, limit, ...filters }) =>
    http.get('/csl/records' + buildQuery({ projet: toProjet(source), page, limit, ...filters })).then(unwrap),
  getStats:      (source, period, dateFrom, dateTo) => {
    let url = `/csl/stats?projet=${toProjet(source)}`
    if (period)   url += `&period=${period}`
    if (dateFrom) url += `&dateFrom=${dateFrom}`
    if (dateTo)   url += `&dateTo=${dateTo}`
    return http.get(url).then(unwrap)
  },
  getReport:     (source, filters)               => http.get('/csl/report' + buildQuery({ projet: toProjet(source), ...filters })).then(unwrap),
  create:        (records)                       => http.post('/csl/records', records).then(unwrap),
  importRecords: (source, rows)                  => http.post(`/csl/import?projet=${toProjet(source)}`, rows, { timeout: 300000 }).then(unwrap),
  update:        (record)                        => {
    const projet = toProjet(record.source || '')
    const id     = record.id || 0
    return http.put(`/csl/records/${id}?projet=${projet}`, record).then(unwrap)
  },
  delete:        (barCode, codDef, source)       =>
    http.delete('/csl/records' + buildQuery({ barCode, codDef, projet: toProjet(source) })).then(unwrap),
  bulkReprise:   (source, barcodes, reprise)     =>
    http.patch('/csl/records/bulk-reprise' + buildQuery({ projet: toProjet(source) }), { barcodes, reprise }).then(unwrap),
}
