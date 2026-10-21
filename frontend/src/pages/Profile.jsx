import { useEffect, useState, useRef, useCallback } from 'react'
import http, { unwrap } from '../utils/api.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { notificationsApi } from '../api/notifications.api.js'

/* ── Role metadata ── */
const ROLE_META = {
  admin:            { label: 'Administrateur',  color: '#166534', bg: '#f0fdf4', border: '#bbf7d0', dot: '#15803d' },
  supervisor:       { label: 'Superviseur',      color: '#0f766e', bg: '#ccfbf1', border: '#99f6e4', dot: '#0ea5e9' },
  superviseur:      { label: 'Superviseur',      color: '#0f766e', bg: '#ccfbf1', border: '#99f6e4', dot: '#0ea5e9' },
  operator:         { label: 'Opérateur',        color: '#15803d', bg: '#dcfce7', border: '#86efac', dot: '#22c55e' },
  operateur:        { label: 'Opérateur',        color: '#15803d', bg: '#dcfce7', border: '#86efac', dot: '#22c55e' },
  operator_manager: { label: 'Resp. Opérateur',  color: '#b45309', bg: '#fef3c7', border: '#fcd34d', dot: '#f59e0b' },
  res_operateur:    { label: 'Resp. Opérateur',  color: '#b45309', bg: '#fef3c7', border: '#fcd34d', dot: '#f59e0b' },
}

const ROLE_AVATAR_BG = {
  admin:            { from: '#166534', to: '#14532d' },
  supervisor:       { from: '#0f766e', to: '#0c4a6e' },
  superviseur:      { from: '#0f766e', to: '#0c4a6e' },
  operator:         { from: '#15803d', to: '#14532d' },
  operateur:        { from: '#15803d', to: '#14532d' },
  operator_manager: { from: '#b45309', to: '#78350f' },
  res_operateur:    { from: '#b45309', to: '#78350f' },
}

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

function EyeBtn({ show, onToggle }) {
  return (
    <button type="button" onClick={onToggle} className="eye-btn">
      {show
        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
      }
    </button>
  )
}

function LockIcon() {
  return (
    <span className="lock-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    </span>
  )
}

function FieldLabel({ children, required, hint }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label className="field-label">
        {children}{required && <span className="required-star">*</span>}
      </label>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

function ErrorBox({ msg }) {
  if (!msg) return null
  return (
    <div className="error-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {msg}
    </div>
  )
}

function StrengthBar({ password }) {
  if (!password) return null
  const len = password.length
  const strength = len < 4 ? 1 : len < 6 ? 2 : len < 10 ? 3 : 4
  const colors = ['', '#E24B4A', '#EF9F27', '#EF9F27', '#639922']
  const labels = ['', 'Très faible', 'Faible', 'Moyen', 'Fort']
  return (
    <div className="strength-bar">
      <div className="strength-segments">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="strength-seg" style={{ background: i <= strength ? colors[strength] : 'var(--border)' }} />
        ))}
      </div>
      <span style={{ fontSize: 11, color: colors[strength], fontWeight: 500 }}>{labels[strength]}</span>
    </div>
  )
}

