import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'
import { dashboardApi } from '../api/dashboard.api.js'

Chart.register(...registerables)
Chart.defaults.font.family = "'Inter', -apple-system, sans-serif"
Chart.defaults.font.size   = 12
Chart.defaults.color       = "#64748b"

const FW    = "#15803d", CSL  = "#e8590c"
const TEAL  = "#059669", ROSE = "#c92a2a", AMB = "#e67700"
const PROJ  = ["#15803d","#e8590c","#059669","#c92a2a","#e67700","#7c3aed","#0f766e","#475569","#0891b2","#be185d"]
const DELIB = ["#7c3aed","#8b5cf6","#a78bfa","#5b21b6","#4c1d95","#5b21b6","#7e22ce","#9333ea","#c026d3","#db2777"]
const emptyStyle = { textAlign:'center', padding:'40px 0', color:'#94a3b8', fontSize:13 }

function fmt(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function fmtLbl(s) { try { return new Date(s+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}) } catch { return s } }
function shortDt(s) { try { return new Date(s+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'}) } catch { return s } }

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

export default function Reports() {
  const today = fmt(new Date())
  const monthStart = fmt(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [from, setFrom]     = useState(monthStart)
  const [to, setTo]         = useState(today)
  const [preset, setPreset] = useState('month')
  const [tab, setTab]       = useState('synthese')
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [clock, setClock]   = useState(() => new Date().toLocaleTimeString('fr-FR'))

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('fr-FR')), 1000)
    return () => clearInterval(t)
  }, [])

  const rTrend = useRef(), rDistrib = useRef(), rProjPerf = useRef()
  const rDefRadar = useRef(), rDelib = useRef(), rDelibPolar = useRef()

  const load = useCallback((f, t) => {
    setLoading(true)
    dashboardApi.filtered({ date1: f, date2: t }).then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(monthStart, today) }, []) // eslint-disable-line

  const applyPreset = p => {
    setPreset(p)
    const f = p === 'today' ? today : p === '7d' ? fmt(new Date(Date.now()-6*86400000)) : monthStart
    setFrom(f); setTo(today); load(f, today)
  }

  const totals    = data?.totals     || {}
  const reprise   = data?.reprise    || {}
  const trend     = data?.trend      || {}
  const byProjRaw = data?.byProject  || {}
  const byProj    = Object.fromEntries(Object.entries(byProjRaw).map(([k,v]) => [k.toUpperCase(), v]))
  const byDef     = data?.byDefCode  || {}
  const byDelib   = data?.byDelibera || {}
  const pLabel    = `${fmtLbl(from)} \u2013 ${fmtLbl(to)}`

  const trendArr  = Object.entries(trend).sort(([a],[b]) => a.localeCompare(b))
  const projArr   = Object.entries(byProj)
  const defArr    = Object.entries(byDef).sort(([,a],[,b]) => b-a).slice(0,15)
  const delibArr  = Object.entries(byDelib).sort(([,a],[,b]) => b-a)
  const totalAll  = projArr.reduce((s,[,v]) => s+(v.fw||0)+(v.csl||0), 0) || 1
  const maxDef    = defArr[0]?.[1] || 1

  const rates = projArr.map(([name,v]) => {
    const tot = (v.fw||0)+(v.csl||0), ret = v.ret||0
    return { name, tot, ret, rate: tot>0 ? Math.round(ret/tot*100) : 0 }
  }).sort((a,b) => b.rate-a.rate)

  useChart(rTrend, () => {
    if (!trendArr.length) return null
    return { type:'line', data:{ labels:trendArr.map(([d])=>shortDt(d)), datasets:[
      { label:'Firewall', data:trendArr.map(([,v])=>v.fw||0),  borderColor:FW,  backgroundColor:'rgba(21,128,61,.07)',  borderWidth:2.5, tension:.4, fill:true, pointRadius:trendArr.length>20?0:3, pointBackgroundColor:FW,  pointBorderColor:'#fff', pointBorderWidth:2 },
      { label:'CSL',      data:trendArr.map(([,v])=>v.csl||0), borderColor:CSL, backgroundColor:'rgba(232,89,12,.07)', borderWidth:2.5, tension:.4, fill:true, pointRadius:trendArr.length>20?0:3, pointBackgroundColor:CSL, pointBorderColor:'#fff', pointBorderWidth:2 },
    ]}, options:{ responsive:true,
      plugins:{ legend:{position:'top',labels:{boxWidth:10,padding:14,usePointStyle:true}}, tooltip:{mode:'index',intersect:false} },
      scales:{ x:{grid:{display:false},border:{display:false},ticks:{maxTicksLimit:12}}, y:{beginAtZero:true,grid:{color:'#f1f5f9'},border:{display:false},ticks:{precision:0}} } } }
  }, [JSON.stringify(trend)])

  useChart(rDistrib, () => {
    const r = reprise['Returned']||0, n = reprise['Not Returned']||0, s = reprise['Scrap']||0, tot = r+n+s||1
    return { type:'doughnut', data:{ labels:['Retournées','En attente','Rebutées'], datasets:[{ data:[r,n,s], backgroundColor:[TEAL,AMB,ROSE], borderWidth:0, hoverOffset:10 }] },
      options:{ responsive:true, cutout:'68%', plugins:{ legend:{position:'bottom',labels:{boxWidth:10,padding:16,usePointStyle:true}}, tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${Number(ctx.raw).toLocaleString('fr-FR')} (${Math.round(ctx.raw/tot*100)}%)`}} } } }
  }, [JSON.stringify(reprise)])

  useChart(rProjPerf, () => {
    const labels = Object.keys(byProj); if (!labels.length) return null
    return { type:'bar', data:{ labels, datasets:[
      { label:'Firewall', data:labels.map(l=>byProj[l].fw||0),  backgroundColor:FW,  borderRadius:5, borderSkipped:false },
      { label:'CSL',      data:labels.map(l=>byProj[l].csl||0), backgroundColor:CSL, borderRadius:5, borderSkipped:false },
    ]}, options:{ responsive:true, plugins:{ legend:{position:'top',labels:{boxWidth:10,padding:12,usePointStyle:true}}, tooltip:{mode:'index',intersect:false} },
      scales:{ x:{grid:{display:false},border:{display:false}}, y:{beginAtZero:true,grid:{color:'#f1f5f9'},border:{display:false},ticks:{precision:0}} } } }
  }, [JSON.stringify(byProj)])

  useChart(rDefRadar, () => {
    const e = Object.entries(byDef).sort(([,a],[,b])=>b-a).slice(0,8); if (!e.length) return null
    return { type:'radar', data:{ labels:e.map(([c])=>c), datasets:[{ label:'Occurrences', data:e.map(([,v])=>v), backgroundColor:'rgba(232,89,12,.12)', borderColor:CSL, borderWidth:2, pointBackgroundColor:CSL }] },
      options:{ responsive:true, scales:{r:{beginAtZero:true,grid:{color:'#f1f5f9'},ticks:{precision:0}}}, plugins:{legend:{display:false}} } }
  }, [JSON.stringify(byDef)])

  useChart(rDelib, () => {
    if (!delibArr.length) return null
    return { type:'bar', data:{ labels:delibArr.map(([k])=>k), datasets:[{ label:'Pièces', data:delibArr.map(([,v])=>v), backgroundColor:delibArr.map((_,i)=>DELIB[i%DELIB.length]), borderRadius:4, borderSkipped:false }] },
      options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false},border:{display:false}}, y:{beginAtZero:true,grid:{color:'#f1f5f9'},border:{display:false},ticks:{precision:0}} } } }
  }, [JSON.stringify(byDelib)])

  useChart(rDelibPolar, () => {
    const e = delibArr.slice(0,8); if (!e.length) return null
    return { type:'polarArea', data:{ labels:e.map(([k])=>k), datasets:[{ data:e.map(([,v])=>v), backgroundColor:e.map((_,i)=>DELIB[i%DELIB.length]+'cc'), borderWidth:0 }] },
      options:{ responsive:true, plugins:{legend:{position:'bottom',labels:{boxWidth:10,padding:12,usePointStyle:true}}} } }
  }, [JSON.stringify(byDelib)])

  const TABS = [
    { id:'synthese', label:'Synthèse',    d:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
    { id:'projet',   label:'Par Projet',  d:'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
    { id:'defauts',  label:'Défauts',     d:'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' },
    { id:'delibera', label:'CQ Délibéra', d:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
  ]

  return (
    <>
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar"></div>
          <div className="header-title-group">
            <h2>Rapports Qualité</h2>
            <span className="header-subtitle">Analyse · {pLabel}</span>
          </div>
        </div>
        <div className="header-right">
          <div className="hbadge hbadge-clock"><span className="hbadge-clock-dot"></span><span>{clock}</span></div>
        </div>
      </div>

      <div className="rp-filter-bar">
        <div className="rp-filter-group"><label className="rp-filter-label">Du</label><input type="date" className="rp-filter-date" value={from} onChange={e=>setFrom(e.target.value)} /></div>
        <div className="rp-filter-group"><label className="rp-filter-label">Au</label><input type="date" className="rp-filter-date" value={to} onChange={e=>setTo(e.target.value)} /></div>
        <button className="rp-filter-apply" onClick={()=>{setPreset('');load(from,to)}} disabled={loading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.92"/></svg>
          {loading ? 'Chargement\u2026' : 'Actualiser'}
        </button>
        <div className="rp-presets">
          {[['today',"Aujourd'hui"],['7d','7 jours'],['month','Ce mois']].map(([p,lbl])=>(
            <button key={p} className={'rp-preset'+(preset===p?' active':'')} onClick={()=>applyPreset(p)}>{lbl}</button>
          ))}
        </div>
        <span className="rp-filter-info">{pLabel}</span>
      </div>

      <div className="rp-kpi-grid">
        {[
          {cls:'fw',   lbl:'Firewall',            val:totals.fw      ||0, stk:'#15803d'},
          {cls:'csl',  lbl:'CSL',                 val:totals.csl     ||0, stk:'#e8590c'},
          {cls:'ret',  lbl:'Coiffes Retournées', val:totals.returned||0, stk:'#059669'},
          {cls:'nret', lbl:'Coiffes Rebut',        val:totals.scrap   ||0, stk:'#c92a2a'},
        ].map(({cls,lbl,val,stk})=>(
          <div key={cls} className={`rp-kpi-card ${cls}`}>
            <div className="rp-kpi-top">
              <div className="rp-kpi-label">{lbl}</div>
              <div className={`rp-kpi-icon ${cls}`}><svg viewBox="0 0 24 24" fill="none" stroke={stk} strokeWidth="2"><circle cx="12" cy="12" r="8"/></svg></div>
            </div>
            <div className="rp-kpi-value">{loading ? '\u2013' : val.toLocaleString('fr-FR')}</div>
            <div className="rp-kpi-period">{pLabel}</div>
          </div>
        ))}
      </div>

      <div className="rp-tabs">
        {TABS.map(t=>(
          <button key={t.id} className={'rp-tab'+(tab===t.id?' active':'')} onClick={()=>setTab(t.id)}>
            <svg viewBox="0 0 24 24"><path d={t.d}/></svg>{t.label}
          </button>
        ))}
      </div>

      {/* Synthese */}
      <div className={'rp-panel'+(tab==='synthese'?' active':'')}>
        <div className="rp-gap">
          <div className="rp-2col">
            <div className="rp-chart-card">
              <div className="rp-chart-head"><div><div className="rp-chart-title">Évolution journalière</div><div className="rp-chart-sub">Firewall &amp; CSL — tendance sur la période</div></div>
                <span className="rp-chart-badge" style={{background:'rgba(21,128,61,.08)',color:'#15803d',border:'1px solid rgba(21,128,61,.2)'}}>TREND</span></div>
              {!trendArr.length&&!loading ? <div style={emptyStyle}>Aucune donnée</div> : <canvas ref={rTrend} height={180}></canvas>}
            </div>
            <div className="rp-chart-card">
              <div className="rp-chart-head"><div><div className="rp-chart-title">Distribution Qualité</div><div className="rp-chart-sub">Retournées · En attente · Rebutées</div></div></div>
              <canvas ref={rDistrib} height={180}></canvas>
            </div>
          </div>
          <div className="rp-chart-card">
            <div className="rp-chart-head"><div><div className="rp-chart-title">Firewall vs CSL — par projet</div><div className="rp-chart-sub">Volume de scans pour la période</div></div>
              <span className="rp-chart-badge" style={{background:'rgba(5,150,105,.08)',color:'#059669',border:'1px solid rgba(5,150,105,.2)'}}>PROJETS</span></div>
            {!projArr.length&&!loading ? <div style={emptyStyle}>Aucune donnée</div> : <canvas ref={rProjPerf} height={100}></canvas>}
          </div>
          <div className="rp-chart-card">
            <div className="rp-chart-head"><div><div className="rp-chart-title">Taux de Retour par Projet</div><div className="rp-chart-sub">% coiffes retournées / total scanné</div></div>
              <span className="rp-chart-badge" style={{background:'rgba(201,42,42,.08)',color:'#c92a2a',border:'1px solid rgba(201,42,42,.2)'}}>RETOUR %</span></div>
            {!rates.length ? <div style={emptyStyle}>Aucune donn\u00e9e</div> : rates.map(({name,tot,ret,rate})=>{
              const c = rate>=70?TEAL:rate>=40?AMB:ROSE
              return <div key={name} className="rp-rate-row"><span className="rp-rate-proj">{name}</span><div className="rp-rate-bar-wrap"><div className="rp-rate-bar" style={{width:rate+'%',background:c}}></div></div><span className="rp-rate-pct" style={{color:c}}>{rate}%</span><span style={{fontSize:11,color:'#94a3b8',width:80,textAlign:'right'}}>{ret.toLocaleString('fr-FR')} / {tot.toLocaleString('fr-FR')}</span></div>
            })}
          </div>
        </div>
      </div>

      {/* Par Projet */}
      <div className={'rp-panel'+(tab==='projet'?' active':'')}>
        {!projArr.length ? <div style={emptyStyle}>Aucune donnée pour la période sélectionnée</div>
          : <div className="rp-3col">{projArr.map(([name,v],i)=>{
              const fw=v.fw||0,csl2=v.csl||0,tot=fw+csl2,rate=Math.round(tot/totalAll*100),color=PROJ[i%PROJ.length]
              return <div key={name} className="rp-proj-card">
                <div className="rp-proj-hd"><span className="rp-proj-name">{name}</span><span className="rp-proj-badge" style={{background:color+'18',color,border:`1px solid ${color}40`}}>{tot.toLocaleString('fr-FR')} rec.</span></div>
                <div className="rp-proj-stats">
                  <div className="rp-proj-stat"><span className="rp-proj-stat-lbl">Firewall</span><span className="rp-proj-stat-val" style={{color:FW}}>{fw.toLocaleString('fr-FR')}</span></div>
                  <div className="rp-proj-stat"><span className="rp-proj-stat-lbl">CSL</span><span className="rp-proj-stat-val" style={{color:CSL}}>{csl2.toLocaleString('fr-FR')}</span></div>
                </div>
                <div className="rp-bar-outer"><div className="rp-bar-fill" style={{width:rate+'%',background:`linear-gradient(90deg,${color},${color}99)`}}></div></div>
                <div className="rp-proj-rate">{rate}% du volume global</div>
              </div>
            })}</div>}
      </div>

      {/* Defauts */}
      <div className={'rp-panel'+(tab==='defauts'?' active':'')}>
        <div className="rp-gap"><div className="rp-2col">
          <div className="rp-def-wrap">
            <table className="rp-def-table">
              <thead><tr><th>Code</th><th>Description</th><th style={{textAlign:'right'}}>Occur.</th><th>Fréquence</th></tr></thead>
              <tbody>{!defArr.length
                ? <tr><td colSpan={4} style={{textAlign:'center',padding:48,color:'#94a3b8',fontSize:13}}>Aucun défaut enregistré</td></tr>
                : defArr.map(([code,cnt],i)=>{const pct=Math.round(cnt/maxDef*100),color=PROJ[i%PROJ.length]; return(
                    <tr key={code}><td><span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color,fontSize:12,background:color+'14',padding:'2px 8px',borderRadius:5,border:`1px solid ${color}30`}}>{code}</span></td>
                    <td style={{color:'#475569',fontSize:12,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{code}</td>
                    <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:'#0f172a',textAlign:'right'}}>{cnt.toLocaleString('fr-FR')}</td>
                    <td style={{minWidth:120}}><div className="rp-def-bar-outer"><div className="rp-def-bar-fill" style={{width:pct+'%',background:`linear-gradient(90deg,${color},${color}88)`}}></div></div></td></tr>
                  )})}
              </tbody>
            </table>
          </div>
          <div className="rp-chart-card" style={{alignSelf:'start'}}>
            <div className="rp-chart-head"><div><div className="rp-chart-title">Top 10 Défauts</div><div className="rp-chart-sub">Visualisation radar</div></div></div>
            {!defArr.length ? <div style={emptyStyle}>Aucune donnée</div> : <canvas ref={rDefRadar} height={240}></canvas>}
          </div>
        </div></div>
      </div>

      {/* Delibera */}
      <div className={'rp-panel'+(tab==='delibera'?' active':'')}>
        <div className="rp-gap"><div className="rp-2col">
          <div className="rp-chart-card">
            <div className="rp-chart-head"><div><div className="rp-chart-title">Distribution des CQ Délibéra</div><div className="rp-chart-sub">Top occurrences</div></div>
              <span className="rp-chart-badge" style={{background:'rgba(124,58,237,.08)',color:'#7c3aed',border:'1px solid rgba(124,58,237,.2)'}}>CQDELIBERA</span></div>
            {!delibArr.length ? <div style={emptyStyle}>Aucune donnée</div> : <canvas ref={rDelib} height={240}></canvas>}
          </div>
          <div className="rp-chart-card" style={{alignSelf:'start'}}>
            <div className="rp-chart-head"><div><div className="rp-chart-title">Répartition CQ Délibéra</div><div className="rp-chart-sub">Diagramme polaire</div></div></div>
            {!delibArr.length ? <div style={emptyStyle}>Aucune donnée</div> : <canvas ref={rDelibPolar} height={260}></canvas>}
          </div>
        </div></div>
      </div>

      <style>{`
        /* ── Filter bar ─────────────────────────────────────────────────────── */
        .rp-filter-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 28px;background:#fff;border-bottom:1px solid #e8ecf5;position:sticky;top:0;z-index:10;box-shadow:0 2px 12px rgba(21,128,61,.06)}
        .rp-filter-group{display:flex;align-items:center;gap:6px}
        .rp-filter-label{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
        .rp-filter-date{padding:7px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;color:#0f172a;outline:none;background:#f8fafc;cursor:pointer;transition:border-color .15s,box-shadow .15s}
        .rp-filter-date:focus{border-color:#15803d;background:#fff;box-shadow:0 0 0 3px rgba(21,128,61,.1)}
        .rp-filter-apply{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;background:linear-gradient(135deg,#15803d,#5b21b6);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;transition:filter .15s,transform .15s;box-shadow:0 4px 14px rgba(21,128,61,.35)}
        .rp-filter-apply:hover{filter:brightness(.92);transform:translateY(-1px)}.rp-filter-apply:active{transform:translateY(0)}
        .rp-filter-apply:disabled{opacity:.6;cursor:not-allowed;transform:none}.rp-filter-apply svg{width:14px;height:14px}
        .rp-presets{display:flex;gap:6px;align-items:center}
        .rp-preset{padding:5px 13px;border-radius:99px;border:1.5px solid #e2e8f0;background:#f8fafc;color:#475569;cursor:pointer;font-size:12px;font-weight:600;transition:all .15s}
        .rp-preset:hover{background:#eff3ff;border-color:#15803d;color:#15803d;box-shadow:0 2px 8px rgba(21,128,61,.12)}
        .rp-preset.active{background:linear-gradient(135deg,#15803d,#5b21b6);border-color:transparent;color:#fff;box-shadow:0 3px 10px rgba(21,128,61,.3)}
        .rp-filter-info{font-size:12px;color:#94a3b8;margin-left:4px}

        /* ── KPI cards ──────────────────────────────────────────────────────── */
        .rp-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:22px 28px 0}
        .rp-kpi-card{background:#fff;border:1px solid #e8ecf5;border-radius:16px;padding:18px 20px;position:relative;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.05);transition:transform .2s,box-shadow .2s}
        .rp-kpi-card:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(0,0,0,.1)}
        .rp-kpi-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:16px 0 0 16px}
        .rp-kpi-card.fw::before{background:linear-gradient(180deg,#15803d,#5b21b6)}.rp-kpi-card.csl::before{background:linear-gradient(180deg,#e8590c,#f59f00)}.rp-kpi-card.ret::before{background:linear-gradient(180deg,#059669,#0891b2)}.rp-kpi-card.nret::before{background:linear-gradient(180deg,#c92a2a,#be185d)}
        .rp-kpi-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
        .rp-kpi-label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px}
        .rp-kpi-icon{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center}
        .rp-kpi-icon.fw{background:rgba(21,128,61,.1)}.rp-kpi-icon.csl{background:rgba(232,89,12,.1)}.rp-kpi-icon.ret{background:rgba(5,150,105,.1)}.rp-kpi-icon.nret{background:rgba(201,42,42,.1)}
        .rp-kpi-icon svg{width:15px;height:15px}
        .rp-kpi-value{font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:700;color:#0f172a;letter-spacing:-1.5px;line-height:1}
        .rp-kpi-period{font-size:10px;color:#94a3b8;margin-top:5px}

        /* ── Tabs ───────────────────────────────────────────────────────────── */
        .rp-tabs{display:flex;padding:0 28px;border-bottom:2px solid #e8ecf5;margin-top:22px;background:#fff;gap:2px}
        .rp-tab{display:inline-flex;align-items:center;gap:7px;padding:12px 20px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#64748b;border-bottom:2.5px solid transparent;margin-bottom:-2px;transition:color .15s,border-color .15s,background .15s;border-radius:10px 10px 0 0}
        .rp-tab:hover{color:#15803d;background:rgba(21,128,61,.04)}
        .rp-tab.active{color:#15803d;border-bottom-color:#15803d;background:rgba(21,128,61,.05)}
        .rp-tab svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

        /* ── Panel / chart cards ────────────────────────────────────────────── */
        .rp-panel{display:none;padding:24px 28px 48px}.rp-panel.active{display:block}
        .rp-chart-card{background:#fff;border:1px solid #e8ecf5;border-radius:16px;padding:22px 24px;box-shadow:0 2px 8px rgba(0,0,0,.04);transition:box-shadow .2s,transform .2s}
        .rp-chart-card:hover{box-shadow:0 8px 28px rgba(0,0,0,.09);transform:translateY(-1px)}
        .rp-chart-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px}
        .rp-chart-title{font-size:14px;font-weight:700;color:#0f172a}.rp-chart-sub{font-size:11px;color:#94a3b8;margin-top:2px}
        .rp-chart-badge{font-size:10px;font-weight:700;padding:3px 10px;border-radius:99px;text-transform:uppercase;letter-spacing:.5px}
        .rp-2col{display:grid;grid-template-columns:3fr 2fr;gap:16px}.rp-3col{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.rp-gap{display:flex;flex-direction:column;gap:18px}

        /* ── Project cards ──────────────────────────────────────────────────── */
        .rp-proj-card{background:#fff;border:1px solid #e8ecf5;border-radius:14px;padding:18px;box-shadow:0 2px 8px rgba(0,0,0,.04);transition:transform .2s,box-shadow .2s}
        .rp-proj-card:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(0,0,0,.1)}
        .rp-proj-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
        .rp-proj-name{font-size:18px;font-weight:800;color:#0f172a;letter-spacing:1px;font-family:'JetBrains Mono',monospace}
        .rp-proj-badge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px;text-transform:uppercase;letter-spacing:.5px}
        .rp-proj-stats{display:flex;gap:20px;margin-bottom:12px}
        .rp-proj-stat{display:flex;flex-direction:column;gap:2px}
        .rp-proj-stat-lbl{font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
        .rp-proj-stat-val{font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700;color:#0f172a}
        .rp-bar-outer{height:5px;background:#f1f5f9;border-radius:99px;overflow:hidden;margin-bottom:6px}
        .rp-bar-fill{height:100%;border-radius:99px;transition:width .8s ease}.rp-proj-rate{font-size:11px;color:#64748b;font-weight:500}

        /* ── Rate rows ──────────────────────────────────────────────────────── */
        .rp-rate-row{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #f1f5f9;transition:background .12s}
        .rp-rate-row:last-child{border-bottom:none}
        .rp-rate-proj{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:#0f172a;width:60px;flex-shrink:0}
        .rp-rate-bar-wrap{flex:1;background:#f1f5f9;border-radius:99px;height:8px;overflow:hidden}
        .rp-rate-bar{height:100%;border-radius:99px;transition:width .8s ease}
        .rp-rate-pct{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:#0f172a;width:42px;text-align:right;flex-shrink:0}

        /* ── Defects table ──────────────────────────────────────────────────── */
        .rp-def-wrap{background:#fff;border:1px solid #e8ecf5;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.05)}
        .rp-def-table{width:100%;border-collapse:collapse}
        .rp-def-table th{text-align:left;padding:12px 16px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;background:#f8fafc;border-bottom:1px solid #e8ecf5}
        .rp-def-table td{padding:11px 16px;font-size:13px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
        .rp-def-table tr:last-child td{border-bottom:none}.rp-def-table tr:hover td{background:rgba(21,128,61,.03)}
        .rp-def-bar-outer{height:6px;background:#f1f5f9;border-radius:99px;min-width:100px;overflow:hidden}
        .rp-def-bar-fill{height:100%;border-radius:99px;transition:width .7s ease}

        /* ── Responsive ─────────────────────────────────────────────────────── */
        @media(max-width:1100px){.rp-2col{grid-template-columns:1fr}.rp-3col{grid-template-columns:1fr 1fr}.rp-kpi-grid{grid-template-columns:1fr 1fr}}
        @media(max-width:700px){.rp-3col{grid-template-columns:1fr}.rp-kpi-grid{grid-template-columns:1fr}}
        .header-title-group h2{font-size:16px;font-weight:700;color:#0f172a;margin:0}.header-subtitle{font-size:12px;color:#94a3b8}
      `}</style>
    </>
  )
}
