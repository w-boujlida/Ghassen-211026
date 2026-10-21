import http, { unwrap } from '../utils/api.js'

export const authApi = {
  login:          (matricule, password)        => http.post('/auth/login', { matricule, password }).then(unwrap),
  changePassword: (old_password, new_password) => http.post('/auth/change-password', { old_password, new_password }).then(unwrap),
}