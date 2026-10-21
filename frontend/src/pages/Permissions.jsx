import { useEffect, useState, useRef } from 'react'
import { usersApi } from '../api/users.api.js'
import { ModalBtn } from '../components/Modal.jsx'
import { getAllModules } from '../config/modules.registry.js'

const BUILT_IN_ROLES = [
  { key: 'admin',            label: 'Administrateur',  color: '#5b21b6', bg: '#ede9fe', builtin: true },
  { key: 'supervisor',       label: 'Superviseur',     color: '#14532d', bg: '#dcfce7', builtin: true },
  { key: 'operator',         label: 'Opérateur',       color: '#15803d', bg: '#dcfce7', builtin: true },
  { key: 'operator_manager', label: 'Resp. Opérateur', color: '#b45309', bg: '#fef3c7', builtin: true },
]

const COLOR_PALETTE = [
  { color: '#5b21b6', bg: '#ede9fe', border: '#c4b5fd', label: 'Violet' },
  { color: '#14532d', bg: '#dcfce7', border: '#86efac', label: 'Bleu' },
  { color: '#15803d', bg: '#dcfce7', border: '#86efac', label: 'Vert' },
  { color: '#b45309', bg: '#fef3c7', border: '#fcd34d', label: 'Ambre' },
  { color: '#be185d', bg: '#fce7f3', border: '#f9a8d4', label: 'Rose' },
  { color: '#0e7490', bg: '#cffafe', border: '#67e8f9', label: 'Cyan' },
  { color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5', label: 'Rouge' },
  { color: '#374151', bg: '#f1f5f9', border: '#cbd5e1', label: 'Gris' },
]

const PERM_LEVELS = ['none', 'read', 'write', 'admin']
const PERM_LABELS = { none: 'Aucun', read: 'Lecture', write: 'Écriture', admin: 'Admin' }
const PERM_COLORS = {
  none:  { bg: '#f1f5f9', color: '#94a3b8', border: '#e2e8f0' },
  read:  { bg: '#dcfce7', color: '#14532d', border: '#86efac' },
  write: { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  admin: { bg: '#ede9fe', color: '#5b21b6', border: '#c4b5fd' },
}

const _MODS = getAllModules()

const DEFAULT_PERMS = {
  admin:            Object.fromEntries(_MODS.map(m => [m.key, 'admin'])),
  supervisor:       Object.fromEntries(_MODS.map(m => [m.key, m.key === 'users' ? 'read' : 'write'])),
  operator:         Object.fromEntries(_MODS.map(m => [m.key,
    (m.key === 'firewall' || m.key === 'csl' || m.key === 'delibera') ? 'write'
    : (m.key === 'rapports' || m.key === 'projects' || m.key === 'overview') ? 'read'
    : 'none'])),
  operator_manager: Object.fromEntries(_MODS.map(m => [m.key,
    (m.key === 'users' || m.key === 'operators') ? 'none' : 'read'])),
}

const EMPTY_ROLE_PERMS = Object.fromEntries(_MODS.map(m => [m.key, 'none']))

/* ── New Role Modal ─────────────────────────────────────────── */
function NewRoleModal({ onClose, onConfirm, existingRoles }) {
  const [name,      setName]      = useState('')
  const [colorIdx,  setColorIdx]  = useState(0)
  const [basedOn,   setBasedOn]   = useState('')
  const [error,     setError]     = useState('')

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('Le nom du rôle est requis.'); return }
    if (trimmed.length < 2) { setError('Le nom doit contenir au moins 2 caractères.'); return }
    const key = trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    const allKeys = [...BUILT_IN_ROLES.map(r => r.key), ...existingRoles.map(r => r.key)]
    if (allKeys.includes(key)) { setError('Un rôle avec ce nom existe déjà.'); return }

    const palette = COLOR_PALETTE[colorIdx]
    onConfirm({
      key,
      label: trimmed,
      color: palette.color,
      bg: palette.bg,
      border: palette.border,
      builtin: false,
      basedOn: basedOn || null,
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,14,30,0.62)',
      zIndex: 9998, backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, maxWidth: 440, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
          padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Nouveau rôle personnalisé</span>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Nom */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Nom du rôle *
            </label>
            <input
              autoFocus
              type="text"
              placeholder="ex : Auditeur, Responsable qualité…"
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={{
                padding: '9px 12px', borderRadius: 8, fontSize: 13,
                border: `1.5px solid ${error ? '#fca5a5' : '#e2e8f0'}`,
                outline: 'none', color: '#0f172a', background: '#f8fafc',
              }}
            />
            {error && (
              <span style={{ fontSize: 12, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </span>
            )}
          </div>

          {/* Couleur */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Couleur du badge
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {COLOR_PALETTE.map((p, i) => (
                <button
                  key={i}
                  title={p.label}
                  onClick={() => setColorIdx(i)}
                  style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: p.color, border: 'none', cursor: 'pointer',
                    outline: colorIdx === i ? `3px solid ${p.color}` : 'none',
                    outlineOffset: 2,
                    transition: 'transform 0.1s',
                    transform: colorIdx === i ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
              {/* Preview */}
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '3px 11px', borderRadius: 99,
                background: COLOR_PALETTE[colorIdx].bg,
                color: COLOR_PALETTE[colorIdx].color,
                border: `1px solid ${COLOR_PALETTE[colorIdx].border}`,
                marginLeft: 6,
              }}>
                {name.trim() || 'Aperçu'}
              </span>
            </div>
          </div>

          {/* Basé sur */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Copier les permissions depuis
            </label>
            <select
              value={basedOn}
              onChange={e => setBasedOn(e.target.value)}
              style={{
                padding: '9px 12px', borderRadius: 8, fontSize: 13,
                border: '1.5px solid #e2e8f0', outline: 'none',
                color: '#0f172a', background: '#f8fafc', cursor: 'pointer',
              }}
            >
              <option value="">Aucun (tout à Aucun)</option>
              {BUILT_IN_ROLES.map(r => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
              {existingRoles.map(r => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              Les permissions peuvent être modifiées dans la matrice après création.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px', borderTop: '1px solid #e8ecf4',
          display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#fafbfc',
        }}>
          <ModalBtn variant="secondary" onClick={onClose}>Annuler</ModalBtn>
          <ModalBtn variant="primary" onClick={handleCreate}>Créer le rôle</ModalBtn>
        </div>
      </div>
    </div>
  )
}

/* ── Delete Role Confirm ─────────────────────────────────────── */
function DeleteRoleConfirm({ role, onClose, onConfirm }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,14,30,0.62)',
      zIndex: 9999, backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, maxWidth: 400, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #c92a2a 0%, #a61e1e 100%)',
          padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Supprimer le rôle</span>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: 14, color: '#475569', margin: 0, lineHeight: 1.6 }}>
            Vous allez supprimer le rôle{' '}
            <span style={{
              fontWeight: 700, padding: '2px 9px', borderRadius: 99,
              background: role.bg, color: role.color,
            }}>
              {role.label}
            </span>
            {' '}et toutes ses permissions.{' '}
            <strong style={{ color: '#b91c1c' }}>Les utilisateurs ayant ce rôle devront être réassignés.</strong>
          </p>
        </div>
        <div style={{
          padding: '12px 24px', borderTop: '1px solid #e8ecf4',
          display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#fafbfc',
        }}>
          <ModalBtn variant="secondary" onClick={onClose}>Annuler</ModalBtn>
          <ModalBtn variant="danger" onClick={onConfirm}>Supprimer définitivement</ModalBtn>
        </div>
      </div>
    </div>
  )
}

/* ── Main Component ──────────────────────────────────────────── */
export default function Permissions({ embedded = false }) {
  const [perms,        setPerms]        = useState(null)
  const [modules,      setModules]      = useState(getAllModules)
  const [roles,        setRoles]        = useState([...BUILT_IN_ROLES])  // built-in + custom
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [changed,      setChanged]      = useState(false)
  const [toast,        setToast]        = useState(null)
  const [confirm,      setConfirm]      = useState(false)
  const [showNewRole,  setShowNewRole]  = useState(false)
  const [deleteRole,   setDeleteRole]   = useState(null)  // role obj to delete
  const toastTimer = useRef(null)

  const showToast = (msg, type = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }

  // Sync registry → state: patch perms when a new module is added to the registry
  useEffect(() => {
    const currentModules = getAllModules()
    setModules(currentModules)
    setPerms(prev => {
      if (!prev) return prev
      const updated = { ...prev }
      for (const role of roles) {
        for (const mod of currentModules) {
          if (!updated[role.key]?.[mod.key]) {
            updated[role.key] = {
              ...updated[role.key],
              [mod.key]: role.key === 'admin' ? 'admin' : 'none',
            }
          }
        }
      }
      return updated
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const currentModules = getAllModules()
    Promise.all([
      usersApi.getPermissions().catch(() => null),
      usersApi.getCustomRoles?.().catch(() => []),
    ]).then(([permData, customRoles]) => {
      // Merge custom roles
      const allRoles = [
        ...BUILT_IN_ROLES,
        ...(Array.isArray(customRoles) ? customRoles : []),
      ]
      setRoles(allRoles)

      // Merge permissions — include every module from the registry
      const merged = {}
      for (const r of allRoles) {
        merged[r.key] = {}
        for (const m of currentModules) {
          merged[r.key][m.key] = permData?.[r.key]?.[m.key] ?? DEFAULT_PERMS[r.key]?.[m.key] ?? 'none'
        }
      }
      setPerms(merged)
    }).finally(() => setLoading(false))
  }, [])

  const toggle = (roleKey, moduleKey) => {
    if (roleKey === 'admin') return
    setPerms(prev => {
      const cur  = prev[roleKey][moduleKey]
      const idx  = PERM_LEVELS.indexOf(cur)
      const next = PERM_LEVELS[(idx + 1) % PERM_LEVELS.length]
      return { ...prev, [roleKey]: { ...prev[roleKey], [moduleKey]: next } }
    })
    setChanged(true)
  }

  /* ── Add custom role ── */
  const handleCreateRole = (newRole) => {
    const basedOnPerms = newRole.basedOn
      ? (perms?.[newRole.basedOn] ? { ...perms[newRole.basedOn] } : DEFAULT_PERMS[newRole.basedOn] ? { ...DEFAULT_PERMS[newRole.basedOn] } : { ...EMPTY_ROLE_PERMS })
      : { ...EMPTY_ROLE_PERMS }

    setRoles(prev => [...prev, { key: newRole.key, label: newRole.label, color: newRole.color, bg: newRole.bg, border: newRole.border, builtin: false }])
    setPerms(prev => ({ ...prev, [newRole.key]: basedOnPerms }))
    setChanged(true)
    setShowNewRole(false)
    showToast(`Rôle "${newRole.label}" créé — personnalisez ses permissions puis sauvegardez.`)
  }

  /* ── Delete custom role ── */
  const handleDeleteRole = () => {
    const key = deleteRole.key
    setRoles(prev => prev.filter(r => r.key !== key))
    setPerms(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setChanged(true)
    setDeleteRole(null)
    showToast(`Rôle "${deleteRole.label}" supprimé.`, 'success')
  }

  const handleSave = async () => {
    setSaving(true); setConfirm(false)
    try {
      const customRoles = roles.filter(r => !r.builtin)
      await usersApi.saveConfiguration({ permissions: perms, roles: customRoles })
      setChanged(false)
      showToast('Permissions et rôles sauvegardés avec succès')
    } catch (e) {
      showToast(e.response?.data?.error || e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="loading"><div className="spinner" /></div>
  )

  const customRoles = roles.filter(r => !r.builtin)

  return (
    <>
      {/* ── Header — hidden in embedded (tab) mode ── */}
      {!embedded && <div className="header">
        <div className="header-left">
          <div className="header-accent-bar"></div>
          <div className="header-title-group">
            <h2>Permissions par rôle</h2>
            <span className="header-subtitle">Matrice d'accès · Modules · Niveaux</span>
          </div>
        </div>
        <div className="header-right" style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowNewRole(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#fff', color: '#334155', border: '1.5px solid #e2e8f0',
              borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nouveau rôle
          </button>
          <button
            onClick={() => setConfirm(true)}
            disabled={saving || !changed}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#15803d', color: '#fff', border: 'none',
              borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600,
              cursor: (saving || !changed) ? 'default' : 'pointer',
              opacity: saving ? 0.6 : changed ? 1 : 0.4,
              transition: 'opacity 0.2s',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>
      </div>}

      {/* ── Embedded toolbar — shown only when inside a parent tab (Users.jsx) ── */}
      {embedded && (
        <div style={{ padding: '10px 28px', display: 'flex', gap: 10, alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
          <button
            onClick={() => setShowNewRole(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: '#fff', color: '#334155', border: '1.5px solid #e2e8f0',
              borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nouveau rôle
          </button>
          <button
            onClick={() => { if (changed) setConfirm(true) }}
            disabled={saving || !changed}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: '#15803d', color: '#fff', border: 'none',
              borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600,
              cursor: (saving || !changed) ? 'default' : 'pointer',
              opacity: saving ? 0.6 : changed ? 1 : 0.4,
              transition: 'opacity 0.2s',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            {saving ? 'Sauvegarde…' : 'Sauvegarder les permissions'}
          </button>
          {changed && (
            <span style={{ fontSize: 11, color: '#b45309', fontWeight: 600, background: '#fef3c7', padding: '3px 10px', borderRadius: 99, border: '1px solid #fcd34d' }}>
              Modifications non sauvegardées
            </span>
          )}
        </div>
      )}

      {/* ── Legend ── */}
      <div style={{ padding: '16px 28px 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERM_LEVELS.map(p => {
          const c = PERM_COLORS[p]
          return (
            <span key={p} style={{
              fontSize: 11, fontWeight: 700, padding: '3px 11px', borderRadius: 99,
              background: c.bg, color: c.color, border: `1px solid ${c.border}`,
            }}>
              {PERM_LABELS[p]}
            </span>
          )
        })}
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>
          · Cliquer sur une cellule pour changer le niveau
        </span>
        {customRoles.length > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 11px', borderRadius: 99,
            background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', marginLeft: 4,
          }}>
            {customRoles.length} rôle{customRoles.length > 1 ? 's' : ''} personnalisé{customRoles.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Matrix ── */}
      <div style={{ padding: '18px 28px' }}>
        <div style={{ overflowX: 'auto', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{
                  padding: '14px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                  color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em',
                  borderBottom: '2px solid #e2e8f0', width: 180,
                }}>
                  Permissions / Rôle
                </th>
                {modules.map(m => (
                  <th key={m.key} style={{
                    padding: '14px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700,
                    color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '2px solid #e2e8f0',
                  }}>
                    {m.label}
                  </th>
                ))}
                <th style={{
                  padding: '14px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700,
                  color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
                  borderBottom: '2px solid #e2e8f0', width: 60,
                }}>
                  &nbsp;
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role, ri) => (
                <tr
                  key={role.key}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    background: !role.builtin
                      ? '#fffbf0'
                      : ri % 2 === 0 ? '#fff' : '#fafbfc',
                  }}
                >
                  {/* Role label */}
                  <td style={{ padding: '12px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 99,
                        background: role.bg, color: role.color,
                      }}>
                        {role.label}
                      </span>
                      {!role.builtin && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                          background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a',
                        }}>
                          custom
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Permission cells */}
                  {modules.map(m => {
                    const perm   = perms?.[role.key]?.[m.key] ?? 'none'
                    const c      = PERM_COLORS[perm]
                    const locked = role.key === 'admin'
                    return (
                      <td key={m.key} style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() => toggle(role.key, m.key)}
                          title={locked ? 'Admin dispose de tous les droits' : `Cliquer pour changer (${PERM_LABELS[perm]})`}
                          style={{
                            fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                            background: c.bg, color: c.color, border: `1.5px solid ${c.border}`,
                            cursor: locked ? 'default' : 'pointer',
                            transition: 'filter 0.12s',
                            opacity: locked ? 0.85 : 1,
                            minWidth: 72,
                          }}
                          onMouseEnter={e => { if (!locked) e.currentTarget.style.filter = 'brightness(0.92)' }}
                          onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}
                        >
                          {PERM_LABELS[perm]}
                        </button>
                      </td>
                    )
                  })}

                  {/* Delete button (custom roles only) */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {!role.builtin ? (
                      <button
                        onClick={() => setDeleteRole(role)}
                        title="Supprimer ce rôle"
                        style={{
                          background: 'none', border: '1px solid #fca5a5',
                          borderRadius: 7, padding: '5px 7px',
                          cursor: 'pointer', color: '#b91c1c',
                          display: 'inline-flex', alignItems: 'center',
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                        </svg>
                      </button>
                    ) : (
                      <span style={{ color: '#e2e8f0', fontSize: 16 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Info box */}
        <div style={{
          marginTop: 18, padding: '12px 16px', borderRadius: 10,
          background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 12, color: '#14532d',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>
            <strong>Note :</strong> Les rôles marqués <span style={{ background: '#fef9c3', color: '#854d0e', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>custom</span> sont des rôles personnalisés que vous avez créés.
            Ils peuvent être assignés aux utilisateurs depuis la page <strong>Utilisateurs</strong>.
            Le rôle <strong>Administrateur</strong> dispose toujours de droits complets et ne peut pas être modifié.
          </div>
        </div>
      </div>

      {/* ── New Role Modal ── */}
      {showNewRole && (
        <NewRoleModal
          onClose={() => setShowNewRole(false)}
          onConfirm={handleCreateRole}
          existingRoles={customRoles}
        />
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteRole && (
        <DeleteRoleConfirm
          role={deleteRole}
          onClose={() => setDeleteRole(null)}
          onConfirm={handleDeleteRole}
        />
      )}

      {/* ── Confirm save dialog ── */}
      {confirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10,14,30,0.62)',
          zIndex: 9998, backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 14, maxWidth: 420, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
              padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(255,255,255,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/>
                </svg>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Confirmer la sauvegarde</span>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 14, color: '#475569', margin: 0 }}>
                Vous allez sauvegarder les permissions de tous les rôles
                {customRoles.length > 0 && ` ainsi que ${customRoles.length} rôle${customRoles.length > 1 ? 's' : ''} personnalisé${customRoles.length > 1 ? 's' : ''}`}.
                Ces changements prendront effet lors des prochaines connexions.
              </p>
            </div>
            <div style={{
              padding: '12px 24px', borderTop: '1px solid #e8ecf4',
              display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#fafbfc',
            }}>
              <ModalBtn variant="secondary" onClick={() => setConfirm(false)}>Annuler</ModalBtn>
              <ModalBtn variant="primary" onClick={handleSave}>Confirmer</ModalBtn>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 99999,
          background: toast.type === 'error' ? '#c92a2a' : '#059669',
          color: '#fff', padding: '12px 22px', borderRadius: 10,
          fontSize: 14, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
          animation: 'modal-panel-in 0.18s ease-out forwards',
        }}>
          {toast.msg}
        </div>
      )}
    </>
  )
}