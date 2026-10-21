import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usersApi } from '../api/users.api.js'
import { exportToExcel } from '../utils/helpers.js'

function formatDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (isNaN(d)) return raw
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatTime(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (isNaN(d)) return raw
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function StatusPill({ status }) {
  const ok = status === 'success'
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
      background: ok ? '#dcfce7' : '#fee2e2',
      color:      ok ? '#15803d' : '#b91c1c',
      border:     `1px solid ${ok ? '#86efac' : '#fca5a5'}`,
      whiteSpace: 'nowrap',
    }}>
      {ok ? 'Succès' : 'Échec'}
    </span>
  )
}

/**
 * Props:
 *   embedded — when true, hide the page header (rendered inside a tab in Users.jsx)
 * Route params:
 *   id — user id (per-user history), absent = global view
 */
export default function LoginHistory({ embedded = false }) {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [userInfo, setUserInfo] = useState(null)
  const [exporting, setExporting] = useState(false)

  const [fMatricule, setFMatricule] = useState('')
  const [fFrom, setFFrom]           = useState('')
  const [fTo, setFTo]               = useState('')
  const [fStatus, setFStatus]       = useState('')

  // When rendered as an embedded tab (Users.jsx), always use the global view
  // regardless of any stray URL params from parent routes.
  const isPerUser = !embedded && Boolean(id)
  const debounce  = useRef(null)
  const loadVersion = useRef(0)

  const load = () => {
    const version = ++loadVersion.current
    setLoading(true)
    setError('')
    const p = { from: fFrom || undefined, to: fTo || undefined, status: fStatus || undefined }
    const req = isPerUser
      ? usersApi.loginHistory(id, p)
      : usersApi.allLoginHistory({ ...p, matricule: fMatricule || undefined })
    req
      .then(data => {
        if (version !== loadVersion.current) return
        setRows(Array.isArray(data) ? data.filter(row => !fStatus || row.status === fStatus) : [])
        if (isPerUser && data?.length > 0 && !userInfo) {
          setUserInfo(data[0].fullName || data[0].matricule)
        }
      })
      .catch(e => { if (version === loadVersion.current) setError(e.message) })
      .finally(() => { if (version === loadVersion.current) setLoading(false) })
  }

  useEffect(() => {
    clearTimeout(debounce.current)
    loadVersion.current++
    setRows([])
    debounce.current = setTimeout(load, 300)
    return () => { clearTimeout(debounce.current); loadVersion.current++ }
  }, [fMatricule, fFrom, fTo, fStatus, id])

  const successCount = rows.filter(r => r.status === 'success').length
  const failedCount  = rows.filter(r => r.status === 'failed').length
  const handleExport = async () => {
    setExporting(true)
    setError('')
    try {
      const data = await usersApi.selectLoginHistory(isPerUser ? id : null, {
        matricule: isPerUser ? undefined : fMatricule || undefined,
        from: fFrom || undefined, to: fTo || undefined, status: fStatus || undefined,
      })
      exportToExcel(data.map(r => ({
        Matricule: r.matricule, Nom: r.fullName, Connexion: r.loginAt,
        IP: r.ipAddress, MAC: r.serverMac, Statut: r.status,
      })), 'historique_connexions.xlsx')
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      {/* ── Header — hidden in embedded mode ── */}
      {!embedded && (
        <div className="header">
          <div className="header-left">
            {isPerUser && (
              <button
                onClick={() => navigate('/users')}
                style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 12, fontWeight: 600 }}
                onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><polyline points="15 18 9 12 15 6"/></svg>
                Retour
              </button>
            )}
            <div className="header-accent-bar"></div>
            <div className="header-title-group">
              <h2>{isPerUser ? `Historique — ${userInfo || 'Utilisateur'}` : 'Historique des connexions'}</h2>
              <span className="header-subtitle">{isPerUser ? 'Connexions · Tentatives' : 'Tous utilisateurs · Audit de sécurité'}</span>
            </div>
          </div>
          <div className="header-right">
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>{successCount} succès</span>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}>{failedCount} échecs</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats bar in embedded mode ── */}
      {embedded && (
        <div style={{ padding: '12px 28px', display: 'flex', gap: 10, background: '#fafbfc', borderBottom: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 8, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>{successCount} succès</span>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}>{failedCount} échecs</span>
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ padding: '14px 28px', display: 'flex', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9', background: embedded ? '#fff' : '#fafbfc' }}>
        {!isPerUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Matricule…" value={fMatricule} onChange={e => setFMatricule(e.target.value)} style={{ border: 'none', outline: 'none', fontSize: 13, width: 130, color: '#334155' }} />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Du</label>
          <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#334155', background: '#fff', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Au</label>
          <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#334155', background: '#fff', outline: 'none' }} />
        </div>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#334155', background: '#fff', outline: 'none', cursor: 'pointer' }}>
          <option value="">Tous les statuts</option>
          <option value="success">Succès</option>
          <option value="failed">Échec</option>
        </select>
        {(fMatricule || fFrom || fTo || fStatus) && (
          <button onClick={() => { setFMatricule(''); setFFrom(''); setFTo(''); setFStatus('') }} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#64748b', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Effacer
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ padding: '10px 28px' }}>
        <button type="button" className="btn-icon btn-edit" onClick={handleExport} disabled={loading || exporting}>
          {exporting ? 'Export en cours…' : 'Export Excel'}
        </button>
      </div>
      <div style={{ padding: '20px 28px' }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            <svg viewBox="0 0 24 24" style={{ width: 40, height: 40, stroke: '#cbd5e1', fill: 'none', display: 'block', margin: '0 auto 12px' }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <p style={{ fontSize: 14 }}>Aucune connexion trouvée</p>
          </div>
        ) : (
          <div className="table-container">
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {!isPerUser && <th>Utilisateur</th>}
                    {!isPerUser && <th style={{ width: 120 }}>Matricule</th>}
                    <th style={{ width: 110 }}>Date</th>
                    <th style={{ width: 100 }}>Heure</th>
                    <th style={{ width: 200 }}>IP Client / MAC Serveur</th>
                    <th style={{ width: 100, textAlign: 'center' }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} style={{ opacity: r.status === 'failed' ? 0.85 : 1 }}>
                      {!isPerUser && (
                        <td style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                          {r.fullName || r.matricule || '—'}
                        </td>
                      )}
                      {!isPerUser && (
                        <td>
                          <code style={{ fontSize: 12, background: '#f1f5f9', padding: '2px 7px', borderRadius: 5, color: '#475569' }}>
                            {r.matricule || '—'}
                          </code>
                        </td>
                      )}
                      <td style={{ fontSize: 13, color: '#475569' }}>{formatDate(r.loginAt)}</td>
                      <td style={{ fontSize: 13, color: '#475569', fontFamily: 'monospace' }}>{formatTime(r.loginAt)}</td>
                      <td>
                        <code style={{ fontSize: 12, background: '#f8fafc', padding: '2px 7px', borderRadius: 5, color: '#334155', display: 'block' }}>
                          {r.ipAddress || '—'}
                        </code>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, paddingLeft: 2 }}>
                          MAC: {r.serverMac || 'N/A'}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}><StatusPill status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '8px 0', fontSize: 12, color: '#94a3b8' }}>
              {rows.length} entrée{rows.length > 1 ? 's' : ''}
              {rows.length >= (isPerUser ? 200 : 500) && ' (limite atteinte — affinez les filtres)'}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
