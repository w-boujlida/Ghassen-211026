import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'

// Convert full table name "FIREWALL_CR3" → project name "CR3"
const toProjet = (src) => String(src || '').replace(/^FIREWALL_/i, '')

export const firewallApi = {
  getSources:    ()                              => http.get('/firewall/sources').then(unwrap),
  getAll:        ({ source, page, limit, ...filters }) =>
    http.get('/firewall/records' + buildQuery({ projet: toProjet(source), page, limit, ...filters })).then(unwrap),
  getStats:      (source, period, dateFrom, dateTo) => {
    let url = `/firewall/stats?projet=${toProjet(source)}`
    if (period)   url += `&period=${period}`
    if (dateFrom) url += `&dateFrom=${dateFrom}`
    if (dateTo)   url += `&dateTo=${dateTo}`
    return http.get(url).then(unwrap)
  },
  getReport:     (source, filters)               => http.get('/firewall/report' + buildQuery({ projet: toProjet(source), ...filters })).then(unwrap),
  create:        (records)                       => http.post('/firewall/records', records).then(unwrap),
  importRecords: (source, rows)                  => http.post(`/firewall/import?projet=${toProjet(source)}`, rows, { timeout: 300000 }).then(unwrap),
  update:        (record)                        => {
    const projet = toProjet(record.source || '')
    const id     = record.id || 0
    return http.put(`/firewall/records/${id}?projet=${projet}`, record).then(unwrap)
  },
  delete:        (barCode, codDef, source)       =>
    http.delete('/firewall/records' + buildQuery({ barCode, codDef, projet: toProjet(source) })).then(unwrap),
  bulkReprise:   (source, barcodes, reprise)     =>
    http.patch('/firewall/records/bulk-reprise' + buildQuery({ projet: toProjet(source) }), { barcodes, reprise }).then(unwrap),
}
