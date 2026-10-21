import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'

export const employeesApi = {
  getAll:     (params) => http.get('/employees' + buildQuery(params)).then(unwrap),
  getSelection: (filters) => http.get('/employees/selection' + buildQuery(filters)).then(unwrap),
  exportAll:  (filters) => http.get('/employees' + buildQuery({ ...filters, page: 1, limit: 9999 })).then(unwrap),
  importAll:  (rows) => http.post('/employees/import', rows).then(unwrap),
  create:     (emp)    => http.post('/employees', emp).then(unwrap),
  update:     (emp)    => http.put('/employees', emp).then(unwrap),
  delete:     (mat)    => http.delete(`/employees?mat=${encodeURIComponent(mat)}`).then(unwrap),
}
