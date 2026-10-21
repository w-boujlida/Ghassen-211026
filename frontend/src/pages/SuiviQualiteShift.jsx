import { useCallback, useEffect, useRef, useState } from 'react'
import { suiviQualiteShiftApi } from '../api/suiviQualiteShift.api.js'
import { projectsApi } from '../api/projects.api.js'
import AnimatedNumber from '../components/AnimatedNumber.jsx'

const SHIFT_LABELS = {
  1: 'Shift 1 (06h-16h)',
  2: 'Shift 2 (20h-06h)',
}

// Seuil du taux de rebut (NOK / (OK+NOK)) par créneau, pour la mise en évidence visuelle des cellules.
const SEUIL_ORANGE = 0.10
const SEUIL_ROUGE = 0.25

// Rafraîchissement par polling, même compromis que la page Suivi Qualité (pas de WebSocket/SSE).
const REFRESH_MS = 15000

function fmtToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const RATIO_STYLE = {
  VIDE:   { bg: '#f8fafc', text: '#94a3b8', border: '#f1f5f9' },
  VERT:   { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  ORANGE: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  ROUGE:  { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
}

function ratioStatut(ok, nok) {
  const total = ok + nok
  if (total === 0) return 'VIDE'
  const ratio = nok / total
  if (ratio > SEUIL_ROUGE) return 'ROUGE'
  if (ratio >= SEUIL_ORANGE) return 'ORANGE'
  return 'VERT'
}

export default function SuiviQualiteShift() {
  const [projects, setProjects] = useState([])
  const [projet, setProjet] = useState('')
  const [lignesProjet, setLignesProjet] = useState([])
  const [ligne, setLigne] = useState('')
  const [shift, setShift] = useState('1')
  const [date, setDate] = useState(fmtToday())
  const [autoRefresh, setAutoRefresh] = useState(true)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef(null)

  useEffect(() => {
    projectsApi.getProjects()
      .then(d => setProjects((d?.projects || []).filter(p => p.has_firewall)))
      .catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    if (!projet) { setLignesProjet([]); setLigne(''); return }
    projectsApi.getLignesProjet(projet)
      .then(d => setLignesProjet(d?.lignes || []))
      .catch(() => setLignesProjet([]))
  }, [projet])

  const load = useCallback(() => {
    if (!projet) { setData(null); return }
    setLoading(true); setError('')
    suiviQualiteShiftApi.getShift({ projet, shift, date, ligne })
      .then(setData)
      .catch(e => {
        setData(null)
        setError(e.response?.data?.error || e.response?.data?.message || e.message)
      })
      .finally(() => setLoading(false))
  }, [projet, shift, date, ligne])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!projet || !autoRefresh) return undefined
    timerRef.current = setInterval(load, REFRESH_MS)
    return () => clearInterval(timerRef.current)
  }, [projet, autoRefresh, load])

  const lignesRows = data?.lignes || []
  const creneaux = data?.creneaux || []

  const totauxParCreneau = creneaux.map((_, i) =>
    lignesRows.reduce((acc, l) => {
      const c = l.creneaux[i]
      acc.ok += c?.quantiteOK || 0
      acc.nok += c?.quantiteNOK || 0
      return acc
    }, { ok: 0, nok: 0 })
  )

  return (
    <>
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar" />
          <div className="header-title-group">
            <h2>Suivi Qualité par Shift</h2>
            <span className="header-subtitle">Quantités OK / NOK de coiffes par ligne de production, détail par créneau horaire du shift</span>
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
            Sélectionnez un projet pour afficher le suivi qualité par shift.
          </div>
        )}

        {projet && data && (
          <>
            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">
                  {data.projet}
                  <span className="badge-count" style={{ marginLeft: 8 }}>{lignesRows.length} ligne{lignesRows.length > 1 ? 's' : ''}</span>
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#64748b' }}>
                  <span>
                    {SHIFT_LABELS[data.shift] || data.shift} · {data.date}
                    {data.dateFin !== data.date ? ` → ${data.dateFin}` : ''}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
                    Maj {data.generatedAt?.slice(11, 19)}
                  </span>
                </div>
              </div>

              <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ minWidth: 260 + creneaux.length * 90 }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1, minWidth: 220 }}>Ligne</th>
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
                          <div style={{ marginTop: 5, fontSize: 11, color: '#64748b' }}>
                            OK&nbsp;<AnimatedNumber value={l.totalOK} /> · NOK&nbsp;<AnimatedNumber value={l.totalNOK} />
                          </div>
                        </td>
                        {l.creneaux.map(c => {
                          const s = RATIO_STYLE[ratioStatut(c.quantiteOK, c.quantiteNOK)]
                          return (
                            <td key={c.creneau} style={{ background: s.bg, textAlign: 'center', verticalAlign: 'middle', borderLeft: `1px solid ${s.border}` }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: s.text }}>
                                <AnimatedNumber value={c.quantiteOK} /> / <AnimatedNumber value={c.quantiteNOK} />
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                  {lignesRows.length > 0 && (
                    <tfoot>
                      <tr>
                        <td style={{ position: 'sticky', left: 0, background: '#f8fafc', fontWeight: 700 }}>
                          Total · OK&nbsp;<AnimatedNumber value={data.totalOKGlobal} /> · NOK&nbsp;<AnimatedNumber value={data.totalNOKGlobal} />
                        </td>
                        {totauxParCreneau.map((t, i) => (
                          <td key={creneaux[i]} style={{ textAlign: 'center', fontWeight: 700, background: '#f8fafc' }}>
                            {t.ok} / {t.nok}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Légende du taux de rebut */}
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginTop: 14, fontSize: 12, color: '#64748b' }}>
              <span style={{ fontWeight: 700, color: '#475569' }}>Cellule OK / NOK — taux de rebut :</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: RATIO_STYLE.VERT.bg, border: `1px solid ${RATIO_STYLE.VERT.border}` }} /> &lt; {Math.round(SEUIL_ORANGE * 100)}%</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: RATIO_STYLE.ORANGE.bg, border: `1px solid ${RATIO_STYLE.ORANGE.border}` }} /> {Math.round(SEUIL_ORANGE * 100)}% – {Math.round(SEUIL_ROUGE * 100)}%</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: RATIO_STYLE.ROUGE.bg, border: `1px solid ${RATIO_STYLE.ROUGE.border}` }} /> &gt; {Math.round(SEUIL_ROUGE * 100)}%</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: RATIO_STYLE.VIDE.bg, border: `1px solid ${RATIO_STYLE.VIDE.border}` }} /> Aucune coiffe scannée</span>
            </div>
          </>
        )}

        {projet && loading && !data && (
          <div className="loading"><div className="spinner" /></div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>
    </>
  )
}
