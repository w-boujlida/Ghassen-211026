import { useMemo, useState, useEffect, useCallback } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useLang } from '../contexts/LangContext.jsx'
import { LANGUAGES } from '../i18n/translations.js'
import { notificationsApi } from '../api/notifications.api.js'

function getCurrentShift(t) {
  const h = new Date().getHours()
  if (h >= 6  && h < 14) return { label: t('shift_morning'),   time: t('shift_time_morning')   }
  if (h >= 14 && h < 22) return { label: t('shift_afternoon'), time: t('shift_time_afternoon') }
  return                         { label: t('shift_night'),     time: t('shift_time_night')     }
}

const ROLE_COLORS = {
  admin:            '#15803d',
  superviseur:      '#0f766e',
  supervisor:       '#0f766e',
  operateur:        '#16a34a',
  operator:         '#16a34a',
  res_operateur:    '#d97706',
  operator_manager: '#d97706',
}

// Sélecteur de langue — dropdown compact
function LangSelector({ t, lang, setLang }) {
  const [open, setOpen] = useState(false)
  const current = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0]

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, padding: '7px 10px', cursor: 'pointer', color: '#cbd5e1',
          fontSize: 12, fontWeight: 600, transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.11)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        <span style={{ flex: 1 }}>{current.flag} {current.label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <>
          {/* Overlay pour fermer */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 999,
            background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
          }}>
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => { setLang(l.code); setOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                  padding: '9px 12px', background: lang === l.code ? 'rgba(255,255,255,0.1)' : 'transparent',
                  border: 'none', cursor: 'pointer', color: lang === l.code ? '#fff' : '#94a3b8',
                  fontSize: 12, fontWeight: lang === l.code ? 700 : 500,
                  borderLeft: lang === l.code ? '3px solid #15803d' : '3px solid transparent',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (lang !== l.code) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { if (lang !== l.code) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 16 }}>{l.flag}</span>
                <span>{l.label}</span>
                {lang === l.code && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12, marginLeft: 'auto' }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function NotifBell() {
  const [count, setCount]       = useState(0)
  const [open, setOpen]         = useState(false)
  const [notifs, setNotifs]     = useState([])
  const [loading, setLoading]   = useState(false)

  const fetchCount = useCallback(async () => {
    try { const n = await notificationsApi.unreadCount(); setCount(typeof n === 'number' ? n : 0) }
    catch {}
  }, [])

  useEffect(() => {
    fetchCount()
    const timer = setInterval(fetchCount, 60000)
    return () => clearInterval(timer)
  }, [fetchCount])

  const openPanel = async () => {
    setOpen(o => !o)
    if (!open) {
      setLoading(true)
      try {
        const data = await notificationsApi.list({ limit: 20 })
        setNotifs(Array.isArray(data?.notifications) ? data.notifications : [])
        fetchCount()
      } catch {}
      finally { setLoading(false) }
    }
  }

  const handleRead = async (id) => {
    try {
      await notificationsApi.markRead(id)
      setNotifs(ns => ns.map(n => n.ID === id ? { ...n, READ_AT: new Date().toISOString() } : n))
      fetchCount()
    } catch {}
  }

  const handleAction = async (id, action, comment = '') => {
    try {
      await notificationsApi.action(id, action, comment)
      setNotifs(ns => ns.map(n => n.ID === id ? { ...n, ACTION: action, READ_AT: n.READ_AT || new Date().toISOString() } : n))
      fetchCount()
    } catch {}
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={openPanel} style={{
        position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
        padding: '6px 8px', borderRadius: 8, color: '#475569',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {count > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: '#ef4444', color: '#fff', borderRadius: '50%',
            width: 16, height: 16, fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}>{count > 9 ? '9+' : count}</span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position:'fixed',inset:0,zIndex:1000 }} />
          <div style={{
            position: 'fixed', bottom: 80, left: 220, zIndex: 1001,
            width: 420, maxHeight: 520, overflowY: 'auto',
            background: '#fff', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
            border: '1px solid #e2e8f0',
          }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontWeight: 700, fontSize: 14, color: '#1e293b', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <span>Notifications {count > 0 && <span style={{ color:'#ef4444', fontSize:12, fontWeight:600 }}>({count} non lue{count>1?'s':''})</span>}</span>
              <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:18, lineHeight:1, padding:2 }}>×</button>
            </div>
            {loading && <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Chargement…</div>}
            {!loading && notifs.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🔔</div>
                Aucune notification
              </div>
            )}
            {!loading && notifs.map(n => {
              const unread = !n.READ_AT
              const isRejected = n.TYPE === 'audit_produit_rejected'
              return (
                <div key={n.ID} style={{
                  padding: '13px 18px', borderBottom: '1px solid #f8fafc',
                  background: unread ? '#fffbeb' : '#fff',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{isRejected ? '🔴' : '🔔'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isRejected ? '#dc2626' : '#0f766e' }}>
                          {isRejected ? 'Rejeté' : 'Audit Produit'}
                        </span>
                        {n.PROJET && <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>{n.PROJET}</span>}
                        {unread && <span style={{ fontSize: 9, background: '#ef4444', color: '#fff', borderRadius: 99, padding: '1px 5px', fontWeight: 700 }}>NOUVEAU</span>}
                        <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 'auto' }}>{n.SENT_AT}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, wordBreak: 'break-word', whiteSpace: 'pre-line' }}>
                        {n.MESSAGE}
                      </div>
                      {n.ACTION && (
                        <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600,
                          color: n.ACTION === 'validated' ? '#15803d' : '#dc2626' }}>
                          {n.ACTION === 'validated' ? '✓ Validé' : '✗ Rejeté'}
                          {n.COMMENT_TEXT ? ` — ${n.COMMENT_TEXT}` : ''}
                        </div>
                      )}
                      {!n.ACTION && !isRejected && n.FORM_ID && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => handleAction(n.ID, 'validated')} style={{
                            padding: '4px 10px', borderRadius: 6, border: '1px solid #16a34a',
                            background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                          }}>✓ Valider</button>
                          <button onClick={() => {
                            const c = prompt('Motif du rejet :')
                            if (c !== null) handleAction(n.ID, 'rejected', c)
                          }} style={{
                            padding: '4px 10px', borderRadius: 6, border: '1px solid #dc2626',
                            background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                          }}>✗ Rejeter</button>
                          <NavLink to={`/audit-produit/${n.FORM_ID}`} onClick={() => setOpen(false)} style={{
                            padding: '4px 10px', borderRadius: 6, border: '1px solid #0f766e',
                            background: '#f0fdf4', color: '#0f766e', fontSize: 11, fontWeight: 600, textDecoration: 'none'
                          }}>Voir →</NavLink>
                        </div>
                      )}
                    </div>
                    {unread && (
                      <button onClick={() => handleRead(n.ID)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, padding: 2, flexShrink: 0 }}
                        title="Marquer comme lu">×</button>
                    )}
                  </div>
                </div>
              )
            })}
            <div style={{ padding: '10px 18px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
              <NavLink to="/profile" onClick={() => setOpen(false)}
                style={{ fontSize: 12, color: '#0f766e', fontWeight: 600, textDecoration: 'none' }}>
                Voir toutes les notifications →
              </NavLink>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Groupe de navigation déroulant réutilisable (menu parent + sous-items), même look que .nav-item.
// Le parent s'ouvre automatiquement dès qu'une de ses sous-pages devient active, et reste
// surligné tant qu'on y est — mais l'utilisateur peut le refermer manuellement sans perdre la page.
function NavGroup({ label, icon, childRoutes, children }) {
  const location = useLocation()
  const isChildActive = childRoutes.includes(location.pathname)
  const [open, setOpen] = useState(isChildActive)

  useEffect(() => { if (isChildActive) setOpen(true) }, [isChildActive])

  return (
    <div className="nav-group-collapsible">
      <button
        type="button"
        className={'nav-item nav-item-parent' + (isChildActive ? ' active' : '')}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {icon}
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className="nav-item-chevron" style={{ width: 12, height: 12, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && <div className="nav-subgroup">{children}</div>}
    </div>
  )
}

export default function Layout({ children }) {
  const { user, logout, can } = useAuth()
  const { t, lang, setLang } = useLang()
  const navigate   = useNavigate()
  const shift      = useMemo(() => getCurrentShift(t), [lang, t])
  const handleLogout = () => { logout(); navigate('/login') }
  const avatar     = (user?.fullName || user?.matricule || '?')[0].toUpperCase()
  const role       = (user?.role || '').toLowerCase()
  const roleColor  = ROLE_COLORS[role] || '#475569'

  // Libellé du rôle traduit
  const roleLabel = (() => {
    if (role === 'admin')                                  return t('role_admin')
    if (role === 'supervisor' || role === 'superviseur')   return t('role_supervisor')
    if (role === 'operator'   || role === 'operateur')     return t('role_operator')
    if (role === 'operator_manager' || role === 'res_operateur') return t('role_operator_manager')
    return role.toUpperCase()
  })()

  const navItem = (to, label, icon, module, showReadBadge = false) => {
    if (!can(module, 'read')) return null
    return (
      <NavLink key={to} to={to} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
        {icon}
        {label}
        {showReadBadge && !can(module, 'write') && (
          <span className="nav-item-badge">{t('read_only')}</span>
        )}
      </NavLink>
    )
  }

  const hasGestion = can('operators','read') || can('projects','read') || can('users','read') || can('target','read')

  // Sous-modules "Qualité" regroupés sous un menu parent déroulant — routes inchangées.
  const QUALITE_ROUTES = ['/suivi-qualite', '/suivi-qualite/stats', '/suivi-qualite/shift', '/defauts-couturiere']
  const qualiteChildren = [
    navItem('/suivi-qualite', t('suivi_qualite'), (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
    ), 'suivi_qualite'),
    navItem('/suivi-qualite/stats', 'Statistiques Qualité', (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
    ), 'suivi_qualite'),
    navItem('/suivi-qualite/shift', 'Suivi Qualité par Shift', (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
    ), 'suivi_qualite'),
    navItem('/defauts-couturiere', 'Défauts Couturière', (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/><path d="m9 12 1.5 1.5L15 9"/></svg>
    ), 'defauts_couturiere'),
  ].filter(Boolean)

  return (
    <div className="app-shell">
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img className="sidebar-logo-image" src="/sage-logo.png" alt="SAGE Automotive Interiors" />
          </div>
        </div>

        <div className="sidebar-user-card">
          <div className="sidebar-user-avatar">{avatar}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.fullName || user?.matricule || 'Utilisateur'}</div>
            <div className="sidebar-user-meta">
              <span className="sidebar-user-matricule">{user?.matricule || ''}</span>
              <span className="sidebar-role-badge" style={{ background: roleColor + '22', color: roleColor, border: `1px solid ${roleColor}44` }}>
                {roleLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="sidebar-shift">
          <span className="sidebar-shift-dot"></span>
          <span className="sidebar-shift-label">{shift.label}</span>
          <span className="sidebar-shift-time">{shift.time}</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group">
            <span className="nav-group-title">{t('nav_principal')}</span>

            {navItem('/delibera', t('delibera'), (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
            ), 'delibera', true)}

            {navItem('/firewall', t('firewall'), (
              <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            ), 'firewall', true)}

            {navItem('/csl', t('csl'), (
              <svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
            ), 'csl', true)}

            {navItem('/home', t('overview'), (
              <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            ), 'overview')}

            {navItem('/delibera-forms', t('delibera_forms'), (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            ), 'delibera_forms', true)}

            {qualiteChildren.length > 0 && (
              <NavGroup label="Qualité" childRoutes={QUALITE_ROUTES} icon={(
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
              )}>
                {qualiteChildren}
              </NavGroup>
            )}

            {navItem('/audit-forms', t('audit_forms'), (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
            ), 'audit_forms', true)}

            {navItem('/audit-produit', 'Audit Produit', (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><polyline points="9 11 11 13 15 9"/></svg>
            ), 'audit_produit', true)}

            {navItem('/tri', t('tri'), (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/>
              </svg>
            ), 'tri', true)}

            {/* Rapports BI intégré dans Dashboard Firewall/CSL via l'onglet dédié */}

            {navItem('/echeances', t('echeances'), (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            ), 'echeances')}
          </div>

          {hasGestion && (
            <div className="nav-group">
              <span className="nav-group-title">{t('nav_gestion')}</span>

              {navItem('/employees', t('employees'), (
                <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              ), 'operators', true)}

              {navItem('/projects', t('projects'), (
                <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              ), 'projects')}

              {navItem('/users', t('users'), (
                <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              ), 'users')}

              {navItem('/targets', t('target'), (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
              ), 'target')}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          {/* Sélecteur de langue */}
          <div style={{ padding: '0 10px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <LangSelector t={t} lang={lang} setLang={setLang} />
            <NotifBell />
          </div>

          <NavLink to="/profile" className={({ isActive }) => 'sidebar-footer-item' + (isActive ? ' active' : '')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            {t('my_profile')}
          </NavLink>
          <button className="sidebar-footer-item logout-item" onClick={handleLogout}>
            <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            {t('logout')}
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="main-content-watermark">{children}</div>
      </div>
    </div>
  )
}