/* ── Section Header (shared pattern across all tabs) ── */
function SectionHeader({ icon, title, subtitle, iconBg, iconColor }) {
  return (
    <div className="section-header">
      <div className="section-icon" style={{ background: iconBg }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
          {icon}
        </svg>
      </div>
      <div>
        <div className="section-title">{title}</div>
        <div className="section-subtitle">{subtitle}</div>
      </div>
    </div>
  )
}

/* ── Info row for profile card ── */
function InfoRow({ icon, label, value }) {
  return (
    <div className="info-row">
      <div className="info-row-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">{icon}</svg>
      </div>
      <div className="info-row-content">
        <div className="info-row-label">{label}</div>
        <div className="info-row-value">{value || '—'}</div>
      </div>
    </div>
  )
}

const TABS = [
  {
    id: 'account',
    label: 'Mon compte',
    icon: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  },
  {
    id: 'security',
    label: 'Sécurité',
    icon: <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
  },
]

/* ── Notifications Tab ── */
function NotificationsTab({ showToast }) {
  const [notifs, setNotifs]   = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const limit = 20

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const data = await notificationsApi.list({ page: p, limit })
      const list = Array.isArray(data?.notifications) ? data.notifications : []
      setNotifs(prev => p === 1 ? list : [...prev, ...list])
      setHasMore(list.length === limit)
      setPage(p)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(1) }, [load])

  const handleRead = async (id) => {
    try {
      await notificationsApi.markRead(id)
      setNotifs(ns => ns.map(n => n.ID === id ? { ...n, READ_AT: new Date().toISOString() } : n))
    } catch {}
  }

  const handleAction = async (id, action) => {
    const comment = action === 'rejected' ? prompt('Motif du rejet :') : ''
    if (action === 'rejected' && comment === null) return
    try {
      await notificationsApi.action(id, action, comment || '')
      setNotifs(ns => ns.map(n => n.ID === id ? { ...n, ACTION: action, READ_AT: n.READ_AT || new Date().toISOString() } : n))
      showToast(action === 'validated' ? 'Validé ✓' : 'Rejeté')
    } catch { showToast('Erreur', 'error') }
  }

  const unread = notifs.filter(n => !n.READ_AT).length

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="card">
        <SectionHeader
          icon={<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}
          title={`Notifications${unread > 0 ? ` — ${unread} non lue(s)` : ''}`}
          subtitle="Historique de toutes vos notifications"
          iconBg="#fef3c7"
          iconColor="#b45309"
        />

        {/* Mark all read button */}
        {unread > 0 && (
          <div style={{ padding: '10px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '5px 12px' }}
              onClick={async () => {
                for (const n of notifs.filter(n => !n.READ_AT)) {
                  try { await notificationsApi.markRead(n.ID) } catch {}
                }
                setNotifs(ns => ns.map(n => ({ ...n, READ_AT: n.READ_AT || new Date().toISOString() })))
              }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg>
              Tout marquer comme lu
            </button>
          </div>
        )}

        {loading && page === 1 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Chargement…</div>
        )}

        {!loading && notifs.length === 0 && (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <div className="empty-state-title">Aucune notification</div>
            <div className="empty-state-sub">Vous n'avez pas encore reçu de notifications.</div>
          </div>
        )}

        <div style={{ maxHeight: 560, overflowY: 'auto' }}>
          {notifs.map(n => {
            const unread = !n.READ_AT
            const isRejected = n.TYPE === 'audit_produit_rejected'
            return (
              <div key={n.ID} style={{
                padding: '14px 24px',
                borderBottom: '1px solid #f8fafc',
                background: unread ? '#fffbeb' : '#fff',
                transition: 'background 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* Type indicator */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: isRejected ? '#fee2e2' : unread ? '#f0fdf4' : '#f8fafc',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
                  }}>
                    {isRejected ? '🔴' : '🔔'}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                        background: isRejected ? '#fee2e2' : '#f0fdf4',
                        color: isRejected ? '#dc2626' : '#0f766e',
                      }}>
                        {isRejected ? 'Rejeté' : 'Audit Produit'}
                      </span>
                      {n.PROJET && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', background: '#f3f0ff', padding: '2px 8px', borderRadius: 99 }}>
                          {n.PROJET}
                        </span>
                      )}
                      {unread && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: '#ef4444', color: '#fff', padding: '1px 6px', borderRadius: 99 }}>
                          NON LU
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{n.SENT_AT}</span>
                    </div>

                    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, wordBreak: 'break-word' }}>
                      {n.MESSAGE}
                    </div>

                    {n.COMMENT_TEXT && n.ACTION && (
                      <div style={{ marginTop: 6, fontSize: 12, color: n.ACTION === 'validated' ? '#15803d' : '#dc2626',
                        background: n.ACTION === 'validated' ? '#f0fdf4' : '#fef2f2',
                        border: `1px solid ${n.ACTION === 'validated' ? '#86efac' : '#fca5a5'}`,
                        borderRadius: 6, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11">
                          {n.ACTION === 'validated' ? <polyline points="20 6 9 17 4 12"/> : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
                        </svg>
                        {n.ACTION === 'validated' ? 'Validé' : 'Rejeté'} — {n.COMMENT_TEXT}
                      </div>
                    )}

                    {/* Actions for pending notifications */}
                    {!n.ACTION && !isRejected && n.FORM_ID && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <button onClick={() => handleAction(n.ID, 'validated')} className="btn btn-green"
                          style={{ fontSize: 11, padding: '5px 12px' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg>
                          Valider
                        </button>
                        <button onClick={() => handleAction(n.ID, 'rejected')}
                          style={{ fontSize: 11, padding: '5px 12px', borderRadius: 7, border: '1px solid #dc2626',
                            background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontFamily: 'inherit',
                            display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          Rejeter
                        </button>
                        <a href={`/audit-produit/${n.FORM_ID}`}
                          style={{ fontSize: 11, padding: '5px 12px', borderRadius: 7, border: '1px solid #0f766e',
                            background: '#f0fdf4', color: '#0f766e', textDecoration: 'none', fontWeight: 500,
                            display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          Voir le formulaire →
                        </a>
                      </div>
                    )}
                  </div>

                  {unread && (
                    <button onClick={() => handleRead(n.ID)} title="Marquer comme lu"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
                        fontSize: 18, padding: 4, flexShrink: 0, lineHeight: 1 }}>×</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {hasMore && (
          <div style={{ padding: '14px 24px', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
            <button className="btn btn-secondary" onClick={() => load(page + 1)} disabled={loading}
              style={{ fontSize: 12 }}>
              {loading ? 'Chargement…' : 'Charger plus'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Profile() {
  const { user } = useAuth()

  const [profile, setProfile]   = useState(null)
  const [pLoading, setPLoading] = useState(true)
  const [pForm, setPForm]       = useState({ fullName: '', email: '', phone: '' })
  const [pSaving, setPSaving]   = useState(false)
  const [pError, setPError]     = useState('')
  const [pDirty, setPDirty]     = useState(false)

  const [pwForm, setPwForm]     = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError]   = useState('')
  const [showCur, setShowCur]   = useState(false)
  const [showNew, setShowNew]   = useState(false)
  const [showCfm, setShowCfm]   = useState(false)

  const [activeTab, setActiveTab] = useState('account')
  const [toast, setToast]         = useState(null)
  const toastTimer                = useRef(null)

  const showToast = (msg, type = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    http.get('/profile').then(unwrap)
      .then(data => {
        setProfile(data)
        setPForm({ fullName: data.fullName || '', email: data.email || '', phone: data.phone || '' })
      })
      .catch(e => setPError(e.message))
      .finally(() => setPLoading(false))
  }, [])

  const handleSaveProfile = async () => {
    if (!pForm.fullName.trim()) { setPError('Le nom complet est requis'); return }
    if (!pForm.email.trim())    { setPError("L'email est requis"); return }
    setPSaving(true); setPError('')
    try {
      await http.put('/profile', pForm).then(unwrap)
      setProfile(p => ({ ...p, ...pForm }))
      setPDirty(false)
      showToast('Profil mis à jour avec succès')
    } catch (e) {
      setPError(e.response?.data?.error || e.response?.data?.message || e.message)
    } finally { setPSaving(false) }
  }

  const handleChangePassword = async () => {
    if (!pwForm.currentPassword)                       { setPwError('Le mot de passe actuel est requis'); return }
    if (pwForm.newPassword.length < 6)                 { setPwError('Minimum 6 caractères'); return }
    if (pwForm.newPassword === pwForm.currentPassword) { setPwError("Doit être différent de l'actuel"); return }
    if (pwForm.newPassword !== pwForm.confirm)         { setPwError('La confirmation ne correspond pas'); return }
    setPwSaving(true); setPwError('')
    try {
      await http.put('/profile/password', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }).then(unwrap)
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' })
      showToast('Mot de passe modifié avec succès')
    } catch (e) {
      setPwError(e.response?.data?.error || e.response?.data?.message || e.message)
    } finally { setPwSaving(false) }
  }

  const role    = (profile?.role || user?.role || '').toLowerCase()
  const meta    = ROLE_META[role] || { label: role.toUpperCase(), color: '#475569', bg: '#f1f5f9', border: '#e2e8f0', dot: '#94a3b8' }
  const avatarG = ROLE_AVATAR_BG[role] || { from: '#475569', to: '#334155' }
  const name    = profile?.fullName || user?.fullName || '?'
  const confirmMismatch = pwForm.confirm.length > 0 && pwForm.confirm !== pwForm.newPassword

  const handlePFormChange = (field, val) => { setPForm(f => ({ ...f, [field]: val })); setPDirty(true); setPError('') }

  if (pLoading) return <div className="loading"><div className="spinner" /></div>

  return (
    <>
      <style>{`
        :root {
          --blue:   #166534;
          --blue-l: #f0fdf4;
          --green:  #15803d;
          --border: #e8edf2;
          --border-s: #f1f5f9;
          --text:   #1e293b;
          --muted:  #64748b;
          --faint:  #94a3b8;
          --bg:     #f8fafc;
          --card:   #ffffff;
          --radius: 10px;
          --radius-sm: 7px;
        }

        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes toast-in { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fade-in { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }

        /* ── Tab bar ── */
        .prof-tabbar {
          display: flex;
          gap: 2px;
          padding: 0 28px;
          border-bottom: 1px solid var(--border);
          background: var(--card);
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .prof-tab {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 14px 16px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          color: var(--faint);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
          font-family: inherit;
          white-space: nowrap;
        }
        .prof-tab:hover { color: var(--muted); }
        .prof-tab.active { color: var(--blue); border-bottom-color: var(--blue); font-weight: 600; }
        .prof-tab svg { opacity: 0.7; transition: opacity 0.15s; }
        .prof-tab.active svg, .prof-tab:hover svg { opacity: 1; }

        /* ── Content wrapper ── */
        .prof-content {
          padding: 28px;
          background: var(--bg);
          min-height: calc(100% - 49px);
          box-sizing: border-box;
          animation: fade-in 0.18s ease-out;
        }

        /* ── Card ── */
        .card {
          background: var(--card);
          border-radius: var(--radius);
          border: 1px solid var(--border);
          overflow: hidden;
        }
        .card-body { padding: 22px 24px; }
        .card-footer {
          padding: 14px 24px;
          border-top: 1px solid var(--border-s);
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 8px;
          background: #fafbfc;
        }

        /* ── Section header (shared pattern) ── */
        .section-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 18px 24px;
          border-bottom: 1px solid var(--border-s);
        }
        .section-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .section-title { font-size: 13px; font-weight: 600; color: var(--text); }
        .section-subtitle { font-size: 11.5px; color: var(--faint); margin-top: 1px; }

        /* ── Avatar ── */
        .avatar {
          width: 68px; height: 68px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 21px; font-weight: 600; color: #fff;
          flex-shrink: 0;
          position: relative;
        }
        .avatar-online {
          position: absolute;
          bottom: 2px; right: 2px;
          width: 11px; height: 11px;
          border-radius: 50%;
          background: #639922;
          border: 2px solid var(--card);
        }

        /* ── Role badge ── */
        .role-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 500;
          padding: 4px 10px;
          border-radius: 99px;
          border: 1px solid;
          white-space: nowrap;
        }
        .role-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        /* ── Info row (profile card) ── */
        .info-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid var(--border-s);
        }
        .info-row:last-child { border-bottom: none; }
        .info-row-icon {
          width: 28px; height: 28px;
          border-radius: 6px;
          background: var(--bg);
          border: 1px solid var(--border);
          display: flex; align-items: center; justify-content: center;
          color: var(--muted);
          flex-shrink: 0;
        }
        .info-row-label { font-size: 10.5px; color: var(--faint); font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
        .info-row-value { font-size: 12.5px; color: var(--text); font-weight: 500; margin-top: 1px; }

        /* ── Field ── */
        .field-label { font-size: 12px; font-weight: 500; color: var(--muted); display: block; }
        .field-hint  { font-size: 11px; color: var(--faint); margin-left: 6px; }
        .required-star { color: #e74c3c; margin-left: 3px; }

        .field-input {
          width: 100%;
          box-sizing: border-box;
          padding: 9px 13px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          font-size: 13px;
          color: var(--text);
          background: #fff;
          font-family: inherit;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .field-input:focus {
          border-color: var(--blue);
          box-shadow: 0 0 0 3px rgba(24,95,165,0.09);
        }
        .field-input:disabled {
          background: var(--bg);
          color: var(--faint);
          cursor: not-allowed;
          padding-right: 36px;
        }
        .field-input.error {
          border-color: #fca5a5;
          background: #fff5f5;
        }
        .field-input-wrap { position: relative; }

        /* ── Eye / Lock icons ── */
        .eye-btn {
          position: absolute; right: 11px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: var(--faint);
          display: flex; align-items: center;
          padding: 2px;
          transition: color 0.15s;
        }
        .eye-btn:hover { color: var(--muted); }
        .lock-icon {
          position: absolute; right: 11px; top: 50%;
          transform: translateY(-50%);
          display: flex; align-items: center;
          pointer-events: none;
          color: #cbd5e1;
        }

        /* ── Error box ── */
        .error-box {
          display: flex; align-items: center; gap: 8px;
          font-size: 12px; color: #b91c1c;
          padding: 9px 13px;
          background: #fff5f5;
          border: 1px solid #fca5a5;
          border-radius: var(--radius-sm);
        }

        /* ── Strength bar ── */
        .strength-bar { margin-top: 8px; }
        .strength-segments { display: flex; gap: 3px; margin-bottom: 4px; }
        .strength-seg { height: 3px; flex: 1; border-radius: 99px; transition: background 0.2s; }

        /* ── Buttons ── */
        .btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px;
          border-radius: var(--radius-sm);
          font-size: 12.5px; font-weight: 500;
          cursor: pointer;
          border: none;
          font-family: inherit;
          transition: opacity 0.15s, background 0.15s;
          white-space: nowrap;
        }
        .btn:disabled { cursor: not-allowed; opacity: 0.55; }
        .btn-primary { background: var(--blue); color: #fff; }
        .btn-primary:hover:not(:disabled) { opacity: 0.88; }
        .btn-secondary {
          background: #fff; color: var(--muted);
          border: 1px solid var(--border);
        }
        .btn-secondary:hover:not(:disabled) { background: var(--bg); }
        .btn-green { background: var(--green); color: #fff; }
        .btn-green:hover:not(:disabled) { opacity: 0.88; }
        .btn-muted { background: var(--bg); color: var(--faint); cursor: default; }

        /* ── Spinner ── */
        .spin {
          width: 12px; height: 12px;
          border: 2px solid rgba(255,255,255,.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin .6s linear infinite;
          display: inline-block;
        }

        /* ── Hint / help texts ── */
        .field-note { font-size: 11px; color: var(--faint); margin-top: 5px; }
        .field-note.ok  { color: #3B6D11; display: flex; align-items: center; gap: 4px; }
        .field-note.err { color: #b91c1c; display: flex; align-items: center; gap: 4px; }

        /* ── Empty state ── */
        .empty-state {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 56px 32px; text-align: center; gap: 8px;
          color: var(--faint);
        }
        .empty-state svg { margin-bottom: 4px; }
        .empty-state-title { font-size: 13.5px; font-weight: 500; color: var(--muted); }
        .empty-state-sub   { font-size: 12px; }

        /* ── Toast ── */
        .toast {
          position: fixed; bottom: 24px; right: 24px; z-index: 99999;
          padding: 10px 16px; border-radius: 9px;
          font-size: 13px; font-weight: 500;
          animation: toast-in 0.2s ease-out;
          display: flex; align-items: center; gap: 8px;
          color: #fff;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        /* ── Grid layouts ── */
        .account-grid {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 20px;
          align-items: stretch;
          max-width: 100px%;
          width: 100%;
        }
        .form-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .col-span-2 { grid-column: 1 / -1; }
        .form-stack { display: flex; flex-direction: column; gap: 16px; }
      `}</style>

      {/* ══ TAB BAR ══ */}
      <div className="prof-tabbar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`prof-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">{tab.icon}</svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ CONTENT ══ */}
      <div className="prof-content" key={activeTab}>

        {/* ══ TAB — Mon Compte ══ */}
        {activeTab === 'account' && (
          <div className="account-grid">

            {/* ── Carte identité ── */}
            <div className="card">
              <div className="card-body">
                {/* Avatar + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                  <div
                    className="avatar"
                    style={{ background: `linear-gradient(135deg, ${avatarG.from}, ${avatarG.to})` }}
                  >
                    {initials(name)}
                    <div className="avatar-online" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{name}</div>
                    <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 3 }}>
                      {profile?.matricule ? `#${profile.matricule}` : ''}
                    </div>
                    <span
                      className="role-badge"
                      style={{ background: meta.bg, color: meta.color, borderColor: meta.border, marginTop: 6 }}
                    >
                      <span className="role-dot" style={{ background: meta.dot }} />
                      {meta.label}
                    </span>
                  </div>
                </div>

                {/* Info rows */}
                <InfoRow
                  icon={<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
                  label="Matricule"
                  value={profile?.matricule}
                />
                <InfoRow
                  icon={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>}
                  label="Rôle"
                  value={meta.label}
                />
                <InfoRow
                  icon={<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>}
                  label="Email"
                  value={profile?.email}
                />
              </div>
              <div style={{ padding: '10px 24px 14px', background: '#fafbfc', borderTop: '1px solid var(--border-s)' }}>
                <div style={{ fontSize: 11, color: 'var(--faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="11" height="11"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Le rôle est géré par l'administrateur
                </div>
              </div>
            </div>

            {/* ── Informations personnelles ── */}
            <div className="card">
              <SectionHeader
                icon={<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>}
                title="Informations personnelles"
                subtitle="Modifiez vos coordonnées"
                iconBg="#f0fdf4"
                iconColor="#166534"
              />
              <div className="card-body">
                <div className="form-grid-2">
                  <div>
                    <FieldLabel required>Nom complet</FieldLabel>
                    <input
                      className="field-input"
                      type="text"
                      placeholder="Prénom Nom"
                      value={pForm.fullName}
                      onChange={e => handlePFormChange('fullName', e.target.value)}
                    />
                  </div>
                  <div>
                    <FieldLabel>Téléphone</FieldLabel>
                    <input
                      className="field-input"
                      type="tel"
                      placeholder="+212 6XX XXXXXX"
                      value={pForm.phone}
                      onChange={e => handlePFormChange('phone', e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel required>Adresse email</FieldLabel>
                    <input
                      className="field-input"
                      type="email"
                      placeholder="email@exemple.com"
                      value={pForm.email}
                      onChange={e => handlePFormChange('email', e.target.value)}
                    />
                  </div>
                </div>

                {pError && <div style={{ marginTop: 14 }}><ErrorBox msg={pError} /></div>}
              </div>

              <div className="card-footer">
                {pDirty && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setPForm({ fullName: profile?.fullName || '', email: profile?.email || '', phone: profile?.phone || '' })
                      setPDirty(false)
                      setPError('')
                    }}
                  >
                    Annuler
                  </button>
                )}
                <button
                  className={`btn ${pDirty ? 'btn-primary' : 'btn-muted'}`}
                  onClick={handleSaveProfile}
                  disabled={pSaving || !pDirty}
                >
                  {pSaving
                    ? <><span className="spin" /> Enregistrement…</>
                    : <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
                        Enregistrer les modifications
                      </>
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB — Sécurité ══ */}
        {activeTab === 'security' && (
          <div style={{ maxWidth: 1000 }}>
            <div className="card">
              <SectionHeader
                icon={<><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>}
                title="Changer le mot de passe"
                subtitle="Modifiez votre mot de passe régulièrement"
                iconBg="#dcfce7"
                iconColor="#15803d"
              />

              <div className="card-body">
                <div className="form-stack">
                  {/* Mot de passe actuel */}
                  <div>
                    <FieldLabel required>Mot de passe actuel</FieldLabel>
                    <div className="field-input-wrap">
                      <input
                        className="field-input"
                        style={{ paddingRight: 36 }}
                        type={showCur ? 'text' : 'password'}
                        placeholder="••••••••••"
                        value={pwForm.currentPassword}
                        onChange={e => { setPwForm(f => ({ ...f, currentPassword: e.target.value })); setPwError('') }}
                      />
                      <EyeBtn show={showCur} onToggle={() => setShowCur(v => !v)} />
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-s)', margin: '0' }} />

                  {/* Nouveau mot de passe */}
                  <div>
                    <FieldLabel required>Nouveau mot de passe</FieldLabel>
                    <div className="field-input-wrap">
                      <input
                        className="field-input"
                        style={{ paddingRight: 36 }}
                        type={showNew ? 'text' : 'password'}
                        placeholder="Minimum 6 caractères"
                        value={pwForm.newPassword}
                        onChange={e => { setPwForm(f => ({ ...f, newPassword: e.target.value })); setPwError('') }}
                      />
                      <EyeBtn show={showNew} onToggle={() => setShowNew(v => !v)} />
                    </div>
                    <StrengthBar password={pwForm.newPassword} />
                    {!pwForm.newPassword && (
                      <div className="field-note">Mélangez lettres, chiffres et symboles</div>
                    )}
                  </div>

                  {/* Confirmer */}
                  <div>
                    <FieldLabel required>Confirmer le nouveau mot de passe</FieldLabel>
                    <div className="field-input-wrap">
                      <input
                        className={`field-input${confirmMismatch ? ' error' : ''}`}
                        style={{ paddingRight: 36 }}
                        type={showCfm ? 'text' : 'password'}
                        placeholder="Répétez le mot de passe"
                        value={pwForm.confirm}
                        onChange={e => { setPwForm(f => ({ ...f, confirm: e.target.value })); setPwError('') }}
                      />
                      <EyeBtn show={showCfm} onToggle={() => setShowCfm(v => !v)} />
                    </div>
                    {confirmMismatch && (
                      <div className="field-note err">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Les mots de passe ne correspondent pas
                      </div>
                    )}
                    {!confirmMismatch && pwForm.confirm && pwForm.confirm === pwForm.newPassword && (
                      <div className="field-note ok">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg>
                        Les mots de passe correspondent
                      </div>
                    )}
                  </div>
                </div>

                {pwError && <div style={{ marginTop: 14 }}><ErrorBox msg={pwError} /></div>}
              </div>

              <div className="card-footer">
                <button
                  className="btn btn-green"
                  onClick={handleChangePassword}
                  disabled={pwSaving}
                >
                  {pwSaving
                    ? <><span className="spin" /> Modification…</>
                    : <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        Changer le mot de passe
                      </>
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB — Notifications ══ */}
        {activeTab === 'notifications' && <NotificationsTab showToast={showToast} />}

      </div>

      {/* ── Toast ── */}
      {toast && (
        <div
          className="toast"
          style={{ background: toast.type === 'error' ? '#dc2626' : '#15803d' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
            {toast.type === 'error'
              ? <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
              : <polyline points="20 6 9 17 4 12"/>
            }
          </svg>
          {toast.msg}
        </div>
      )}
    </>
  )
}