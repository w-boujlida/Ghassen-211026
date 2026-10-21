import http from '../utils/api.js'

export const erpApi = {
  getHourlyQualityProduction: (date) =>
    http.get('/erp/production/tableau', { params: date ? { date } : {} }).then(res => res.data),
}
