import http, { unwrap } from '../utils/api.js'

export const operatorsApi = {
  bulk: (kind, request) => http.post(`/operators/${kind}/bulk`, request).then(unwrap),
}
