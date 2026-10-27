import http, { unwrap } from '../utils/api.js'

export const usersApi = {
  list:             ()             => http.get('/admin/users').then(unwrap),
  create:           (user)         => http.post('/admin/users', user).then(unwrap),
  update:           (id, user)     => http.put(`/admin/users/${id}`, user).then(unwrap),
  delete:           (id)           => http.delete(`/admin/users/${id}`).then(unwrap),
  resetPassword:    (id)           => http.post(`/admin/users/${id}/reset-password`).then(unwrap),
  unlock:           (id)           => http.put(`/admin/users/${id}/unlock`).then(unwrap),
  lock:             (id)           => http.put(`/admin/users/${id}/lock`).then(unwrap),
  updateTimeAccess: (id, data)     => http.put(`/admin/users/${id}/time-access`, data).then(unwrap),
  loginHistory:     (id, params)   => http.get(`/admin/users/${id}/login-history`, { params }).then(unwrap),
  allLoginHistory:  (params)       => http.get('/admin/login-history', { params }).then(unwrap),
  activityHistory:  (id, params)   => http.get(id ? `/admin/users/${id}/activity-history` : '/admin/activity-history', { params }).then(unwrap),
  selectLoginHistory: (id, params) => http.get(id ? `/admin/users/${id}/login-history/selection` : '/admin/login-history/selection', { params }).then(unwrap),
  getPermissions:   ()             => http.get('/admin/permissions').then(unwrap),
  savePermissions:  (data)         => http.put('/admin/permissions', data).then(unwrap),
  saveConfiguration: (data)        => http.put('/admin/permissions/configuration', data).then(unwrap),
  getCustomRoles:   ()             => http.get('/admin/roles/custom').then(unwrap),
  saveCustomRoles:  (customRoles)  => http.post('/admin/roles/custom', { roles: customRoles }).then(unwrap),
}