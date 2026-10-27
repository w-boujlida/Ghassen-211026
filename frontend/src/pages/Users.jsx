import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersApi } from '../api/users.api.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import Modal, { ModalBtn, ModalField } from '../components/Modal.jsx'
import Permissions from './Permissions.jsx'
import LoginHistory from './LoginHistory.jsx'
import { exportToExcel, parseExcelFile } from '../utils/helpers.js'

/* ── Static native roles ─────────────────────────────────────────────── */
const NATIVE_ROLES = [
  { key: 'admin',            name: 'Administrateur',  desc: 'Accès complet + gestion utilisateurs', color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  { key: 'supervisor',       name: 'Superviseur',     desc: 'Accès complet + gestion utilisateurs', color: '#0f766e', bg: '#ccfbf1', border: '#99f6e4' },
  { key: 'operator',         name: 'Opérateur',       desc: 'Dashboard, Firewall, CSL, Projets',    color: '#15803d', bg: '#dcfce7', border: '#86efac' },
  { key: 'operator_manager', name: 'Resp. Opérateur', desc: 'Lecture seule + export',               color: '#b45309', bg: '#fef3c7', border: '#fcd34d' },
]

const NATIVE_ROLE_MAP = Object.fromEntries(NATIVE_ROLES.map(r => [r.key, r]))

const TIME_PRESETS = [
  { key: 'always',    label: 'Toujours (défaut)' },
  { key: 'morning',   label: 'Poste Matin  06h – 14h' },
  { key: 'afternoon', label: 'Poste AM     14h – 22h' },
  { key: 'night',     label: 'Poste Nuit   22h – 06h' },
  { key: 'custom',    label: 'Personnalisé' },
]

const EMPTY = { matricule: '', fullName: '', email: '', phone: '', role: 'operator' }

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

function formatLastLogin(isoStr) {
  if (!isoStr) return 'Jamais'
  const d   = new Date(isoStr)
  const now = new Date()
  const diffMin = Math.floor((now - d) / 60000)
  const diffD   = Math.floor((now - d) / 86400000)
  if (diffMin < 5)  return 'En ligne'
  if (diffMin < 60) return `Il y a ${diffMin}min`
  if (diffD === 0)  return `Aujourd'hui ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  if (diffD === 1)  return `Hier ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  if (diffD < 7)    return `Il y a ${diffD}j`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function isOnline(isoStr) {
  return isoStr && (new Date() - new Date(isoStr)) < 5 * 60 * 1000
}

/* ── Role resolution helpers ─────────────────────────────────────────── */
function resolveRole(roleKey, customRoles) {
  if (!roleKey) return NATIVE_ROLE_MAP['operator']
  const nat = NATIVE_ROLE_MAP[roleKey.toLowerCase()] || NATIVE_ROLE_MAP[roleKey]
  if (nat) return nat
  const custom = customRoles.find(r => r.key === roleKey)
  return custom
    ? { key: custom.key, name: custom.label, desc: 'Rôle personnalisé', color: custom.color, bg: custom.bg, border: custom.border }
    : { key: roleKey, name: roleKey, desc: 'Rôle personnalisé', color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' }
}

/* ── Shared badge components ─────────────────────────────────────────── */
function RoleBadge({ role, customRoles }) {
  const r = resolveRole(role, customRoles)
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
      background: r.bg, color: r.color, border: `1px solid ${r.border}`, whiteSpace: 'nowrap',
    }}>
      {r.name}
    </span>
  )
}

function StatusBadge({ active, suspended, failedAttempts }) {
  if (suspended) return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      🔒 Suspendu {failedAttempts > 0 && <span style={{ fontSize: 10, opacity: 0.8 }}>({failedAttempts} tentatives)</span>}
    </span>
  )
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
      background: active ? '#dcfce7' : '#fee2e2',
      color:      active ? '#15803d' : '#b91c1c',
      border:     `1px solid ${active ? '#86efac' : '#fca5a5'}`, whiteSpace: 'nowrap',
    }}>
      {active ? 'Actif' : 'Inactif'}
    </span>
  )
}


