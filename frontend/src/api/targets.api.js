import http, { unwrap } from '../utils/api.js'

export const targetsApi = {
  list:   ()        => http.get('/targets').then(unwrap),
  getOne: (id)       => http.get(`/targets/${id}`).then(unwrap),
  create: (payload)  => http.post('/targets', payload).then(unwrap), // { projet, shift, cells }
  update: (id, payload) => http.put(`/targets/${id}`, payload).then(unwrap), // { cells }
  remove: (id)       => http.delete(`/targets/${id}`).then(unwrap),
}
