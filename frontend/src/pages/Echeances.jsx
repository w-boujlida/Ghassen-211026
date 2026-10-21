import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { echeancesApi } from '../api/echeances.api.js'

// ── StatutButton ─────────────────────────────────────────────────────────────
const REPRISE_BADGE = {
  Returned: { bg:'#f0fdf4', color:'#16a34a', border:'#bbf7d0', label:'Returned' },
  Scrapped: { bg:'#fef2f2', color:'#dc2626', border:'#fecaca', label:'Scrapped' },
}

function StatutButton({ barcode, currentReprise, module, projetCode, onUpdated }) {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const reprise = currentReprise && currentReprise !== 'Not Returned' ? currentReprise : null

  if (reprise && REPRISE_BADGE[reprise]) {
    const b = REPRISE_BADGE[reprise]
    return (
      <span style={{ fontSize:11, fontWeight:700, background:b.bg, color:b.color,
        border:`1.5px solid ${b.border}`, borderRadius:8, padding:'4px 10px', whiteSpace:'nowrap' }}>
        {b.label}
      </span>
    )
  }

  const choose = async (val) => {
    setOpen(false); setLoading(true)
    try {
      await echeancesApi.updateStatut(barcode, val, module, projetCode)
      onUpdated(barcode, val)
    } catch (e) { alert('Erreur: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div ref={ref} style={{ position:'relative', display:'inline-block' }}>
      <div style={{ display:'flex', borderRadius:8, overflow:'hidden', border:'1.5px solid #bbf7d0', boxShadow:'0 1px 4px rgba(21,128,61,.1)' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#166534', background:'#f0fdf4', padding:'5px 10px', whiteSpace:'nowrap' }}>
          {loading ? '…' : 'Statut'}
        </span>
        <button onClick={() => setOpen(o => !o)} disabled={loading}
          style={{ padding:'5px 7px', background:'#dcfce7', border:'none', borderLeft:'1px solid #bbf7d0', cursor:'pointer', lineHeight:1 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.5" style={{ width:10, height:10 }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>
      {open && (
        <div style={{ position:'absolute', top:'100%', right:0, zIndex:9999, background:'#fff', border:'1.5px solid #e2e8f0',
          borderRadius:9, boxShadow:'0 8px 24px rgba(0,0,0,.12)', marginTop:3, minWidth:130, overflow:'hidden' }}>
          {[
            { val:'Returned', color:'#16a34a', bg:'#f0fdf4' },
            { val:'Scrapped', color:'#dc2626', bg:'#fef2f2' },
          ].map(({ val, color, bg }) => (
            <div key={val} onMouseDown={() => choose(val)}
              style={{ padding:'9px 14px', cursor:'pointer', fontSize:12, fontWeight:700, color, background:'#fff',
                display:'flex', alignItems:'center', gap:7, transition:'background .1s' }}
              onMouseEnter={e => e.currentTarget.style.background = bg}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:color, flexShrink:0 }}/>
              {val}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtH(h) {
  if (h == null) return '—'
  const val = Math.abs(h)
  if (val < 24) return `${val.toFixed(1)}h`
  return `${(val / 24).toFixed(1)}j`
}

function ProgressBar({ elapsed, delai }) {
  const pct  = Math.min((elapsed / delai) * 100, 100)
  const over = elapsed > delai
  const bg   = over
    ? 'linear-gradient(90deg,#dc2626,#f87171)'
    : pct > 75
      ? 'linear-gradient(90deg,#f59e0b,#fcd34d)'
      : 'linear-gradient(90deg,#22c55e,#4ade80)'
  return (
    <div style={{ width:'100%', background:'#e2e8f0', borderRadius:99, height:6, overflow:'hidden', minWidth:90 }}>
      <div style={{ width:`${pct}%`, background:bg, height:'100%', borderRadius:99, transition:'width .4s ease' }} />
    </div>
  )
}

function StatusChip({ nbRetard, nbProches }) {
  if (nbRetard > 0)
    return <span style={{ fontSize:11, fontWeight:700, background:'#fef2f2', color:'#dc2626', border:'1.5px solid #fecaca', borderRadius:99, padding:'3px 11px', whiteSpace:'nowrap' }}>{nbRetard} en retard</span>
  if (nbProches > 0)
    return <span style={{ fontSize:11, fontWeight:700, background:'#fffbeb', color:'#d97706', border:'1.5px solid #fde68a', borderRadius:99, padding:'3px 11px', whiteSpace:'nowrap' }}>{nbProches} proche{nbProches > 1 ? 's' : ''}</span>
  return <span style={{ fontSize:11, fontWeight:700, background:'#f0fdf4', color:'#16a34a', border:'1.5px solid #bbf7d0', borderRadius:99, padding:'3px 11px' }}>✓ OK</span>
}

// ── ProjectCard ───────────────────────────────────────────────────────────────
function ProjectCard({ p, onClick }) {
  const [hovered, setHovered] = useState(false)
  const hasRetard  = p.nbRetard  > 0
  const hasProches = p.nbProches > 0
  const isOk       = !hasRetard && !hasProches

  const accentLine = hasRetard
    ? 'linear-gradient(90deg,#dc2626,#f87171)'
    : hasProches
      ? 'linear-gradient(90deg,#f59e0b,#fcd34d)'
      : 'linear-gradient(90deg,#22c55e,#4ade80)'

  const borderColor = hasRetard ? '#fca5a5' : hasProches ? '#fde68a' : '#e2e8f0'

  const avatarBg = hasRetard
    ? 'linear-gradient(135deg,#dc2626,#c92a2a)'
    : hasProches
      ? 'linear-gradient(135deg,#f59e0b,#d97706)'
      : 'linear-gradient(135deg,#15803d,#166534)'

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        borderRadius: 16,
        border: `1.5px solid ${hovered ? (hasRetard ? '#f87171' : hasProches ? '#fcd34d' : '#a5b4fc') : borderColor}`,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: hovered
          ? (hasRetard ? '0 12px 32px rgba(220,38,38,.15)' : hasProches ? '0 12px 32px rgba(245,158,11,.12)' : '0 12px 32px rgba(21,128,61,.12)')
          : (hasRetard ? '0 2px 12px rgba(220,38,38,.08)' : '0 2px 8px rgba(0,0,0,.05)'),
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'all .22s cubic-bezier(.4,0,.2,1)',
      }}
    >
      {/* Top accent stripe */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:accentLine }} />

      <div style={{ padding:'20px 22px 16px' }}>
        {/* Row 1 — avatar + code + chip */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:46, height:46, borderRadius:13, background:avatarBg, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:12, color:'#fff', letterSpacing:.5, flexShrink:0, fontFamily:'var(--font-mono)', boxShadow:'0 3px 10px rgba(0,0,0,.2)' }}>
              {p.projetCode}
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#0f172a', lineHeight:1.2 }}>Projet {p.projetCode}</div>
              <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>
                {isOk ? 'Aucun retard en cours' : `${p.nbTotal} pièce${p.nbTotal !== 1 ? 's' : ''} NOT RETURNED`}
              </div>
            </div>
          </div>
          <StatusChip nbRetard={p.nbRetard} nbProches={p.nbProches} />
        </div>

        {/* Row 2 — 3 stat boxes */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
          {[
            { val:p.nbRetard,  label:'Dépassées', active:hasRetard,  activeColor:'#dc2626', activeBg:'#fef2f2', activeBorder:'#fecaca' },
            { val:p.nbProches, label:'<48h',       active:hasProches, activeColor:'#d97706', activeBg:'#fffbeb', activeBorder:'#fde68a' },
            { val:p.nbTotal,   label:'Total',      active:false,      activeColor:'#15803d', activeBg:'#f0fdf4', activeBorder:'#bbf7d0' },
          ].map(({ val, label, active, activeColor, activeBg, activeBorder }) => (
            <div key={label} style={{ textAlign:'center', padding:'9px 6px', background: active ? activeBg : '#f8fafc', borderRadius:10, border:`1px solid ${active ? activeBorder : '#e2e8f0'}` }}>
              <div style={{ fontSize:20, fontWeight:800, color: active ? activeColor : '#1e293b', fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{val}</div>
              <div style={{ fontSize:10, color:'#94a3b8', fontWeight:700, textTransform:'uppercase', letterSpacing:.4, marginTop:3 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Row 3 — footer */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4, borderTop:'1px solid #f1f5f9', paddingTop:11 }}>
          <span style={{ fontSize:11, fontWeight:600, color: hovered ? '#15803d' : '#94a3b8', transition:'color .15s' }}>
            Voir le détail
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke={hovered ? '#15803d' : '#94a3b8'} strokeWidth="2.5"
            style={{ width:12, height:12, transform: hovered ? 'translateX(2px)' : 'translateX(0)', transition:'all .15s' }}>
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>
      </div>
    </div>
  )
}

// ── GlobalView ────────────────────────────────────────────────────────────────
function GlobalView() {
  const [projets, setProjets] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = useCallback(() => {
    echeancesApi.getAllProjects()
      .then(d => setProjets(Array.isArray(d) ? d : []))
      .catch(() => setProjets([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 5 * 60 * 1000); return () => clearInterval(id) }, [load])

  const totalRetard  = projets.reduce((a, p) => a + (p.nbRetard  || 0), 0)
  const totalProches = projets.reduce((a, p) => a + (p.nbProches || 0), 0)
  const totalPieces  = projets.reduce((a, p) => a + (p.nbTotal   || 0), 0)

  return (
    <>
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar" />
          <div className="header-title-group">
            <h2>Échéances</h2>
            <span className="header-subtitle">Suivi des délais de reprise par projet</span>
          </div>
        </div>
        <div className="header-right">
          <div className="hbadge-clock">
            <span className="hbadge-clock-dot" />
            <span>{new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}</span>
          </div>
        </div>
      </div>

      <div style={{ padding:'24px 28px' }}>

        {/* ── Summary KPI bar ── */}
        {!loading && projets.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:28 }}>
            {[
              { val:totalRetard,  label:'Total dépassées',       color:'#dc2626', bg:'#fef2f2', border:'#fecaca',
                icon:<svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" style={{ width:20, height:20 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
              { val:totalProches, label:'Expirent dans <48h',    color:'#d97706', bg:'#fffbeb', border:'#fde68a',
                icon:<svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" style={{ width:20, height:20 }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l3 3"/></svg> },
              { val:totalPieces,  label:'Total NOT RETURNED',    color:'#15803d', bg:'#f0fdf4', border:'#bbf7d0',
                icon:<svg viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2" style={{ width:20, height:20 }}><rect x="2" y="14" width="4" height="7" rx="1"/><rect x="9" y="9" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="17" rx="1"/></svg> },
            ].map(({ val, label, color, bg, border, icon }) => (
              <div key={label} style={{ background:bg, border:`1.5px solid ${border}`, borderRadius:14, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:'rgba(255,255,255,.75)', display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${border}`, flexShrink:0 }}>
                  {icon}
                </div>
                <div>
                  <div style={{ fontSize:28, fontWeight:800, color, lineHeight:1, fontVariantNumeric:'tabular-nums' }}>{val}</div>
                  <div style={{ fontSize:11, color:'#94a3b8', fontWeight:600, textTransform:'uppercase', letterSpacing:.4, marginTop:3 }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Section heading ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div>
            <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'#0f172a' }}>Vue globale par projet</h3>
            <p style={{ margin:'3px 0 0', fontSize:12, color:'#94a3b8' }}>
              {projets.length} projet{projets.length !== 1 ? 's' : ''} · Rafraîchissement automatique toutes les 5 min
            </p>
          </div>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : projets.length === 0 ? (
          <div style={{ textAlign:'center', padding:'80px 20px', color:'#94a3b8' }}>
            <div style={{ width:72, height:72, borderRadius:20, background:'#f1f5f9', margin:'0 auto 16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" style={{ width:36, height:36 }}>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <p style={{ fontSize:15, fontWeight:700, color:'#475569', margin:'0 0 8px' }}>Aucun délai configuré</p>
            <p style={{ fontSize:13, color:'#94a3b8', margin:0 }}>
              Configurez des délais dans <strong style={{ color:'#15803d' }}>Projets → Codes Défauts</strong>
            </p>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
            {projets.map(p => (
              <ProjectCard key={p.projetCode} p={p} onClick={() => navigate(`/echeances/${p.projetCode}`)} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── DetailView ────────────────────────────────────────────────────────────────
function DetailView({ projetCode }) {
  const [summary, setSummary] = useState(null)
  const [retard, setRetard]   = useState([])
  const [proches, setProches] = useState([])
  const [tab, setTab]         = useState('retard')
  const [loading, setLoading] = useState(true)

  const handleStatutUpdated = useCallback((barcode, newReprise) => {
    const patch = rows => rows.map(r => r.BARCODE === barcode ? { ...r, REPRISE: newReprise } : r)
    setRetard(patch)
    setProches(patch)
  }, [])
  const navigate = useNavigate()

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      echeancesApi.getProject(projetCode),
      echeancesApi.getRetard(projetCode),
      echeancesApi.getProches(projetCode, 48),
    ]).then(([s, r, p]) => {
      setSummary(s); setRetard(r || []); setProches(p || [])
    }).catch(() => {})
      .finally(() => setLoading(false))
  }, [projetCode])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 5 * 60 * 1000); return () => clearInterval(id) }, [load])

  const displayed = tab === 'retard' ? retard : tab === 'proches' ? proches : [...retard, ...proches]

  const tabs = [
    { key:'retard',  label:'Dépassées',    count:retard.length,              color:'#dc2626', bg:'#fef2f2', border:'#fecaca' },
    { key:'proches', label:'Proches <48h', count:proches.length,             color:'#d97706', bg:'#fffbeb', border:'#fde68a' },
    { key:'all',     label:'Toutes',       count:retard.length+proches.length, color:'#15803d', bg:'#f0fdf4', border:'#bbf7d0' },
  ]

  return (
    <>
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar" />
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button onClick={() => navigate('/echeances')}
              style={{ background:'#f1f5f9', border:'1.5px solid #e2e8f0', borderRadius:9, padding:'6px 13px', cursor:'pointer', fontSize:12, color:'#475569', fontWeight:600, display:'flex', alignItems:'center', gap:5, transition:'all .15s' }}
              onMouseEnter={e => { e.currentTarget.style.background='#e2e8f0' }}
              onMouseLeave={e => { e.currentTarget.style.background='#f1f5f9' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width:12, height:12 }}><path d="M15 18l-6-6 6-6"/></svg>
              Retour
            </button>
            <div style={{ width:1, height:28, background:'#e2e8f0' }} />
            <div>
              <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:'#0f172a', lineHeight:1.2 }}>Projet {projetCode}</h2>
              <span style={{ fontSize:12, color:'#94a3b8' }}>Suivi des échéances</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding:'24px 28px' }}>

        {/* Alert */}
        {summary?.nbRetard > 0 && (
          <div style={{ background:'linear-gradient(135deg,#fef2f2,#fff5f5)', border:'1.5px solid #fecaca', borderRadius:12, padding:'14px 20px', marginBottom:20, display:'flex', alignItems:'center', gap:12, boxShadow:'0 2px 12px rgba(220,38,38,.08)' }}>
            <div style={{ width:38, height:38, borderRadius:10, background:'#dc2626', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 2px 8px rgba(220,38,38,.3)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width:18, height:18 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div>
              <div style={{ color:'#dc2626', fontWeight:700, fontSize:13 }}>
                {summary.nbRetard} pièce{summary.nbRetard > 1 ? 's ont' : ' a'} dépassé le délai configuré
              </div>
              <div style={{ color:'#f87171', fontSize:11, marginTop:2 }}>
                Action requise — ces pièces doivent être reprises immédiatement
              </div>
            </div>
          </div>
        )}

        {/* KPI cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:24 }}>
          {[
            { label:'Dépassées',        val:summary?.nbRetard  ?? 0, color:'#dc2626', bg:'#fef2f2', border:'#fecaca',
              icon:<svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" style={{ width:22, height:22 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
            { label:'Expire <48h',      val:summary?.nbProches ?? 0, color:'#d97706', bg:'#fffbeb', border:'#fde68a',
              icon:<svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" style={{ width:22, height:22 }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l3 3"/></svg> },
            { label:'Total NOT RETURNED',val:summary?.nbTotal ?? 0,  color:'#15803d', bg:'#f0fdf4', border:'#bbf7d0',
              icon:<svg viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2" style={{ width:22, height:22 }}><rect x="2" y="14" width="4" height="7" rx="1"/><rect x="9" y="9" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="17" rx="1"/></svg> },
          ].map(({ label, val, color, bg, border, icon }) => (
            <div key={label} style={{ background:bg, border:`1.5px solid ${border}`, borderRadius:14, padding:'18px 20px', display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:48, height:48, borderRadius:12, background:'rgba(255,255,255,.7)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:`1px solid ${border}` }}>
                {icon}
              </div>
              <div>
                <div style={{ fontSize:30, fontWeight:800, color, lineHeight:1, fontVariantNumeric:'tabular-nums' }}>{val}</div>
                <div style={{ fontSize:11, color:'#94a3b8', fontWeight:600, textTransform:'uppercase', letterSpacing:.4, marginTop:4 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
          {tabs.map(({ key, label, count, color, bg, border }) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ padding:'7px 18px', borderRadius:99, cursor:'pointer', fontSize:12, fontWeight:700, transition:'all .15s', display:'flex', alignItems:'center', gap:7, border:`1.5px solid ${tab===key ? color : '#e2e8f0'}`,
                background: tab===key ? color : '#f8fafc',
                color:      tab===key ? '#fff' : '#64748b',
                boxShadow:  tab===key ? `0 2px 8px ${color}33` : 'none' }}>
              {label}
              <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:20, height:20, borderRadius:99, fontWeight:800, fontSize:11,
                background: tab===key ? 'rgba(255,255,255,.25)' : bg,
                color:      tab===key ? '#fff' : color,
                border:     `1px solid ${tab===key ? 'rgba(255,255,255,.3)' : border}` }}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="table-container" style={{ borderRadius:14, overflow:'hidden', border:'1.5px solid #e2e8f0', boxShadow:'0 2px 12px rgba(0,0,0,.05)' }}>
          <div className="table-wrapper">
            {loading ? (
              <div className="loading"><div className="spinner" /></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th><th>Barcode</th><th>Date scan</th><th>Code défaut</th>
                    <th>Module</th><th>Délai conf.</th><th>Écoulé</th>
                    <th>Dépassement</th><th style={{ minWidth:110 }}>Progression</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.length === 0 && (
                    <tr><td colSpan={10} style={{ textAlign:'center', padding:56, color:'#94a3b8' }}>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ width:40, height:40 }}>
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span style={{ fontSize:13, fontWeight:600 }}>Aucune pièce dans cette catégorie</span>
                      </div>
                    </td></tr>
                  )}
                  {displayed.map((row, idx) => {
                    const elapsed = Number(row.HEURES_ECOULES) || 0
                    const delai   = Number(row.DELAI_ECHEANCE_HEURES) || 1
                    const over    = elapsed > delai
                    const dep     = over ? elapsed - delai : 0
                    const module  = row.MODULE || 'FIREWALL'
                    const pct     = Math.min((elapsed / delai) * 100, 100)
                    return (
                      <tr key={`${row.BARCODE}-${row.CODDEF}-${idx}`}
                        style={{ background: over ? 'rgba(220,38,38,.025)' : 'transparent' }}>
                        <td style={{ color:'#94a3b8', fontWeight:700, fontSize:12, width:36 }}>{idx + 1}</td>
                        <td>
                          <code style={{ fontSize:11, fontFamily:'var(--font-mono)', background:'#f1f5f9', padding:'2px 7px', borderRadius:5, color:'#1e293b', fontWeight:600 }}>
                            {row.BARCODE}
                          </code>
                        </td>
                        <td style={{ fontSize:11, color:'#64748b', whiteSpace:'nowrap' }}>{(row.DATEFW || '').slice(0, 16)}</td>
                        <td>
                          <span style={{ fontFamily:'var(--font-mono)', fontSize:12, fontWeight:700, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:'2px 8px' }}>
                            {row.CODDEF}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize:11, fontWeight:700,
                            background: module==='CSL' ? '#fff7ed' : '#f0fdf4',
                            color:      module==='CSL' ? '#ea580c' : '#166534',
                            border:     `1px solid ${module==='CSL' ? '#fed7aa' : '#bbf7d0'}`,
                            borderRadius:99, padding:'2px 9px', whiteSpace:'nowrap' }}>
                            {module}
                          </span>
                        </td>
                        <td style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'#475569', fontWeight:600 }}>{fmtH(delai)}</td>
                        <td>
                          <span style={{ fontFamily:'var(--font-mono)', fontSize:12, fontWeight:800, color: over ? '#dc2626' : '#22c55e' }}>
                            {fmtH(elapsed)}
                          </span>
                        </td>
                        <td>
                          {over
                            ? <span style={{ fontFamily:'var(--font-mono)', fontSize:12, fontWeight:800, color:'#dc2626', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'2px 8px', whiteSpace:'nowrap' }}>+{fmtH(dep)}</span>
                            : <span style={{ color:'#cbd5e1', fontSize:12 }}>—</span>
                          }
                        </td>
                        <td style={{ minWidth:110 }}>
                          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                            <ProgressBar elapsed={elapsed} delai={delai} />
                            <span style={{ fontSize:10, color:'#94a3b8', textAlign:'right', fontFamily:'var(--font-mono)' }}>{Math.round(pct)}%</span>
                          </div>
                        </td>
                        <td>
                          <StatutButton
                            barcode={row.BARCODE}
                            currentReprise={row.REPRISE}
                            module={module}
                            projetCode={projetCode}
                            onUpdated={handleStatutUpdated}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function Echeances() {
  const { projetCode } = useParams()
  return projetCode ? <DetailView projetCode={projetCode.toUpperCase()} /> : <GlobalView />
}