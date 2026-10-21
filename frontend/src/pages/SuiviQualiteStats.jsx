import { useCallback, useEffect, useRef, useState } from 'react'
import { Chart, registerables } from 'chart.js'
import { suiviQualiteStatsApi } from '../api/suiviQualiteStats.api.js'
import { projectsApi } from '../api/projects.api.js'
import { StatutBadge, STATUT_STYLE } from './SuiviQualite.jsx'

Chart.register(...registerables)
Chart.defaults.font.family = "'Inter', -apple-system, sans-serif"
Chart.defaults.font.size   = 12
Chart.defaults.color       = "#64748b"

const PALETTE = ["#15803d","#e8590c","#059669","#c92a2a","#e67700","#7c3aed","#0f766e","#475569","#0891b2","#be185d"]
const emptyStyle = { textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }
const STATUT_COLOR = { VERT: STATUT_STYLE.VERT.dot, ORANGE: STATUT_STYLE.ORANGE.dot, ROUGE: STATUT_STYLE.ROUGE.dot }

const SHIFT_LABELS = {
  MATIN: 'Matin (06h-14h)',
  APRES_MIDI: 'Après-midi (14h-22h)',
  SHIFT_1: 'Shift 1 (06h-16h)',
  SHIFT_2: 'Shift 2 (20h-06h)',
}
const GRANULARITE_GLOBALE_LABELS = { '': 'Auto', HEURE: 'Heure', JOUR: 'Jour', SEMAINE: 'Semaine' }
const GRANULARITE_PROJET_LABELS = { '': 'Auto', HEURE: 'Par heure', SHIFT: 'Par shift (8h)' }

function fmt(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Formate un bucket brut ("2026-07-01 14:00:00") selon la granularité effective renvoyée par le backend. */
function fmtBucket(bucket, granularite) {
  if (!bucket) return bucket
  const timePart = bucket.slice(11, 16)
  const hourPart = bucket.slice(11, 13)
  let d
  try { d = new Date(bucket.replace(' ', 'T')) } catch { return bucket }
  if (Number.isNaN(d.getTime())) return bucket
  const jourCourt = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  if (granularite === 'HEURE') return jourCourt + ' ' + timePart
  if (granularite === 'SHIFT') return jourCourt + ' ' + (hourPart === '06' ? 'Matin' : 'Après-midi')
  if (granularite === 'SEMAINE') return 'Sem. du ' + jourCourt
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
}

function useChart(ref, build, deps) {
  const inst = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    if (inst.current) { inst.current.destroy(); inst.current = null }
    const cfg = build(); if (!cfg) return
    inst.current = new Chart(ref.current, cfg)
    return () => { if (inst.current) { inst.current.destroy(); inst.current = null } }
  }, deps) // eslint-disable-line
}

