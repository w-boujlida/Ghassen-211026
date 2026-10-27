import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'
import { checkedBarcodeLookup } from '../utils/barcode.js'

export const deliberaApi = {
  // ── KPIs ──────────────────────────────────────────────────────────────────
  kpis: (projet) =>
    http.get('/delibera/kpis' + (projet ? `?projet=${encodeURIComponent(projet)}` : '')).then(unwrap),
  getDashboardOverview: (params) =>
    http.get('/delibera/dashboard/overview' + buildQuery(params)).then(unwrap),
  getHourlyDashboard: (date) =>
    http.get('/delibera/dashboard/hourly' + buildQuery({ date })).then(unwrap),
  saveHourlyTarget: (target) =>
    http.put('/delibera/dashboard/hourly/target', target).then(unwrap),

  // ── Couturières ────────────────────────────────────────────────────────────
  getCouturieres: (params) =>
    http.get('/delibera/couturieres' + buildQuery(params)).then(unwrap),
  createCouturiere: (dto) =>
    http.post('/delibera/couturieres', dto).then(unwrap),
  updateCouturiere: (id, dto) =>
    http.put(`/delibera/couturieres/${id}`, dto).then(unwrap),
  deleteCouturiere: (id) =>
    http.delete(`/delibera/couturieres/${id}`).then(unwrap),
  importCouturieres: (rows) =>
    http.post('/delibera/couturieres/import', { rows }).then(unwrap),

  // ── Barcode ────────────────────────────────────────────────────────────────
  resolveScanSettings: (project, version, code) =>
    checkedBarcodeLookup(code, () => http.get('/delibera/scan-settings', { params: { project, version, code } }).then(unwrap)),
  lookupBarcode: (code, project) =>
    checkedBarcodeLookup(code, value => http.get('/delibera/barcode', { params: { code: value, project } }).then(unwrap)),
  validateScan: (project, codes, version) =>
    checkedBarcodeLookup(codes[0], () => http.post('/delibera/scan-validate', { project, codes, version }).then(unwrap), codes),
  validateUniqueScanCode: (project, code, primaryBarcode, position, scanCodes) =>
    checkedBarcodeLookup(code, () => http.post('/delibera/scan-code-unique', {
      project, code, primaryBarcode, position,
    }).then(unwrap), scanCodes),

  // ── Records ────────────────────────────────────────────────────────────────
  getRecords: (params) =>
    http.get('/delibera/records' + buildQuery(params)).then(unwrap),
  createRecord: (body) =>
    checkedBarcodeLookup(body.barcode, () => http.post('/delibera/records', body).then(unwrap), body.scanCodes),
  // Import CSV : pas de popup bloquante, les erreurs sont collectées ligne par ligne
  createRecordSilent: (body) =>
    http.post('/delibera/records', body).then(unwrap),
  getRecord: (id) =>
    http.get(`/delibera/records/${id}`).then(unwrap),
  setRecordCheckpoints: (id, checkpointResults) =>
    http.put(`/delibera/records/${id}/checkpoints`, { checkpointResults }).then(unwrap),
  verifyRecord: (id, body) =>
    http.put(`/delibera/records/${id}/verify`, body).then(unwrap),
  returnToOk: (id, body) =>
    http.put(`/delibera/records/${id}/return-to-ok`, body).then(unwrap),

  // ── Record update / delete / status ───────────────────────────────────────
  updateRecord: (id, body) =>
    http.put(`/delibera/records/${id}`, body).then(unwrap),
  deleteRecord: (id) =>
    http.delete(`/delibera/records/${id}`).then(unwrap),
  patchStatus: (id, statut) =>
    http.patch(`/delibera/records/${id}/status`, { statut }).then(unwrap),

  // ── Postes ─────────────────────────────────────────────────────────────────
  getPostes: (projet) =>
    http.get('/delibera/postes' + (projet ? `?projet=${encodeURIComponent(projet)}` : '')).then(unwrap),

  // ── User list (for filter dropdown) ───────────────────────────────────────
  getUsers: (projet) =>
    http.get('/delibera/records/users' + (projet ? `?projet=${encodeURIComponent(projet)}` : '')).then(unwrap),

  // ── Dashboard ─────────────────────────────────────────────────────────────
  getStats: (filters) => http.post('/delibera/dashboard/stats', filters).then(unwrap),
  getScans:  (filters) => http.post('/delibera/dashboard/scans',  filters).then(unwrap),
}