function IconBtn({ onClick, title, color = '#15803d', bg = '#f0fdf4', children }) {
  return (
    <button title={title} onClick={onClick} style={{
      width: 30, height: 30, borderRadius: 7, border: 'none', background: bg, color,
      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      transition: 'filter 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.filter = 'brightness(0.9)'}
      onMouseLeave={e => e.currentTarget.style.filter = 'none'}
    >{children}</button>
  )
}

/* ═══════════════════════════════════════════════════════════════════════ */
export default function Users() {
  const { isAdmin } = useAuth()
  const navigate    = useNavigate()

  /* ── Tab ── */
  const [activeTab, setActiveTab] = useState('users')

  /* ── Users list ── */
  const [allUsers, setAllUsers]   = useState([])
  const [search, setSearch]       = useState('')
  const filtered = allUsers.filter(u =>
    [u.fullName || u.full_name, u.matricule, u.email].some(value => String(value ?? '').toLowerCase().includes(search.trim().toLowerCase())))
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  /* ── Custom roles ── */
  const [customRoles, setCustomRoles] = useState([])

  /* ── Modal ── */
  const [modal, setModal]         = useState(false)
  const [form, setForm]           = useState(EMPTY)
  const [timeForm, setTimeForm]   = useState({ preset: 'always', start: '08:00', end: '17:00' })
  const [editId, setEditId]       = useState(null)
  const [editUser, setEditUser]   = useState(null)
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState('')
  const [importModal, setImportModal] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importRows, setImportRows] = useState(null)
  const [importErrors, setImportErrors] = useState([])
  const [importSummary, setImportSummary] = useState(null)
  const [importing, setImporting] = useState(false)
  const importFileRef = useRef(null)

  /* ── Toast ── */
  const [toast, setToast]  = useState(null)
  const toastTimer         = useRef(null)

  const showToast = (msg, type = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }

  /* ── Load users + custom roles ── */
  const load = () => {
    setLoading(true)
    Promise.all([
      usersApi.list(),
      usersApi.getCustomRoles().catch(() => []),
    ]).then(([users, roles]) => {
      const list = Array.isArray(users) ? users : (users?.users || [])
      setAllUsers(list)
      setCustomRoles(Array.isArray(roles) ? roles : [])
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (activeTab === 'users') load() }, [activeTab])

  const handleSearch = (q) => {
    setSearch(q)
  }

  /* ── All roles for form = native + custom ── */
  const allRoles = [
    ...NATIVE_ROLES,
    ...customRoles.map(r => ({ key: r.key, name: r.label, desc: 'Rôle personnalisé', color: r.color, bg: r.bg, border: r.border })),
  ]

  /* ── Modal open/close ── */
  const openAdd = () => {
    setForm(EMPTY); setTimeForm({ preset: 'always', start: '08:00', end: '17:00' })
    setEditId(null); setEditUser(null); setFormError(''); setModal(true)
  }

  const openEdit = (u) => {
    setForm({ matricule: u.matricule, fullName: u.fullName || u.full_name || '', email: u.email || '', phone: u.phone || '', role: u.role || 'operator' })
    setTimeForm({ preset: u.loginTimePreset || 'always', start: u.loginTimeStart || '08:00', end: u.loginTimeEnd || '17:00' })
    setEditId(u.id); setEditUser(u); setFormError(''); setModal(true)
  }

  const handleSave = async () => {
    if (!form.matricule || !form.fullName) { setFormError('Matricule et nom complet sont requis'); return }
    if (!form.email)                        { setFormError('Email est requis'); return }
    setSaving(true); setFormError('')
    try {
      if (!editId) {
        await usersApi.create({ ...form, full_name: form.fullName })
        showToast(`Utilisateur créé — MDP par défaut : ${form.matricule}`)
      } else {
        const isActive = editUser?.isActive ?? editUser?.is_active ?? true
        await usersApi.update(editId, { ...form, full_name: form.fullName, is_active: isActive })
        if (isAdmin) {
          await usersApi.updateTimeAccess(editId, {
            preset: timeForm.preset,
            start:  timeForm.preset === 'custom' ? timeForm.start : null,
            end:    timeForm.preset === 'custom' ? timeForm.end   : null,
          })
        }
        showToast('Utilisateur mis à jour')
      }
      setModal(false); load()
    } catch (e) {
      setFormError(e.response?.data?.error || e.response?.data?.message || e.message)
    } finally { setSaving(false) }
  }

  const handleDelete = async (u) => {
    if (!confirm(`Supprimer "${u.fullName || u.matricule}" ? Cette action est irréversible.`)) return
    try { await usersApi.delete(u.id); showToast('Utilisateur supprimé'); load() }
    catch (e) { showToast(e.response?.data?.error || e.message, 'error') }
  }

  const handleReset = async (id, matricule) => {
    if (!confirm(`Réinitialiser le MDP de "${matricule}" ? Nouveau MDP = matricule`)) return
    try { await usersApi.resetPassword(id); showToast('Mot de passe réinitialisé') }
    catch (e) { showToast(e.response?.data?.error || e.message, 'error') }
  }

  const handleToggle = async (u) => {
    const isActive = u.isActive ?? u.is_active ?? true
    try {
      await usersApi.update(u.id, { full_name: u.fullName || u.full_name || '', email: u.email || '', phone: u.phone || '', role: u.role || 'operator', is_active: !isActive })
      load(); showToast(isActive ? 'Utilisateur désactivé' : 'Utilisateur activé')
    } catch (e) { showToast(e.response?.data?.error || e.message, 'error') }
  }

  const handleUnlock = async (u) => {
    if (!confirm(`Débloquer le compte de "${u.fullName || u.full_name || u.matricule}" et réinitialiser les tentatives échouées ?`)) return
    try {
      await usersApi.unlock(u.id)
      load(); showToast('Compte débloqué avec succès')
    } catch (e) { showToast(e.response?.data?.error || e.message, 'error') }
  }

  const handleUsersExcel = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    try {
      const normalize = value => String(value ?? '').toUpperCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '')
      const parsedRows = await parseExcelFile(file)
      const rows = parsedRows.map((row, index) => {
        const columns = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalize(key), value]))
        const get = (...names) => {
          for (const name of names) {
            const value = columns[normalize(name)]
            if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
          }
          return ''
        }
        return {
          rowNumber: index + 2,
          matricule: get('MATRICULE', 'MAT'),
          fullName: get('FULL_NAME', 'FULLNAME', 'NOM COMPLET', 'NOM'),
          email: get('EMAIL', 'E-MAIL', 'COURRIEL'),
          phone: get('PHONE', 'TELEPHONE', 'TEL'),
          role: get('ROLE', 'ROLE_KEY', 'PROFIL').toLowerCase(),
        }
      }).filter(row => row.matricule || row.fullName || row.email)

      if (rows.length === 0) throw new Error('Aucun utilisateur trouvé dans le fichier.')
      setImportFile(file)
      setImportRows(rows)
      setImportErrors([])
      setImportSummary(null)
      setImportModal(true)
    } catch (error) {
      showToast(`Erreur de lecture Excel : ${error.message}`, 'error')
    } finally {
      event.target.value = ''
    }
  }

  const handleImportUsers = async () => {
    if (!importRows?.length || importing) return
    setImporting(true)
    setImportErrors([])
    let imported = 0
    const errors = []
    try {
      for (const row of importRows) {
        if (!row.matricule || !row.fullName || !row.email) {
          errors.push(`Ligne ${row.rowNumber} : matricule, nom complet et email sont requis.`)
          continue
        }
        const role = isAdmin ? (row.role || 'operator') : 'operator'
        try {
          await usersApi.create({
            matricule: row.matricule,
            fullName: row.fullName,
            email: row.email,
            phone: row.phone,
            role,
          })
          imported++
        } catch (error) {
          errors.push(`Ligne ${row.rowNumber} (${row.matricule}) : ${error.response?.data?.error || error.response?.data?.message || error.message}`)
        }
      }
      setImportErrors(errors)
      setImportSummary({ imported, errors: errors.length })
      load()
      showToast(`Import terminé : ${imported} créé(s), ${errors.length} erreur(s)`, errors.length ? 'error' : 'success')
    } finally {
      setImporting(false)
    }
  }

  const handleExportUsers = () => {
    if (allUsers.length === 0) {
      showToast('Aucun utilisateur à exporter.', 'error')
      return
    }
    exportToExcel(allUsers.map(user => ({
      MATRICULE: String(user.matricule ?? ''),
      NOM_COMPLET: String(user.fullName || user.full_name || ''),
      EMAIL: String(user.email || ''),
      TELEPHONE: String(user.phone || ''),
      ROLE: String(user.role || 'operator'),
      ACTIF: (user.isActive ?? user.is_active ?? true) ? 'Oui' : 'Non',
      DERNIERE_CONNEXION: String(user.lastLogin || ''),
    })), 'utilisateurs.xlsx', 'Utilisateurs', 'users')
  }

  /* ── SVG icons ── */
  const IcoEdit   = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  const IcoReset  = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.92"/></svg>
  const IcoLock   = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  const IcoUnlock = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
  const IcoTrash  = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
  const IcoClock  = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>

  const TAB = (active) => ({
    padding: '10px 20px', fontSize: 13, fontWeight: 600, border: 'none',
    borderBottom: active ? '2px solid #15803d' : '2px solid transparent',
    background: 'none', color: active ? '#15803d' : '#94a3b8', cursor: 'pointer',
    transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 7,
    fontFamily: "'Inter', sans-serif",
  })

  /* ─────────────────────────────────────────────────────────────────── */
  return (
    <>
      {/* ── Header ── */}
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar"></div>
          <div className="header-title-group">
            <h2>Gestion Utilisateurs</h2>
            <span className="header-subtitle">Comptes · Rôles · Accès</span>
          </div>
        </div>
        <div className="header-right">
          <div className="hbadge hbadge-clock">
            <span className="hbadge-clock-dot"></span>
            <span>{new Date().toLocaleTimeString('fr-FR')}</span>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '0 28px', background: '#fff', gap: 4 }}>
        <button style={TAB(activeTab === 'users')} onClick={() => setActiveTab('users')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Utilisateurs
        </button>
        {isAdmin && (
          <>
            <button style={TAB(activeTab === 'permissions')} onClick={() => setActiveTab('permissions')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Permissions
            </button>
            <button style={TAB(activeTab === 'history')} onClick={() => setActiveTab('history')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Historique connexions
            </button>
          </>
        )}
      </div>

      {/* ── Tab contents ── */}
      {activeTab === 'permissions' && <Permissions embedded />}
      {activeTab === 'history'     && <LoginHistory embedded />}

      {/* ── Users Tab ── */}
      {activeTab === 'users' && (
        <>
          {/* Toolbar */}
          <div className="users-toolbar">
            <div className="users-search">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" placeholder="Rechercher par nom, matricule, email…" value={search} onChange={e => handleSearch(e.target.value)} />
            </div>
            <span className="users-count"><span>{filtered.length}</span> utilisateurs</span>
            <input
              ref={importFileRef}
              type="file"
              accept=".xls,.xlsx,.csv"
              hidden
              onChange={handleUsersExcel}
            />
            <button className="add-btn" style={{ background: '#059669' }}
              onClick={() => importFileRef.current?.click()} disabled={importing}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Importer Excel
            </button>
            <button className="add-btn" style={{ background: '#0f766e' }}
              onClick={handleExportUsers} disabled={allUsers.length === 0}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Exporter Excel
            </button>
            <button className="add-btn" onClick={openAdd}>
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nouvel utilisateur
            </button>
          </div>

          {/* Table */}
          <div style={{ padding: '20px 28px' }}>
            {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
            {loading ? (
              <div className="loading"><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 28px', color: '#94a3b8' }}>
                <svg viewBox="0 0 24 24" style={{ width: 48, height: 48, stroke: '#cbd5e1', fill: 'none', display: 'block', margin: '0 auto 14px' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <p style={{ fontSize: 14 }}>Aucun utilisateur trouvé</p>
              </div>
            ) : (
              <div className="table-container">
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Utilisateur</th>
                        <th style={{ width: 120 }}>Matricule</th>
                        <th style={{ width: 150 }}>Rôle</th>
                        <th>Email</th>
                        <th style={{ width: 145 }}>Dernière connexion</th>
                        <th style={{ width: 100, textAlign: 'center' }}>Statut</th>
                        <th style={{ width: 180, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(u => {
                        const name      = u.fullName || u.full_name || u.matricule
                        const role      = u.role || 'operator'
                        const isActive  = u.isActive ?? u.is_active ?? true
                        const suspended = !isActive && (u.failedAttempts ?? 0) >= 5
                        const online    = isOnline(u.lastLogin)
                        const rMeta     = resolveRole(role, customRoles)
                        return (
                          <tr key={u.id} style={isActive ? {} : { opacity: 0.6 }}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, ${rMeta.color}, ${rMeta.color}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>
                                    {initials(name)}
                                  </div>
                                  {online && <span style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: '#22c55e', border: '2px solid #fff' }} title="En ligne" />}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{name}</div>
                                  {u.phone && <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.phone}</div>}
                                </div>
                              </div>
                            </td>
                            <td><code style={{ fontSize: 12, background: '#f1f5f9', padding: '2px 7px', borderRadius: 5, color: '#475569' }}>{u.matricule}</code></td>
                            <td><RoleBadge role={role} customRoles={customRoles} /></td>
                            <td style={{ fontSize: 13, color: '#475569' }}>{u.email || '—'}</td>
                            <td>
                              <span style={{ fontSize: 12, color: online ? '#16a34a' : '#64748b', fontWeight: online ? 600 : 400, display: 'flex', alignItems: 'center', gap: 5 }}>
                                {online && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />}
                                {formatLastLogin(u.lastLogin)}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}><StatusBadge active={isActive} suspended={suspended} failedAttempts={u.failedAttempts ?? 0} /></td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                <IconBtn onClick={() => openEdit(u)} title="Modifier" color="#15803d" bg="#f0fdf4">{IcoEdit}</IconBtn>
                                <IconBtn onClick={() => handleReset(u.id, u.matricule)} title="Réinitialiser MDP" color="#0f766e" bg="#ccfbf1">{IcoReset}</IconBtn>
                                {suspended ? (
                                  <IconBtn onClick={() => handleUnlock(u)} title="Débloquer (réinitialiser tentatives)" color="#16a34a" bg="#dcfce7">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                                  </IconBtn>
                                ) : (
                                  <IconBtn onClick={() => handleToggle(u)} title={isActive ? 'Désactiver' : 'Activer'} color={isActive ? '#b45309' : '#15803d'} bg={isActive ? '#fef3c7' : '#dcfce7'}>
                                    {isActive ? IcoLock : IcoUnlock}
                                  </IconBtn>
                                )}
                                <IconBtn onClick={() => navigate(`/login-history/${u.id}`)} title="Historique connexions" color="#7c3aed" bg="#f5f3ff">{IcoClock}</IconBtn>
                                <IconBtn onClick={() => handleDelete(u)} title="Supprimer" color="#b91c1c" bg="#fee2e2">{IcoTrash}</IconBtn>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {importModal && (
        <Modal
          title="Importer des utilisateurs — Excel"
          accentColor="#059669"
          onClose={() => { if (!importing) setImportModal(false) }}
          maxWidth={620}
          footer={
            <>
              <ModalBtn variant="secondary" onClick={() => setImportModal(false)} disabled={importing}>Fermer</ModalBtn>
              {!importSummary && (
                <ModalBtn variant="success" onClick={handleImportUsers} disabled={importing || !importRows?.length}>
                  {importing ? 'Import en cours…' : `Importer (${importRows?.length || 0} lignes)`}
                </ModalBtn>
              )}
            </>
          }
        >
          <ModalField label="Fichier sélectionné">
            <div className="file-chip">{importFile?.name} — {importRows?.length || 0} ligne(s) détectée(s)</div>
          </ModalField>
          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.65, marginBottom: 12 }}>
            Colonnes requises : <strong>MATRICULE</strong>, <strong>NOM_COMPLET</strong>, <strong>EMAIL</strong>.
            Colonnes facultatives : <strong>TELEPHONE</strong>, <strong>ROLE</strong>.
            Le mot de passe initial de chaque compte sera son matricule.
            {!isAdmin && <> Les comptes importés auront le rôle Opérateur.</>}
          </div>
          {importSummary && (
            <div className={`alert ${importSummary.errors ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: 12 }}>
              Import terminé : {importSummary.imported} compte(s) créé(s), {importSummary.errors} erreur(s).
            </div>
          )}
          {importErrors.length > 0 && (
            <div style={{ maxHeight: 180, overflow: 'auto', padding: 12, border: '1px solid #fecaca', borderRadius: 8, background: '#fff7f7', color: '#991b1b', fontSize: 12 }}>
              {importErrors.map((message, index) => <div key={`${index}-${message}`}>{message}</div>)}
            </div>
          )}
          {importRows?.length > 0 && !importSummary && (
            <div style={{ maxHeight: 190, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <table className="data-table" style={{ minWidth: 520, margin: 0 }}>
                <thead><tr><th>Ligne</th><th>Matricule</th><th>Nom complet</th><th>Email</th><th>Rôle</th></tr></thead>
                <tbody>
                  {importRows.slice(0, 8).map(row => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td><td>{row.matricule || '—'}</td><td>{row.fullName || '—'}</td>
                      <td>{row.email || '—'}</td><td>{row.role || 'operator'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importRows.length > 8 && <div style={{ padding: 8, color: '#64748b', fontSize: 11 }}>Aperçu des 8 premières lignes sur {importRows.length}.</div>}
            </div>
          )}
        </Modal>
      )}

      {/* ══ MODAL: Create / Edit ══ */}
      {modal && (
        <Modal
          title={editId ? "Modifier l'utilisateur" : 'Nouvel utilisateur'}
          accentColor={editId ? '#15803d' : '#059669'}
          onClose={() => setModal(false)}
          maxWidth={580}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          }
          footer={
            <>
              <ModalBtn variant="secondary" onClick={() => setModal(false)}>Annuler</ModalBtn>
              <ModalBtn variant={editId ? 'primary' : 'success'} onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement…' : editId ? 'Enregistrer' : 'Créer'}
              </ModalBtn>
            </>
          }
        >
          {/* ── Basic fields ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <ModalField label="Matricule" required>
              <input type="text" className="form-input" placeholder="ex: EMP001"
                value={form.matricule} disabled={!!editId}
                onChange={e => setForm(f => ({ ...f, matricule: e.target.value }))} />
              {!editId && <span style={{ fontSize: 11, color: '#94a3b8' }}>MDP par défaut = matricule</span>}
            </ModalField>
            <ModalField label="Nom complet" required>
              <input type="text" className="form-input" placeholder="Prénom Nom"
                value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
            </ModalField>
            <ModalField label="Email" required>
              <input type="email" className="form-input" placeholder="email@adient.com"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </ModalField>
            <ModalField label="Téléphone">
              <input type="tel" className="form-input" placeholder="+212 6XX XXXXXX"
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </ModalField>
          </div>

          {/* ── Role cards ── */}
          <ModalField label="Rôle" required>
            {isAdmin ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {allRoles.map(r => {
                  const selected = form.role === r.key
                  return (
                    <div key={r.key}
                      onClick={() => setForm(f => ({ ...f, role: r.key }))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                        borderRadius: 10, cursor: 'pointer', transition: 'all 0.12s',
                        border: selected ? `2px solid ${r.color}` : '2px solid #e2e8f0',
                        background: selected ? r.bg : '#fafbfc',
                        boxShadow: selected ? `0 0 0 3px ${r.color}22` : 'none',
                      }}
                    >
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: selected ? r.color : '#1e293b' }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{r.desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', background: '#f8fafc', opacity: 0.7 }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                  Rôle actuel : <strong>{resolveRole(form.role, customRoles).name}</strong> — Seul l'ADMIN peut modifier les rôles.
                </span>
              </div>
            )}
          </ModalField>

          {/* ── Time access (edit + admin only) ── */}
          {editId && isAdmin && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', background: '#f8fafc' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Accès horaire
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {TIME_PRESETS.map(p => {
                  const sel = timeForm.preset === p.key
                  return (
                    <label key={p.key} style={{
                      display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
                      padding: '8px 12px', borderRadius: 8, transition: 'background 0.1s',
                      background: sel ? '#f0fdf4' : 'transparent',
                      border: sel ? '1.5px solid #86efac' : '1.5px solid transparent',
                      fontSize: 13, color: sel ? '#14532d' : '#334155', fontWeight: sel ? 600 : 400,
                    }}>
                      <input type="radio" name="timePreset" value={p.key} checked={sel}
                        onChange={() => setTimeForm(f => ({ ...f, preset: p.key }))}
                        style={{ accentColor: '#15803d' }} />
                      {p.label}
                    </label>
                  )
                })}
              </div>
              {timeForm.preset === 'custom' && (
                <div style={{ display: 'flex', gap: 12, marginTop: 12, paddingLeft: 4 }}>
                  <ModalField label="Heure début">
                    <input type="time" className="form-input" value={timeForm.start}
                      onChange={e => setTimeForm(f => ({ ...f, start: e.target.value }))}
                      style={{ width: 130 }} />
                  </ModalField>
                  <ModalField label="Heure fin">
                    <input type="time" className="form-input" value={timeForm.end}
                      onChange={e => setTimeForm(f => ({ ...f, end: e.target.value }))}
                      style={{ width: 130 }} />
                  </ModalField>
                </div>
              )}
            </div>
          )}

          {formError && <div style={{ fontSize: 12, color: '#c92a2a', marginTop: 4 }}>{formError}</div>}
        </Modal>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 99999,
          background: toast.type === 'error' ? '#dc2626' : '#059669',
          color: '#fff', padding: '11px 22px', borderRadius: 10,
          fontSize: 13.5, fontWeight: 600,
          boxShadow: '0 8px 28px rgba(0,0,0,.2), 0 2px 8px rgba(0,0,0,.12)',
          animation: 'modal-panel-in 0.18s ease-out forwards',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.msg}
        </div>
      )}
    </>
  )
}
