import { useCallback, useEffect, useRef, useState } from 'react'
import { suiviQualiteApi } from '../api/suiviQualite.api.js'
import { projectsApi } from '../api/projects.api.js'
import AnimatedNumber from '../components/AnimatedNumber.jsx'

const SHIFT_LABELS = {
  MATIN: 'Matin (06h-14h)',
  APRES_MIDI: 'Après-midi (14h-22h)',
  SHIFT_1: 'Shift 1 (06h-16h)',
  SHIFT_2: 'Shift 2 (20h-06h)',
}

// Rafraîchissement quasi temps réel par polling — le projet n'a pas d'infrastructure WebSocket/SSE
// (les notifications elles-mêmes sont déjà consultées par polling, cf. NotifBell dans Layout.jsx).
// 15s est un compromis raisonnable entre fraîcheur des données et charge sur l'API/la base.
const REFRESH_MS = 15000

function fmtToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const STATUT_STYLE = {
  VERT:   { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', label: 'Vert — sous contrôle',      dot: '#22c55e' },
  ORANGE: { bg: '#fffbeb', border: '#fde68a', text: '#b45309', label: 'Orange — zone d\'alerte',   dot: '#f59e0b' },
  ROUGE:  { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', label: 'Rouge — limite dépassée',   dot: '#ef4444' },
}

export function StatutBadge({ statut }) {
  const s = STATUT_STYLE[statut] || STATUT_STYLE.VERT
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 700,
      background: s.bg, color: s.text, border: `1px solid ${s.border}`, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {statut}
    </span>
  )
}

export default function SuiviQualite() {
  const [projects, setProjects]   = useState([])
  const [projet, setProjet]       = useState('')
  const [lignesProjet, setLignesProjet] = useState([])
  const [ligne, setLigne]         = useState('')
  const [shift, setShift]         = useState('')
  const [date, setDate]           = useState(fmtToday())
  const [autoRefresh, setAutoRefresh] = useState(true)

  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const timerRef = useRef(null)

  useEffect(() => {
    projectsApi.getProjects()
      .then(d => setProjects(d?.projects || []))
      .catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    if (!projet) { setLignesProjet([]); setLigne(''); return }
    projectsApi.getLignesProjet(projet)
      .then(d => setLignesProjet(d?.lignes || []))
      .catch(() => setLignesProjet([]))
  }, [projet])

  const load = useCallback(() => {
    if (!projet) { setDashboard(null); return }
    setLoading(true); setError('')
    suiviQualiteApi.getDashboard({ projet, ligne, shift, date })
      .then(setDashboard)
      .catch(e => {
        setDashboard(null)
        setError(e.response?.data?.error || e.response?.data?.message || e.message)
      })
      .finally(() => setLoading(false))
  }, [projet, ligne, shift, date])

  useEffect(() => { load() }, [load])

  // Polling temps réel — actif seulement quand un projet est sélectionné et que l'utilisateur ne l'a pas coupé.
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!projet || !autoRefresh) return undefined
    timerRef.current = setInterval(load, REFRESH_MS)
    return () => clearInterval(timerRef.current)
  }, [projet, autoRefresh, load])

  const lignesRows = dashboard?.lignes || []
  const lignesRouge = lignesRows.filter(l => l.statut === 'ROUGE')
  const creneaux = dashboard?.creneauxShift || []

  return (
    <>
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar" />
          <div className="header-title-group">
            <h2>Suivi Qualité des Coiffes</h2>
            <span className="header-subtitle">Limite vs coiffes avec défaut, détail par créneau horaire, en temps réel</span>
          </div>
        </div>
      </div>

      {/* ── Filtres ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', padding: '16px 28px', background: '#fafbff', borderBottom: '1px solid #f1f5f9' }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Projet *</label>
          <select className="form-input" style={{ minWidth: 180 }} value={projet} onChange={e => setProjet(e.target.value)}>
            <option value="">Sélectionner…</option>
            {projects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Ligne</label>
          <select className="form-input" style={{ minWidth: 160 }} value={ligne} onChange={e => setLigne(e.target.value)} disabled={!projet}>
            <option value="">Toutes les lignes</option>
            {lignesProjet.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Shift</label>
          <select className="form-input" style={{ minWidth: 170 }} value={shift} onChange={e => setShift(e.target.value)}>
            <option value="">Shift courant</option>
            {Object.keys(SHIFT_LABELS).map(s => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Date</label>
          <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <button className="add-btn" onClick={load} disabled={!projet || loading} style={{ marginLeft: 'auto' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.92"/></svg>
          {loading ? 'Actualisation…' : 'Actualiser'}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
          Temps réel (toutes les {REFRESH_MS / 1000}s)
        </label>
      </div>

      <div style={{ padding: '20px 28px 36px' }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        {!projet && !error && (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            Sélectionnez un projet pour afficher le suivi qualité.
          </div>
        )}

        {projet && dashboard && (
          <>
            {/* Bandeau dépassements */}
            {lignesRouge.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 16,
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#b91c1c', fontSize: 13, fontWeight: 600,
              }}>
                <span style={{ fontSize: 18 }}>⚠</span>
                {lignesRouge.length} ligne{lignesRouge.length > 1 ? 's' : ''} en dépassement de limite : {lignesRouge.map(l => l.ligne).join(', ')}
                <span style={{ marginLeft: 'auto', fontWeight: 500, color: '#94a3b8' }}>Notification admin envoyée</span>
              </div>
            )}

            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">
                  {dashboard.projet}
                  <span className="badge-count" style={{ marginLeft: 8 }}>{lignesRows.length} ligne{lignesRows.length > 1 ? 's' : ''}</span>
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#64748b' }}>
                  <span>
                    {SHIFT_LABELS[dashboard.shift] || dashboard.shift} · {dashboard.date}
                    {dashboard.dateFin && dashboard.dateFin !== dashboard.date ? ` → ${dashboard.dateFin}` : ''}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
                    Maj {dashboard.generatedAt?.slice(11, 19)}
                  </span>
                </div>
              </div>

              <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ minWidth: 220 + creneaux.length * 100 }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1, minWidth: 200 }}>Ligne</th>
                      {creneaux.map(c => <th key={c} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {lignesRows.length === 0 && (
                      <tr><td colSpan={1 + creneaux.length} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Aucune ligne de projet trouvée</td></tr>
                    )}
                    {lignesRows.map(l => (
                      <tr key={l.ligne}>
                        <td style={{ position: 'sticky', left: 0, background: '#fff', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 700 }}>{l.ligne}</div>
                          <div style={{ marginTop: 5 }}><StatutBadge statut={l.statut} /></div>
                          <div style={{ marginTop: 5, fontSize: 11, color: '#64748b' }}>
                            Limite&nbsp;{l.limite} · Qté&nbsp;<AnimatedNumber value={l.quantiteDefauts} /> · {l.pourcentage != null ? `${l.pourcentage}%` : '—'}
                          </div>
                        </td>
                        {l.creneaux.map(c => {
                          const s = STATUT_STYLE[c.statut] || STATUT_STYLE.VERT
                          return (
                            <td key={c.creneau} style={{ background: s.bg, textAlign: 'center', verticalAlign: 'middle' }}>
                              <div style={{ fontSize: 11, color: s.text }}>Limite: <strong>{c.limite}</strong></div>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: s.text, marginTop: 2 }}>
                                Qté: <AnimatedNumber value={c.quantiteDefauts} />
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Légende des seuils */}
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14, fontSize: 12, color: '#64748b' }}>
              <span style={{ fontWeight: 700, color: '#475569' }}>Seuils :</span>
              <span><StatutBadge statut="VERT" /> ratio &lt; {Math.round(dashboard.seuilOrange * 100)}%</span>
              <span><StatutBadge statut="ORANGE" /> {Math.round(dashboard.seuilOrange * 100)}% – {Math.round(dashboard.seuilRouge * 100)}%</span>
              <span><StatutBadge statut="ROUGE" /> &gt; {Math.round(dashboard.seuilRouge * 100)}%</span>
            </div>
          </>
        )}

        {projet && loading && !dashboard && (
          <div className="loading"><div className="spinner" /></div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

        .animated-number { display: inline-block; font-variant-numeric: tabular-nums; }
        .animated-number.value-increased { animation: value-increased-pulse 600ms ease-out; }
        @keyframes value-increased-pulse {
          0%   { transform: scale(1.32); text-shadow: 0 0 0 rgba(22,101,52, 0); }
          35%  { transform: scale(1.14); text-shadow: 0 0 7px rgba(22,101,52, .55); }
          100% { transform: scale(1);    text-shadow: 0 0 0 rgba(22,101,52, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .animated-number.value-increased { animation: none; }
        }
      `}</style>
    </>
  )
}