export default function SuiviQualiteStats() {
  const today = fmt(new Date())
  const monthAgo = fmt(new Date(Date.now() - 29 * 86400000))

  const [projects, setProjects] = useState([])
  const [projet, setProjet] = useState('')
  const [lignesProjet, setLignesProjet] = useState([])
  const [ligne, setLigne] = useState('')
  const [dateDebut, setDateDebut] = useState(monthAgo)
  const [dateFin, setDateFin] = useState(today)
  const [granulariteGlobale, setGranulariteGlobale] = useState('')
  const [granulariteProjet, setGranulariteProjet] = useState('')
  const [shift, setShift] = useState('')
  const [tab, setTab] = useState('global')

  const [statsGlobal, setStatsGlobal] = useState(null)
  const [statsProjet, setStatsProjet] = useState(null)
  const [rapport, setRapport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exportingXlsx, setExportingXlsx] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  useEffect(() => {
    projectsApi.getProjects().then(d => setProjects(d?.projects || [])).catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    setLigne('')
    if (!projet) { setLignesProjet([]); return }
    projectsApi.getLignesProjet(projet).then(d => setLignesProjet(d?.lignes || [])).catch(() => setLignesProjet([]))
  }, [projet])

  const load = useCallback(() => {
    setLoading(true); setError('')

    const jobs = [
      suiviQualiteStatsApi.getStatsGlobal({ dateDebut, dateFin, granularite: granulariteGlobale || undefined })
        .then(setStatsGlobal).catch(() => setStatsGlobal(null)),
    ]
    if (projet) {
      jobs.push(suiviQualiteStatsApi.getStatsProjet({
        projet, ligne, dateDebut, dateFin, granularite: granulariteProjet || undefined, shift: shift || undefined,
      }).then(setStatsProjet).catch(() => setStatsProjet(null)))
      jobs.push(suiviQualiteStatsApi.getRapport({ projet, dateDebut, dateFin, shift: shift || undefined }).then(setRapport).catch(e => {
        setRapport(null)
        setError(e.response?.data?.error || e.response?.data?.message || e.message)
      }))
    } else {
      setStatsProjet(null); setRapport(null)
    }
    Promise.all(jobs).finally(() => setLoading(false))
  }, [projet, ligne, dateDebut, dateFin, granulariteGlobale, granulariteProjet, shift])

  useEffect(() => { load() }, [load])

  const rGlobal = useRef(), rProjetLigne = useRef(), rProjetBar = useRef()

  useChart(rGlobal, () => {
    if (!statsGlobal?.series?.length) return null
    const labels = statsGlobal.buckets.map(b => fmtBucket(b, statsGlobal.granulariteEffective))
    return {
      type: 'line',
      data: { labels, datasets: statsGlobal.series.map((s, i) => ({
        label: s.cle, data: s.valeurs, borderColor: PALETTE[i % PALETTE.length],
        backgroundColor: PALETTE[i % PALETTE.length] + '12', borderWidth: 2.5, tension: .4,
        fill: false, pointRadius: labels.length > 30 ? 0 : 3,
      })) },
      options: { responsive: true, plugins: { legend: { position: 'top', labels: { boxWidth: 10, padding: 14, usePointStyle: true } }, tooltip: { mode: 'index', intersect: false } },
        scales: { x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 14 } }, y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { precision: 0 } } } },
    }
  }, [JSON.stringify(statsGlobal), tab])

  // Quantité contrôlée vs Limite, par ligne : une barre par bucket, colorée VERT/ORANGE/ROUGE selon
  // le ratio quantité/limite de ce bucket précis (même logique que le dashboard temps réel).
  useChart(rProjetLigne, () => {
    if (!statsProjet?.series?.length) return null
    const labels = statsProjet.buckets.map(b => fmtBucket(b, statsProjet.granulariteEffective))
    return {
      type: 'bar',
      data: { labels, datasets: statsProjet.series.map(s => ({
        label: s.cle, data: s.valeurs,
        backgroundColor: s.statuts.map(st => STATUT_COLOR[st] || '#94a3b8'),
        borderRadius: 3, borderSkipped: false,
        limites: s.limites, // conservé pour le tooltip (non standard Chart.js, lu via ctx.dataset)
      })) },
      options: { responsive: true,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 10, padding: 14, usePointStyle: true } },
          tooltip: { callbacks: { label: ctx => {
            const lim = ctx.dataset.limites?.[ctx.dataIndex]
            return ` ${ctx.dataset.label} — Quantité: ${ctx.formattedValue}${lim != null ? ` / Limite: ${lim}` : ''}`
          } } },
        },
        scales: { x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 14 } }, y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { precision: 0 } } },
      },
    }
  }, [JSON.stringify(statsProjet), tab])

  // Comparatif agrégé : quantité totale vs Limite totale par ligne, sur toute la période sélectionnée.
  useChart(rProjetBar, () => {
    if (!statsProjet?.series?.length) return null
    const labels = statsProjet.series.map(s => s.cle)
    const totauxQte = statsProjet.series.map(s => s.valeurs.reduce((a, b) => a + b, 0))
    const totauxLimite = statsProjet.series.map(s => s.limites.reduce((a, b) => a + b, 0))
    return {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Quantité contrôlée', data: totauxQte, backgroundColor: '#15803d', borderRadius: 5, borderSkipped: false },
        { label: 'Limite', data: totauxLimite, backgroundColor: '#cbd5e1', borderRadius: 5, borderSkipped: false },
      ] },
      options: { responsive: true, plugins: { legend: { position: 'top', labels: { boxWidth: 10, padding: 14, usePointStyle: true } } },
        scales: { x: { grid: { display: false }, border: { display: false } }, y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { precision: 0 } } } },
    }
  }, [JSON.stringify(statsProjet), tab])

  const handleExport = async (kind) => {
    if (!projet) return
    const setter = kind === 'xlsx' ? setExportingXlsx : setExportingPdf
    setter(true)
    try {
      const resp = kind === 'xlsx'
        ? await suiviQualiteStatsApi.exportExcel({ projet, dateDebut, dateFin, shift: shift || undefined })
        : await suiviQualiteStatsApi.exportPdf({ projet, dateDebut, dateFin, shift: shift || undefined })
      const mime = kind === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'
      const url = URL.createObjectURL(new Blob([resp.data], { type: mime }))
      const a = document.createElement('a')
      a.href = url
      a.download = `rapport_qualite_${projet}_${dateDebut}_${dateFin}.${kind}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { alert('Erreur export: ' + e.message) }
    finally { setter(false) }
  }

  const TABS = [
    { id: 'global', label: 'Vue globale' },
    { id: 'projet', label: 'Vue projet', disabled: !projet },
    { id: 'rapport', label: 'Rapport', disabled: !projet },
  ]

  const kpis = rapport?.kpis
  const alertes = rapport?.alertes || []

  return (
    <>
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar" />
          <div className="header-title-group">
            <h2>Statistiques Qualité</h2>
            <span className="header-subtitle">Suivi Qualité des Coiffes — évolution des quantités avec défauts par rapport à la Limite</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', padding: '16px 28px', background: '#fafbff', borderBottom: '1px solid #f1f5f9' }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Projet</label>
          <select className="form-input" style={{ minWidth: 180 }} value={projet} onChange={e => { setProjet(e.target.value); setTab('global') }}>
            <option value="">Tous (vue globale)</option>
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
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Du</label>
          <input type="date" className="form-input" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Au</label>
          <input type="date" className="form-input" value={dateFin} onChange={e => setDateFin(e.target.value)} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Granularité (globale)</label>
          <select className="form-input" style={{ minWidth: 130 }} value={granulariteGlobale} onChange={e => setGranulariteGlobale(e.target.value)}>
            {Object.entries(GRANULARITE_GLOBALE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Granularité (par ligne, vs Limite)</label>
          <select className="form-input" style={{ minWidth: 170 }} value={granulariteProjet} onChange={e => setGranulariteProjet(e.target.value)} disabled={!projet}>
            {Object.entries(GRANULARITE_PROJET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Shift</label>
          <select className="form-input" style={{ minWidth: 170 }} value={shift} onChange={e => setShift(e.target.value)} disabled={!projet}>
            <option value="">Tous les shifts</option>
            {Object.keys(SHIFT_LABELS).map(s => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
          </select>
        </div>
        <button className="add-btn" onClick={load} disabled={loading} style={{ marginLeft: 'auto' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.92"/></svg>
          {loading ? 'Actualisation…' : 'Actualiser'}
        </button>
      </div>

      <div className="rp-tabs" style={{ padding: '0 28px' }}>
        {TABS.map(t => (
          <button key={t.id} className={'rp-tab' + (tab === t.id ? ' active' : '')} disabled={t.disabled}
                  onClick={() => !t.disabled && setTab(t.id)} title={t.disabled ? 'Sélectionnez un projet' : undefined}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '20px 28px 48px' }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        {tab === 'global' && (
          <div className="rp-chart-card">
            <div className="rp-chart-head">
              <div>
                <div className="rp-chart-title">Évolution des quantités avec défauts — tous projets</div>
                <div className="rp-chart-sub">Volume brut de coiffes avec défaut, comparé entre projets (sans Limite — la Limite n'existe qu'au niveau d'un projet). Granularité : {statsGlobal?.granulariteEffective || '—'}</div>
              </div>
            </div>
            {!statsGlobal?.series?.length
              ? <div style={emptyStyle}>{loading ? 'Chargement…' : 'Aucune donnée sur la période sélectionnée'}</div>
              : <canvas ref={rGlobal} height={90}></canvas>}
          </div>
        )}

        {tab === 'projet' && (
          <div className="rp-gap" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="rp-chart-card">
              <div className="rp-chart-head">
                <div>
                  <div className="rp-chart-title">Quantité avec défauts vs Limite, par ligne — {projet}</div>
                  <div className="rp-chart-sub">Une barre par {statsProjet?.granulariteEffective === 'SHIFT' ? 'shift (8h)' : 'heure'}, colorée selon le statut (vert = sous contrôle, orange = zone d'alerte, rouge = Limite dépassée)</div>
                </div>
              </div>
              {!statsProjet?.series?.length
                ? <div style={emptyStyle}>{loading ? 'Chargement…' : 'Aucune donnée sur la période sélectionnée'}</div>
                : <>
                    <canvas ref={rProjetLigne} height={90}></canvas>
                    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14, fontSize: 12, color: '#64748b' }}>
                      <span style={{ fontWeight: 700, color: '#475569' }}>Statut :</span>
                      <span><StatutBadge statut="VERT" /> sous contrôle</span>
                      <span><StatutBadge statut="ORANGE" /> zone d'alerte</span>
                      <span><StatutBadge statut="ROUGE" /> Limite dépassée</span>
                    </div>
                  </>}
            </div>
            <div className="rp-chart-card">
              <div className="rp-chart-head"><div><div className="rp-chart-title">Comparatif — Quantité avec défauts vs Limite, total par ligne</div><div className="rp-chart-sub">Somme sur toute la période sélectionnée</div></div></div>
              {!statsProjet?.series?.length
                ? <div style={emptyStyle}>Aucune donnée</div>
                : <canvas ref={rProjetBar} height={100}></canvas>}
            </div>
          </div>
        )}

        {tab === 'rapport' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="add-btn" onClick={() => handleExport('xlsx')} disabled={exportingXlsx || !rapport}
                      style={{ background: 'linear-gradient(135deg,#059669,#0891b2)' }}>
                {exportingXlsx ? 'Export…' : 'Exporter Excel'}
              </button>
              <button className="add-btn" onClick={() => handleExport('pdf')} disabled={exportingPdf || !rapport}
                      style={{ background: 'linear-gradient(135deg,#c92a2a,#e8590c)' }}>
                {exportingPdf ? 'Export…' : 'Exporter PDF'}
              </button>
            </div>

            {!kpis && !loading && <div style={emptyStyle}>Aucune donnée sur la période sélectionnée</div>}

            {kpis && (
              <div className="rp-kpi-grid">
                <div className="rp-kpi-card fw">
                  <div className="rp-kpi-top"><div className="rp-kpi-label">Total contrôlé</div></div>
                  <div className="rp-kpi-value">{kpis.totalControle.toLocaleString('fr-FR')}</div>
                </div>
                <div className="rp-kpi-card csl">
                  <div className="rp-kpi-top"><div className="rp-kpi-label">Créneaux évalués</div></div>
                  <div className="rp-kpi-value">{kpis.nbCreneauxEvalues.toLocaleString('fr-FR')}</div>
                </div>
                <div className="rp-kpi-card nret">
                  <div className="rp-kpi-top"><div className="rp-kpi-label">Dépassements</div></div>
                  <div className="rp-kpi-value">{kpis.nbDepassements.toLocaleString('fr-FR')}</div>
                </div>
                <div className="rp-kpi-card ret">
                  <div className="rp-kpi-top"><div className="rp-kpi-label">Taux de dépassement</div></div>
                  <div className="rp-kpi-value">{kpis.tauxDepassement != null ? `${kpis.tauxDepassement}%` : '—'}</div>
                  <div className="rp-kpi-period">{kpis.ligneCritique ? `Ligne critique : ${kpis.ligneCritique}` : ''}</div>
                </div>
              </div>
            )}

            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">Alertes — dépassements de Limite<span className="badge-count" style={{ marginLeft: 8 }}>{alertes.length}</span></h3>
                <div style={{ fontSize: 12, color: '#64748b' }}>Triées par criticité (écart le plus négatif en premier), toujours détectées au grain HEURE</div>
              </div>
              <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Ligne</th><th>Jour</th><th>Créneau</th><th style={{ textAlign: 'right' }}>Quantité</th><th style={{ textAlign: 'right' }}>Limite</th><th style={{ textAlign: 'right' }}>Écart</th><th>Statut</th></tr>
                  </thead>
                  <tbody>
                    {alertes.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                        {loading ? 'Chargement…' : 'Aucun dépassement détecté sur la période'}
                      </td></tr>
                    )}
                    {alertes.map((a, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>{a.ligne}</td>
                        <td>{a.jour}</td>
                        <td>{a.creneau}</td>
                        <td style={{ textAlign: 'right' }}>{a.quantite}</td>
                        <td style={{ textAlign: 'right' }}>{a.limite}</td>
                        <td style={{ textAlign: 'right', color: '#b91c1c', fontWeight: 700 }}>{a.ecart}</td>
                        <td><StatutBadge statut={a.statut} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .rp-tabs{display:flex;border-bottom:2px solid #e8ecf5;gap:2px}
        .rp-tab{display:inline-flex;align-items:center;gap:7px;padding:12px 20px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#64748b;border-bottom:2.5px solid transparent;margin-bottom:-2px;transition:color .15s,border-color .15s,background .15s;border-radius:10px 10px 0 0}
        .rp-tab:hover:not(:disabled){color:#15803d;background:rgba(21,128,61,.04)}
        .rp-tab.active{color:#15803d;border-bottom-color:#15803d;background:rgba(21,128,61,.05)}
        .rp-tab:disabled{opacity:.4;cursor:not-allowed}

        .rp-chart-card{background:#fff;border:1px solid #e8ecf5;border-radius:16px;padding:22px 24px;box-shadow:0 2px 8px rgba(0,0,0,.04)}
        .rp-chart-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px}
        .rp-chart-title{font-size:14px;font-weight:700;color:#0f172a}.rp-chart-sub{font-size:11px;color:#94a3b8;margin-top:2px}

        .rp-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
        .rp-kpi-card{background:#fff;border:1px solid #e8ecf5;border-radius:16px;padding:18px 20px;position:relative;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.05)}
        .rp-kpi-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:16px 0 0 16px}
        .rp-kpi-card.fw::before{background:linear-gradient(180deg,#15803d,#5b21b6)}.rp-kpi-card.csl::before{background:linear-gradient(180deg,#e8590c,#f59f00)}.rp-kpi-card.ret::before{background:linear-gradient(180deg,#059669,#0891b2)}.rp-kpi-card.nret::before{background:linear-gradient(180deg,#c92a2a,#be185d)}
        .rp-kpi-label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px}
        .rp-kpi-value{font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700;color:#0f172a;letter-spacing:-1px;line-height:1;margin-top:10px}
        .rp-kpi-period{font-size:10px;color:#94a3b8;margin-top:6px}

        @media(max-width:1100px){.rp-kpi-grid{grid-template-columns:1fr 1fr}}
        @media(max-width:700px){.rp-kpi-grid{grid-template-columns:1fr}}
        .header-title-group h2{font-size:16px;font-weight:700;color:#0f172a;margin:0}.header-subtitle{font-size:12px;color:#94a3b8}
      `}</style>
    </>
  )
}
