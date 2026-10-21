import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'

export const notificationsApi = {
  list:         (params)         => http.get('/notifications' + buildQuery(params)).then(unwrap),
  unreadCount:  ()               => http.get('/notifications/unread-count').then(unwrap),
  markRead:     (id)             => http.post(`/notifications/${id}/read`).then(unwrap),
  action:       (id, action, comment) => http.post(`/notifications/${id}/action`, { action, comment }).then(unwrap),
}
