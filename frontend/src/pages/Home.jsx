import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Chart, registerables } from 'chart.js'
import { dashboardApi } from '../api/dashboard.api.js'
import { deliberaApi } from '../api/delibera.api.js'
import { lookupApi } from '../api/lookup.api.js'
import { projectsApi } from '../api/projects.api.js'
import Reports from './Reports.jsx'
import ProductionTempsReel from './ProductionTempsReel.jsx'
import DeliberaDashboard from './DeliberaDashboard.jsx'
import './Home.css'

Chart.register(...registerables)
Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
Chart.defaults.font.size   = 12
Chart.defaults.color       = "#64748b"

const PROJ  = ["#15803d","#e8590c","#059669","#dc2626","#d97706","#7c3aed","#0f766e","#475569","#0891b2","#be185d"]
const DELIB = ["#7c3aed","#8b5cf6","#a78bfa","#6d28d9","#4c1d95","#5b21b6","#7e22ce","#9333ea","#c026d3","#db2777"]
const FW    = "#15803d"
const CSL   = "#e8590c"

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function useChart(canvasRef, buildConfig, deps) {
  const chartRef = useRef(null)
  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    const cfg = buildConfig()
    if (!cfg) return
    chartRef.current = new Chart(canvasRef.current, cfg)
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams()
  const today = fmt(new Date())
  const [filters, setFilters] = useState({ date1: today, date2: today, projet: '', coddef: '', superviseur: '' })
  const [data, setData]       = useState(null)
  const [deliberaOverview, setDeliberaOverview] = useState({ total: 0, trend: {} })
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [projects, setProjects]   = useState([])
  const [defCodes, setDefCodes]   = useState([])
  const [supervisors, setSupervisors] = useState([])
  const [clock, setClock]     = useState(() => new Date().toLocaleTimeString('fr-FR'))

  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toLocaleTimeString('fr-FR')), 1000)
    return () => clearInterval(id)
  }, [])

  // Chart canvas refs
  const refDefCode  = useRef(); const refRef    = useRef()
  const refSV       = useRef(); const refPoste  = useRef()
  const refDate     = useRef(); const refDelib  = useRef()

  useEffect(() => {
    Promise.all([
      projectsApi.getProjects().catch(() => ({ projects: [] })),
      lookupApi.defCodes().catch(() => ({ codes: [] })),
      lookupApi.supervisors().catch(() => ({ supervisors: [] })),
    ]).then(([p, d, s]) => {
      const projNames = p?.projects?.map(x => (x.name || x || '').toUpperCase()) || []
      setProjects([...new Set(projNames)].filter(Boolean))
      setDefCodes(d?.codes || [])
      setSupervisors(s?.supervisors || [])
    })
  }, [])

  const loadData = useCallback((f = filters) => {
    setLoading(true)
    setLoadError('')
    Promise.all([
      dashboardApi.filtered(f),
      deliberaApi.getDashboardOverview({
        projet: f.projet,
        dateFrom: f.date1,
        dateTo: f.date2,
      }),
    ])
      .then(([dashboard, delibera]) => {
        setData(dashboard)
        setDeliberaOverview(delibera)
      })
      .catch(error => setLoadError(error.message || 'Impossible de charger les données du dashboard.'))
      .finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setF = (key, val) => setFilters(f => ({ ...f, [key]: val }))

  // ── Charts ────────────────────────────────────────────────────────────────────
  const barH = (labels, values, label) => ({
    type: 'bar',
    data: { labels, datasets: [{ label, data: values, backgroundColor: labels.map((_,i) => PROJ[i%PROJ.length]), borderRadius: 4, borderSkipped: false }] },
    options: { indexAxis: 'y', responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${Number(ctx.raw).toLocaleString()}` } } },
      scales: { x: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { precision: 0 } }, y: { grid: { display: false }, border: { display: false } } } },
  })
  const barV = (labels, values, label) => ({
    type: 'bar',
    data: { labels: labels.map(l => l.length > 12 ? l.slice(0, 12) + '…' : l), datasets: [{ label, data: values, backgroundColor: labels.map((_,i) => PROJ[i%PROJ.length]), borderRadius: 5, borderSkipped: false }] },
    options: { responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: (items) => labels[items[0].dataIndex] || '',
          label: ctx => ` ${Number(ctx.raw).toLocaleString()}`,
        }},
      },
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 30, minRotation: 0 } }, y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { precision: 0 } } } },
  })

  const byDefCode   = data?.byDefCode  || {}
  const byRef       = data?.byRef      || {}
  const bySV        = data?.bySV       || {}
  const byPoste     = data?.byPoste    || {}
  const trend       = data?.trend      || {}
  const byDelibera  = data?.byDelibera || {}
  const deliberaTrend = deliberaOverview.trend || {}

  useChart(refDefCode, () => {
    const keys = Object.keys(byDefCode); if (!keys.length) return null
    return barH(keys, Object.values(byDefCode), 'Occurrences')
  }, [JSON.stringify(byDefCode)])

  useChart(refRef, () => {
    const keys = Object.keys(byRef); if (!keys.length) return null
    return barV(keys, Object.values(byRef), 'Pièces')
  }, [JSON.stringify(byRef)])

  useChart(refSV, () => {
    const keys = Object.keys(bySV); if (!keys.length) return null
    return barH(keys, Object.values(bySV), 'Scans')
  }, [JSON.stringify(bySV)])

  useChart(refPoste, () => {
    const keys = Object.keys(byPoste); if (!keys.length) return null
    return barV(keys, Object.values(byPoste), 'Scans')
  }, [JSON.stringify(byPoste)])

  useChart(refDate, () => {
    const dates = [...new Set([...Object.keys(trend), ...Object.keys(deliberaTrend)])].sort()
    const entries = dates.map(date => [date, trend[date] || {}])
    if (!entries.length) return null
    const labels  = entries.map(([d]) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))
    const fwData  = entries.map(([,v]) => v.fw  || 0)
    const cslData = entries.map(([,v]) => v.csl || 0)
    const deliberaData = entries.map(([date]) => deliberaTrend[date] || 0)
    return {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Firewall', data: fwData,  backgroundColor: FW,  borderRadius: 4, borderSkipped: false },
        { label: 'CSL',      data: cslData, backgroundColor: CSL, borderRadius: 4, borderSkipped: false },
        { label: 'Délibéra', data: deliberaData, backgroundColor: DELIB[0], borderRadius: 4, borderSkipped: false },
      ]},
      options: { responsive: true,
        plugins: { legend: { position: 'top', labels: { boxWidth: 10, padding: 12, usePointStyle: true } }, tooltip: { mode: 'index', intersect: false } },
        scales: { x: { grid: { display: false }, border: { display: false } }, y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { precision: 0 } } } },
    }
  }, [JSON.stringify(trend), JSON.stringify(deliberaTrend)])

  useChart(refDelib, () => {
    const entries = Object.entries(byDelibera).sort(([,a],[,b]) => b - a)
    if (!entries.length) return null
    return {
      type: 'bar',
      data: { labels: entries.map(([k]) => k), datasets: [{ label: 'Pièces', data: entries.map(([,v]) => v), backgroundColor: entries.map((_,i) => DELIB[i%DELIB.length]), borderRadius: 4, borderSkipped: false }] },
      options: { indexAxis: 'y', responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { precision: 0 } }, y: { grid: { display: false }, border: { display: false } } } },
    }
  }, [JSON.stringify(byDelibera)])

  const [homeTab, setHomeTab] = useState(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    return ['dashboard', 'production', 'rapports', 'delibera'].includes(tab) ? tab : 'dashboard'
  })

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && ['dashboard', 'production', 'rapports', 'delibera'].includes(tab)) setHomeTab(tab)
    else if (!tab) setHomeTab('dashboard')
  }, [searchParams])

  const changeHomeTab = (tab) => {
    setHomeTab(tab)
    setSearchParams(tab === 'dashboard' ? {} : { tab })
  }

  const totals = data?.totals || {}
  const fwVal  = totals.fw  || 0
  const cslVal = totals.csl || 0
  const deliberaVal = deliberaOverview.total || 0
  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <>
      {/* Header */}
      <div className="header global-dashboard-header">
        <div className="header-left">
          <div className="header-accent-bar"></div>
          <div className="header-title-group">
            <h2>Global dashboard</h2>
            <span className="header-subtitle">{dateLabel}</span>
          </div>
        </div>
        <div className="header-right global-dashboard-clock">
          <div className="hbadge hbadge-clock">
            <span className="hbadge-clock-dot"></span>
            <span>{clock}</span>
          </div>
        </div>
      </div>

      <nav className="global-dashboard-tabs" aria-label="Vues du dashboard">
        {[
          { key: 'dashboard', label: 'Vue générale' },
          { key: 'production', label: 'Production temps réel' },
          { key: 'rapports', label: 'Rapports BI' },
          { key: 'delibera', label: 'Délibéra horaire' },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={homeTab === tab.key}
            className={`global-dashboard-tab${homeTab === tab.key ? ' active' : ''}`}
            onClick={() => changeHomeTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {homeTab === 'production' && <ProductionTempsReel />}
      {homeTab === 'rapports' && <Reports />}
      {homeTab === 'delibera' && <DeliberaDashboard />}

      {/* Filtre + Graphiques — uniquement sur l'onglet dashboard */}
      {homeTab === 'dashboard' && <>

      {loadError && <div role="alert" style={{ margin:'12px 28px 0', padding:'10px 14px', borderRadius:8,
        background:'#fef2f2', color:'#b91c1c', fontSize:13 }}>{loadError}</div>}

      {/* Filter Bar */}
      <div className="dash-filter-bar">
        <div className="dash-filter-group">
          <label className="dash-filter-label">Projet</label>
          <select className="dash-filter-select" value={filters.projet} onChange={e => setF('projet', e.target.value)}>
            <option value="">Tous</option>
            {projects.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="dash-filter-group">
          <label className="dash-filter-label">Code DEF</label>
          <select className="dash-filter-select" value={filters.coddef} onChange={e => setF('coddef', e.target.value)}>
            <option value="">Tous</option>
            {defCodes.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="dash-filter-group">
          <label className="dash-filter-label">Superviseur</label>
          <select className="dash-filter-select" value={filters.superviseur} onChange={e => setF('superviseur', e.target.value)}>
            <option value="">Tous</option>
            {supervisors.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <span className="dash-filter-sep">|</span>
        <div className="dash-filter-group">
          <label className="dash-filter-label">Date 1</label>
          <input type="date" className="dash-filter-date" value={filters.date1} onChange={e => setF('date1', e.target.value)} />
          {filters.date1 === today && <span className="dash-date-today-tag">Aujourd'hui</span>}
        </div>
        <div className="dash-filter-group">
          <label className="dash-filter-label">Date 2</label>
          <input type="date" className="dash-filter-date" value={filters.date2} onChange={e => setF('date2', e.target.value)} />
        </div>
        <button className="dash-filter-apply" onClick={() => loadData(filters)} disabled={loading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.92"/></svg>
          {loading ? 'Chargement…' : 'Actualiser'}
        </button>
        <button className="dash-filter-reset" onClick={() => { const f = { date1: today, date2: today, projet: '', coddef: '', superviseur: '' }; setFilters(f); loadData(f) }}>↺ Reset</button>
      </div>

      {/* KPI Strip */}
      <div className="dash-kpi-strip">
        <div className="dash-kpi-pill">
          <span className="dash-kpi-pill-dot fw"></span>
          <div>
            <div className={`dash-kpi-pill-val${loading ? ' loading' : ''}`}>{loading ? '–' : fwVal.toLocaleString('fr-FR')}</div>
            <div className="dash-kpi-pill-lbl">Firewall</div>
          </div>
        </div>
        <div className="dash-kpi-pill">
          <span className="dash-kpi-pill-dot csl"></span>
          <div>
            <div className={`dash-kpi-pill-val${loading ? ' loading' : ''}`}>{loading ? '–' : cslVal.toLocaleString('fr-FR')}</div>
            <div className="dash-kpi-pill-lbl">CSL</div>
          </div>
        </div>
        <div className="dash-kpi-pill">
          <span className="dash-kpi-pill-dot delibera"></span>
          <div>
            <div className={`dash-kpi-pill-val${loading ? ' loading' : ''}`}>{loading ? '–' : deliberaVal.toLocaleString('fr-FR')}</div>
            <div className="dash-kpi-pill-lbl">Délibéra</div>
          </div>
        </div>
        <div className="dash-kpi-pill">
          <span className="dash-kpi-pill-dot total"></span>
          <div>
            <div className={`dash-kpi-pill-val${loading ? ' loading' : ''}`}>{loading ? '–' : (fwVal + cslVal + deliberaVal).toLocaleString('fr-FR')}</div>
            <div className="dash-kpi-pill-lbl">Total scans</div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="dash-content">
        {/* Row 1: Par Code Défaut | Par Ref */}
        <div className="dash-charts-2col">
          <div className="dash-chart-card">
            <div className="dash-chart-title">Par Code Défaut</div>
            <div className="dash-chart-sub">Top occurrences</div>
            {Object.keys(byDefCode).length === 0 && !loading
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>Aucune donnée</div>
              : <canvas ref={refDefCode} height={200}></canvas>}
          </div>
          <div className="dash-chart-card">
            <div className="dash-chart-title">Par Référence</div>
            <div className="dash-chart-sub">Top références</div>
            {Object.keys(byRef).length === 0 && !loading
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>Aucune donnée</div>
              : <canvas ref={refRef} height={200}></canvas>}
          </div>
        </div>

        {/* Row 2: Par Superviseur | Par Poste */}
        <div className="dash-charts-2col">
          <div className="dash-chart-card">
            <div className="dash-chart-title">Par Superviseur</div>
            <div className="dash-chart-sub">Scans par SV</div>
            {Object.keys(bySV).length === 0 && !loading
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>Aucune donnée</div>
              : <canvas ref={refSV} height={200}></canvas>}
          </div>
          <div className="dash-chart-card">
            <div className="dash-chart-title">Par Poste</div>
            <div className="dash-chart-sub">Scans par poste</div>
            {Object.keys(byPoste).length === 0 && !loading
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>Aucune donnée</div>
              : <canvas ref={refPoste} height={200}></canvas>}
          </div>
        </div>

        {/* Row 3: Par Date */}
        <div className="dash-chart-card">
          <div className="dash-chart-title">Par Date</div>
          <div className="dash-chart-sub">Firewall, CSL &amp; Délibéra par jour</div>
          {Object.keys(trend).length === 0 && Object.keys(deliberaTrend).length === 0 && !loading
            ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>Aucune donnée</div>
            : <canvas ref={refDate} height={120}></canvas>}
        </div>

        {/* Row 4: Par CQ Délibéra */}
        <div className="dash-chart-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <div className="dash-chart-title">Par CQ Délibéra</div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: 'rgba(124,58,237,.08)', color: '#7c3aed', border: '1px solid rgba(124,58,237,.2)', textTransform: 'uppercase', letterSpacing: '.5px' }}>CQDELIBERA</span>
          </div>
          <div className="dash-chart-sub">Distribution des valeurs CQ Délibéra</div>
          {Object.keys(byDelibera).length === 0 && !loading
            ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>Aucune donnée</div>
            : <canvas ref={refDelib} height={120}></canvas>}
        </div>
      </div>

      {/* Inline styles — enterprise light dashboard */}
      <style>{`
        /* ── Filter bar ── */
        .dash-filter-bar {
          display:flex; align-items:center; gap:10px; flex-wrap:wrap;
          padding:12px 28px; background:#fff;
          border-bottom:1px solid #f1f5f9;
        }
        .dash-filter-group { display:flex; align-items:center; gap:6px; }
        .dash-filter-label {
          font-size:10px; font-weight:700; color:#64748b;
          text-transform:uppercase; letter-spacing:.7px; white-space:nowrap;
        }
        .dash-filter-select, .dash-filter-date {
          padding:6px 12px; border:1.5px solid #e2e8f0; border-radius:20px;
          font-size:12.5px; color:#1e293b; outline:none;
          background:#f8fafc; cursor:pointer;
          transition:all .18s; font-family:inherit; font-weight:500;
          min-width:100px;
        }
        .dash-filter-select:hover, .dash-filter-date:hover {
          border-color:#cbd5e1; background:#fff;
        }
        .dash-filter-select:focus, .dash-filter-date:focus {
          border-color:#15803d; background:#fff;
          box-shadow:0 0 0 3px rgba(21,128,61,.1);
        }
        .dash-filter-sep { color:#e2e8f0; font-size:20px; padding:0 4px; }
        .dash-filter-apply {
          display:inline-flex; align-items:center; gap:7px;
          padding:7px 18px; background:#15803d;
          color:#fff; border:none; border-radius:9px; cursor:pointer;
          font-size:13px; font-weight:600; transition:all .18s;
          box-shadow:0 2px 8px rgba(21,128,61,.3); font-family:inherit;
          white-space:nowrap;
        }
        .dash-filter-apply:hover {
          background:#166534; transform:translateY(-1px);
          box-shadow:0 4px 14px rgba(21,128,61,.38);
        }
        .dash-filter-apply:disabled { opacity:.6; cursor:not-allowed; transform:none; }
        .dash-filter-apply svg { width:13px; height:13px; }
        .dash-filter-reset {
          padding:7px 14px; background:transparent; color:#64748b;
          border:1.5px solid #e2e8f0; border-radius:9px; cursor:pointer;
          font-size:13px; font-weight:500; transition:all .18s; font-family:inherit;
          white-space:nowrap;
        }
        .dash-filter-reset:hover { background:#f8fafc; border-color:#cbd5e1; color:#475569; }
        .dash-date-today-tag {
          font-size:9px; font-weight:700; padding:2px 7px; border-radius:99px;
          background:rgba(21,128,61,.08); color:#15803d;
          border:1px solid rgba(21,128,61,.18);
          text-transform:uppercase; letter-spacing:.5px;
        }

        /* ── KPI strip ── */
        .dash-kpi-strip { display:flex; gap:14px; padding:20px 28px 0; flex-wrap:wrap; }
        .dash-kpi-pill {
          display:flex; align-items:center; gap:16px;
          background:#fff; border:1px solid #e8edf5;
          border-left:4px solid transparent;
          border-radius:14px; padding:16px 20px;
          flex:1; min-width:155px;
          box-shadow:0 1px 3px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.03);
          transition:transform .2s, box-shadow .2s; cursor:default;
          position:relative;
        }
        .dash-kpi-pill:nth-child(1) { border-left-color:#15803d; }
        .dash-kpi-pill:nth-child(2) { border-left-color:#ea580c; }
        .dash-kpi-pill:nth-child(3) { border-left-color:#7c3aed; }
        .dash-kpi-pill:nth-child(4) { border-left-color:#059669; }
        .dash-kpi-pill:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,.09); }

        .dash-kpi-pill-dot {
          width:10px; height:10px; border-radius:50%; flex-shrink:0;
        }
        .dash-kpi-pill-dot.fw    { background:#15803d; box-shadow:0 0 8px rgba(21,128,61,.55); }
        .dash-kpi-pill-dot.csl   { background:#ea580c; box-shadow:0 0 8px rgba(234,88,12,.5); }
        .dash-kpi-pill-dot.delibera { background:#7c3aed; box-shadow:0 0 8px rgba(124,58,237,.5); }
        .dash-kpi-pill-dot.total { background:#059669; box-shadow:0 0 8px rgba(5,150,105,.5); }

        .dash-kpi-pill-val {
          font-family:'JetBrains Mono',monospace;
          font-size:30px; font-weight:700; color:#1e293b; line-height:1;
          letter-spacing:-1px;
        }
        .dash-kpi-pill-lbl {
          font-size:10.5px; font-weight:700; color:#94a3b8;
          text-transform:uppercase; letter-spacing:.8px; margin-top:5px;
        }
        .dash-kpi-pill-val.loading { color:#e8ecf5; animation:kpiPulse 1.2s infinite; }
        @keyframes kpiPulse { 0%,100%{opacity:1} 50%{opacity:.35} }

        /* ── Charts ── */
        .dash-content { padding:20px 28px 32px; display:flex; flex-direction:column; gap:16px; }
        .dash-charts-2col { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .dash-chart-card {
          background:#fff; border-radius:14px;
          border:1px solid #e8edf5; padding:20px 22px;
          box-shadow:0 1px 3px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.03);
          transition:box-shadow .2s;
        }
        .dash-chart-card:hover { box-shadow:0 4px 18px rgba(0,0,0,.08); }
        .dash-chart-title {
          font-size:13.5px; font-weight:700; color:#1e293b; margin-bottom:2px;
          letter-spacing:-0.1px;
        }
        .dash-chart-sub { font-size:11px; color:#94a3b8; font-weight:500; margin-bottom:16px; }
        @media (max-width:900px) { .dash-charts-2col { grid-template-columns:1fr; } }

        /* ── Live clock ── */
        .hbadge.hbadge-clock {
          display:inline-flex; align-items:center; gap:7px;
          padding:5px 13px; border-radius:20px;
          background:rgba(21,128,61,.07); border:1px solid rgba(21,128,61,.18);
          font-size:13px; font-weight:600; color:#15803d;
          font-family:'JetBrains Mono',monospace; letter-spacing:0.5px;
        }
        .hbadge-clock-dot {
          width:7px; height:7px; border-radius:50%;
          background:#059669;
          box-shadow:0 0 6px rgba(5,150,105,.7);
          animation:pulseDot 2s ease-in-out infinite;
        }
        @keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.3)} }

        .header-title-group h2 {
          font-size:17px !important; font-weight:700 !important;
          color:#1e293b !important; margin:0 !important; letter-spacing:-0.2px !important;
        }
        .header-subtitle { font-size:11.5px; color:#94a3b8; }
      `}</style>
      </> /* end homeTab === 'dashboard' */}
      {/* Styles hors onglet, toujours présents */}
      <style>{`
        .hbadge.hbadge-clock { display:inline-flex; align-items:center; gap:7px; padding:5px 13px; border-radius:20px; background:rgba(21,128,61,.07); border:1px solid rgba(21,128,61,.18); font-size:13px; font-weight:600; color:#15803d; font-family:'JetBrains Mono',monospace; letter-spacing:0.5px; }
        .hbadge-clock-dot { width:7px; height:7px; border-radius:50%; background:#059669; box-shadow:0 0 6px rgba(5,150,105,.7); animation:pulseDot 2s ease-in-out infinite; }
        @keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.3)} }
        .header-title-group h2 { font-size:17px !important; font-weight:700 !important; color:#1e293b !important; margin:0 !important; letter-spacing:-0.2px !important; }
        .header-subtitle { font-size:11.5px; color:#94a3b8; }
      `}</style>
    </>
  )
}
