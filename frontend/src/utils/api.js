import axios from 'axios'

const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

/** Decode JWT payload without verification (browser-safe). */
function jwtExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp ? payload.exp * 1000 : null // ms
  } catch { return null }
}

// Fire-and-forget background token refresh (avoids multiple parallel calls)
let _refreshing = false
function maybeRefresh(token) {
  if (_refreshing) return
  const exp = jwtExpiry(token)
  if (!exp) return
  const remainingMs = exp - Date.now()
  // Refresh when less than 60 min remain but token is still valid
  if (remainingMs > 0 && remainingMs < 60 * 60 * 1000) {
    _refreshing = true
    http.post('/auth/refresh', null, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const newToken = res.data?.data?.token
        if (newToken) {
          localStorage.setItem('fw_token', newToken)
          try {
            const u = JSON.parse(localStorage.getItem('fw_user') || '{}')
            localStorage.setItem('fw_user', JSON.stringify({ ...u, token: newToken }))
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => { _refreshing = false })
  }
}

// Attach JWT on every request + trigger auto-refresh if token nears expiry
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('fw_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
    if (config.url !== '/auth/refresh') maybeRefresh(token)
  }
  return config
})

// On 401 → redirect to login; on 403 → re-throw with readable message
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status
    if (status === 401) {
      localStorage.removeItem('fw_token')
      localStorage.removeItem('fw_user')
      localStorage.removeItem('fw_permissions')
      window.location.href = '/login'
    }
    if (status === 403) {
      // Surface the backend error message so callers can display it
      const msg = err.response?.data?.error
        || err.response?.data?.message
        || 'Accès refusé — permissions insuffisantes'
      return Promise.reject(new Error(msg))
    }
    return Promise.reject(err)
  }
)

export default http

/** Unwrap the standard ApiResponse envelope { success, data, message, error }. */
export function unwrap(res) {
  const body = res.data
  if (!body.success) throw new Error(body.error || body.message || 'Unknown error')
  return body.data
}
