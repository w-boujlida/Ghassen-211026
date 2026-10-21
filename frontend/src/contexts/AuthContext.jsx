import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import http from '../utils/api.js'

const AuthContext = createContext(null)

const LEVELS = { none: 0, read: 1, write: 2, admin: 3 }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('fw_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  // permissions: { firewall: 'write', users: 'none', ... }  loaded from /api/auth/my-permissions
  const [permissions, setPermissions] = useState(() => {
    try {
      const raw = localStorage.getItem('fw_permissions')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  const login = useCallback((userData) => {
    localStorage.setItem('fw_token', userData.token)
    localStorage.setItem('fw_user', JSON.stringify(userData))
    setUser(userData)
    // permissions are loaded by the useEffect below when token/user changes
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('fw_token')
    localStorage.removeItem('fw_user')
    localStorage.removeItem('fw_permissions')
    setUser(null)
    setPermissions(null)
  }, [])

  const token = localStorage.getItem('fw_token')

  // ── Load permissions from the API whenever the session starts ────────────
  useEffect(() => {
    if (!token || !user) { setPermissions(null); return }
    const role = (user?.role || '').toLowerCase()
    if (role === 'admin') {
      // Admin has full access — no need to query
      setPermissions(null)
      return
    }
    http.get('/auth/my-permissions')
      .then(res => {
        const perms = res.data?.data || {}
        setPermissions(perms)
        localStorage.setItem('fw_permissions', JSON.stringify(perms))
      })
      .catch(err => {
        console.error('[permissions] could not load:', err.message)
        // Keep whatever is cached in localStorage
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const roleValue = (user?.role || '').toLowerCase()

  // ── Role checks (support old + new names) ─────────────────────────────────
  const isAdmin        = roleValue === 'admin'
  const isSuperviseur  = roleValue === 'superviseur'  || roleValue === 'supervisor'
  const isOperateur    = roleValue === 'operateur'    || roleValue === 'operator'
  const isResOperateur = roleValue === 'res_operateur' || roleValue === 'operator_manager'

  /**
   * Dynamic permission check.
   * - Admin always returns true.
   * - While permissions are loading (null) falls back to broad role check so
   *   the UI doesn't flash a redirect for legitimate users.
   * - Once permissions are loaded, the matrix is authoritative.
   */
  const can = useCallback((module, minLevel = 'read') => {
    if (!user) return false
    if (isAdmin) return true
    if (permissions === null) {
      // Permissions not yet loaded — use conservative role-based fallback
      if (isSuperviseur) return true
      // During loading, allow read access to all authenticated users so sidebar
      // links and filters are visible regardless of role (custom or built-in)
      if (minLevel === 'read') return true
      if (isOperateur) return ['firewall', 'csl', 'delibera', 'delibera_forms', 'audit_forms', 'audit_produit', 'tri', 'echeances', 'overview', 'rapports'].includes(module)
      return false
    }
    const actual = permissions[module] || 'none'
    return (LEVELS[actual] ?? 0) >= (LEVELS[minLevel] ?? 0)
  }, [user, isAdmin, isSuperviseur, isOperateur, permissions])

  // ── Derived permissions (use can() so they're dynamic) ────────────────────
  const canManageUsers     = can('users',    'read')
  const canViewEmployees   = can('operators','read')
  const canAccessProjects  = can('projects', 'read')
  const canManageEmployees = isAdmin || isSuperviseur  // structural: only these roles can edit staff
  const canWrite           = isAdmin || isSuperviseur || isOperateur
  const canDelete          = isAdmin || isSuperviseur || isOperateur
  const canModifyProjects  = isAdmin
  const canCreateProjects  = can('projects', 'write')
  const isReadOnly         = isResOperateur

  return (
    <AuthContext.Provider value={{
      user, token, login, logout,
      isAdmin, isSuperviseur, isOperateur, isResOperateur,
      canWrite, canDelete, canManageUsers, canManageEmployees,
      canViewEmployees, canModifyProjects, canCreateProjects,
      canAccessProjects, isReadOnly,
      permissions, can,
      // Backward compatibility aliases
      isSupervisor: isSuperviseur,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
