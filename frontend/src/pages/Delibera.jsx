import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { deliberaApi } from '../api/delibera.api.js'
import { lookupApi } from '../api/lookup.api.js'
import { projectsApi } from '../api/projects.api.js'
import { parseExcelFile } from '../utils/helpers.js'
import { reportClientExport } from '../utils/businessActivity.js'
import Pagination from '../components/Pagination.jsx'
import DeliberaScanSetup from '../components/DeliberaScanSetup.jsx'
import DeliberaMultiScanner from '../components/DeliberaMultiScanner.jsx'
import VersionPhoto from '../components/VersionPhoto.jsx'
import DeliberaReturnModal from '../components/DeliberaReturnModal.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useLang } from '../contexts/LangContext.jsx'
import './Delibera.css'

const C   = '#7c3aed'   // violet principal Délibéra
const RET = '#15803d'   // vert  — retournée
const NON = '#b91c1c'   // rouge — non retournée

// ── Helpers ────────────────────────────────────────────────────────────────────
const safeId = (v) => (v != null && v !== 'undefined' && v !== '') ? v : null

// ── Toast ──────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  const s = {
    success: { bg:'#dcfce7', color:'#15803d', border:'#86efac', icon:'✓' },
    error:   { bg:'#fee2e2', color:'#b91c1c', border:'#fca5a5', icon:'✕' },
    warning: { bg:'#fef3c7', color:'#92400e', border:'#fcd34d', icon:'⚠' },
  }[type] || {}
  return (
    <div style={{ position:'fixed', bottom:28, right:28, zIndex:9999, minWidth:300,
      padding:'13px 18px', borderRadius:12, border:`1px solid ${s.border}`,
      background:s.bg, color:s.color, fontSize:14, fontWeight:600,
      boxShadow:'0 4px 24px rgba(0,0,0,0.15)', display:'flex', alignItems:'center', gap:10 }}>
      <span style={{ fontSize:18 }}>{s.icon}</span>
      <span style={{ flex:1 }}>{msg}</span>
      <button onClick={onClose}
        style={{ background:'none', border:'none', cursor:'pointer', color:s.color, fontSize:18, lineHeight:1, padding:0 }}>×</button>
    </div>
  )
}

// ── StatusBadge ────────────────────────────────────────────────────────────────
function StatusBadge({ statut }) {
  const { t } = useLang()
  const ok = statut === 'RETURNED'
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:'3px 12px', borderRadius:99, whiteSpace:'nowrap',
      background: ok ? '#dcfce7' : '#fee2e2',
      color: ok ? RET : NON,
      border:`1px solid ${ok ? '#86efac' : '#fca5a5'}` }}>
      {ok ? t('delibera_status_ret') : t('delibera_status_nonret')}
    </span>
  )
}

function ScanRecordsTable({ title, records, total, loading, error, status }) {
  const isOk = status === 'RETURNED'
  return (
    <section className={`delibera-scan-records delibera-scan-records--${isOk ? 'ok' : 'nok'}`}>
      <div className="delibera-scan-records__heading">
        <h4>{title}</h4>
        {!loading && !error && <span>{total} pièce(s) au total</span>}
      </div>
      {error ? (
        <p className="delibera-scan-records__message delibera-scan-records__message--error">{error}</p>
      ) : loading ? (
        <div className="delibera-scan-records__message">Chargement des enregistrements…</div>
      ) : records.length === 0 ? (
        <div className="delibera-scan-records__message">Aucune pièce {isOk ? 'OK' : 'NOK'} enregistrée.</div>
      ) : (
        <div className="delibera-scan-records__scroll">
          <table>
            <thead>
              <tr>
                <th>Date / heure</th>
                <th>Code-barres</th>
                <th>Référence</th>
                <th>Projet / ligne</th>
                <th>{isOk ? 'Statut' : 'Défaut(s)'}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => {
                const barcode = record.BARCODE || record.barcode || '—'
                const defects = record.defauts || []
                return (
                  <tr key={record.ID || record.id || `${barcode}-${index}`}>
                    <td>{(record.CREATED_AT || record.createdAt || '').replace('T', ' ').slice(0, 16) || '—'}</td>
                    <td><code>{barcode}</code>
                      {[record.SCAN_CODE_2, record.SCAN_CODE_3].map((code, i) => code &&
                        <div key={i}><small>Code {i + 2} : </small><code>{code}</code></div>)}
                    </td>
                    <td>{record.REFERENCE || record.reference || '—'}</td>
                    <td>
                      {[record.PROJET || record.projet, record.LIGNE || record.ligne].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td>
                      {isOk ? (
                        <span className="delibera-scan-records__badge delibera-scan-records__badge--ok">OK</span>
                      ) : defects.length > 0 ? (
                        <div className="delibera-scan-records__defects">
                          {defects.map((defect, defectIndex) => (
                            <span key={defect.id || defect.codeDefaut || defectIndex}>
                              {defect.codeDefaut || defect.descDefaut || 'Défaut'}
                            </span>
                          ))}
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ── DefautGrid — grille inline de codes défauts (saisie rapide) ───────────────
function DefautGrid({ defCodes, selected, onChange, searchRef }) {
  const [search, setSearch] = useState('')

  const filtered = defCodes.filter(d => {
    const q = search.toLowerCase()
    return !q || d.cod.toLowerCase().includes(q) || (d.description||'').toLowerCase().includes(q)
  })

  const toggle = (cod, desc) => {
    if (selected.find(s => s.codeDefaut === cod)) onChange(selected.filter(s => s.codeDefaut !== cod))
    else onChange([...selected, { codeDefaut: cod, descDefaut: desc }])
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {/* Barre de recherche */}
      <div style={{ position:'relative' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
          style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', width:14, height:14, pointerEvents:'none' }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          ref={searchRef}
          type="text"
          placeholder="Filtrer codes défauts… (ex: 01, couture…)"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width:'100%', boxSizing:'border-box', paddingLeft:32, paddingRight:12,
            paddingTop:9, paddingBottom:9, border:`2px solid ${C}44`, borderRadius:9,
            fontSize:13, outline:'none', background:'#fafaff', fontWeight:500 }}
          onFocus={e => { e.target.style.borderColor = C; e.target.style.boxShadow = `0 0 0 3px ${C}18` }}
          onBlur={e => { e.target.style.borderColor = `${C}44`; e.target.style.boxShadow = 'none' }}
        />
      </div>

      {/* Chips sélectionnées */}
      {selected.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:5, padding:'6px 10px',
          background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:8 }}>
          <span style={{ fontSize:10, fontWeight:700, color:'#15803d', alignSelf:'center', marginRight:4, textTransform:'uppercase', letterSpacing:'.5px' }}>Sélectionnés :</span>
          {selected.map(s => (
            <span key={s.codeDefaut} style={{ display:'inline-flex', alignItems:'center', gap:4,
              fontSize:12, fontWeight:800, padding:'3px 9px', borderRadius:99,
              background:'#dcfce7', color:'#15803d', border:'1.5px solid #86efac' }}>
              {s.codeDefaut}
              <button type="button" onClick={() => toggle(s.codeDefaut)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#15803d',
                  fontSize:14, lineHeight:1, padding:0, display:'flex', alignItems:'center' }}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Grille de codes */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))',
        gap:6, maxHeight:220, overflowY:'auto',
        border:'1.5px solid #e2e8f0', borderRadius:9, padding:8, background:'#fafbfc' }}>
        {filtered.length === 0
          ? <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'18px 0', color:'#94a3b8', fontSize:13 }}>
              Aucun code trouvé
            </div>
          : filtered.map(d => {
              const isSel = Boolean(selected.find(s => s.codeDefaut === d.cod))
              return (
                <button key={d.cod} type="button" aria-pressed={isSel} onClick={() => toggle(d.cod, d.description)}
                  style={{ padding:'9px 8px', borderRadius:8, cursor:'pointer', textAlign:'left',
                    background: isSel ? '#dcfce7' : '#fff',
                    border: `2px solid ${isSel ? '#22c55e' : '#e2e8f0'}`,
                    transition:'all .12s', display:'flex', flexDirection:'column', gap:3,
                    outline:'none' }}
                  onMouseEnter={e => { if (!isSel) { e.currentTarget.style.borderColor = `${C}66`; e.currentTarget.style.background = '#f8f5ff' } }}
                  onMouseLeave={e => { if (!isSel) { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#fff' } }}>
                  <code style={{ fontSize:12, fontWeight:900, color: isSel ? '#15803d' : C, display:'block' }}>{d.cod}</code>
                  <span style={{ fontSize:10, color: isSel ? '#166534' : '#94a3b8', lineHeight:1.3,
                    overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                    {(d.description||'').slice(0,35)}
                  </span>
                  {isSel && (
                    <span style={{ fontSize:9, fontWeight:800, color:'#15803d', textTransform:'uppercase', letterSpacing:'.5px' }}>✓ sélectionné</span>
                  )}
                </button>
              )
            })}
      </div>
    </div>
  )
}

// ── ScanModal — création ou édition ultra-rapide ──────────────────────────────
function ScanModal({ mode, barcodeInfo, record, defCodes, defectsLoading, checkpointResults = [], onClose, onDone, showToast }) {
  const { t } = useLang()
  const isEdit = mode === 'edit'
  const initDefauts = isEdit
    ? (record?.defauts || []).map(d => ({ codeDefaut: d.codeDefaut, descDefaut: d.descDefaut }))
    : []

  const [posteIds,        setPosteIds]        = useState(() => {
    if (!isEdit) return []
    if (record?.postes?.length) return record.postes.map(p => String(p.ID))
    const id = record?.POSTE_ID ?? record?.posteId
    return id == null ? [] : [String(id)]
  })
  const [couturiereId,    setCouturiereId]    = useState(isEdit ? String(record?.COUTURIERE_ID ?? record?.couturiereId ?? '') : '')
  const [selectedDefauts, setSelectedDefauts] = useState(initDefauts)
  const [saving,          setSaving]          = useState(false)
  const [posteSearch,     setPosteSearch]     = useState('')
  const [modalPostes,      setModalPostes]      = useState([])
  const [modalCouturieres, setModalCouturieres] = useState([])
  const [couturiereSearch, setCouturiereSearch] = useState('')
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsError, setOptionsError] = useState('')
  const [optionsRetry, setOptionsRetry] = useState(0)

  // Refs pour l'auto-focus / auto-avance
  const couturiereRef = useRef(null)
  const defSearchRef  = useRef(null)
  const savingRef = useRef(false)

  const barcode = isEdit ? (record?.BARCODE || record?.barcode || '') : (barcodeInfo?.barcodeRaw || barcodeInfo?.barcode || '')
  const projet  = isEdit ? (record?.PROJET  || record?.projet  || '') : (barcodeInfo?.projet  || '')
  const ref_    = isEdit ? (record?.REFERENCE || record?.reference || '') : (barcodeInfo?.reference || '')
  const version = isEdit ? (record?.VERSION || record?.version || '') : (barcodeInfo?.version || '')
  const ligne_  = isEdit ? (record?.LIGNE || record?.ligne || '') : (barcodeInfo?.ligne || '')
  const design  = barcodeInfo?.designation || ''

  // Postes are global (POSTES.PROJET is NULL in DB) — always fetch all
  // Couturieres are project-specific — filter by the scanned piece's project
  useEffect(() => {
    let active = true
    setOptionsLoading(true); setOptionsError('')
    const proj = projet || undefined
    Promise.all([deliberaApi.getPostes(), deliberaApi.getCouturieres(proj ? { projet: proj } : {})])
      .then(([postes, couturieres]) => {
        if (!Array.isArray(postes) || !Array.isArray(couturieres))
          throw new Error('Liste des postes ou couturières invalide.')
        if (active) { setModalPostes(postes); setModalCouturieres(couturieres) }
      })
      .catch(e => { if (active) setOptionsError(e.response?.data?.error || e.message || 'Impossible de charger les postes et couturières.') })
      .finally(() => { if (active) setOptionsLoading(false) })
    return () => { active = false }
  }, [projet, optionsRetry])

  // Auto-focus sur Couturière à l'ouverture (Poste est maintenant un grid de cartes)
  useEffect(() => {
    setTimeout(() => couturiereRef.current?.focus(), 120)
  }, [])

  const handleCouturiereChange = (e) => {
    setCouturiereId(e.target.value)
    // Auto-avance vers la recherche de codes défauts
    setTimeout(() => defSearchRef.current?.focus(), 60)
  }

  const isPosteActive = (id) => posteIds.includes(id)
  const togglePoste = (id) => {
    setPosteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleSubmit = async () => {
    if (savingRef.current || optionsLoading || optionsError || defectsLoading) return
    if (!isEdit && selectedDefauts.length === 0) {
      showToast('Sélectionnez au moins un code défaut', 'error')
      setTimeout(() => defSearchRef.current?.focus(), 60)
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      let result
      if (isEdit) {
        result = await deliberaApi.updateRecord(record.ID ?? record.id, {
          posteId:      posteIds.length ? Number(posteIds[0]) : null,
          posteIds:     posteIds.map(Number),
          couturiereId: couturiereId ? Number(couturiereId) : null,
          defauts:      selectedDefauts,
        })
      } else {
        result = await deliberaApi.createRecord({
          barcode:      barcodeInfo.barcodeRaw || '',
          scanCodes:    barcodeInfo.scanCodes,
          checkpointResults,
          statutReprise: 'NOT_RETURNED',
          projet, reference: ref_, version, ligne: barcodeInfo?.ligne || null,
          posteId:      posteIds.length > 0 ? Number(posteIds[0]) : null,
          posteIds:     posteIds.map(Number),
          couturiereId: couturiereId ? Number(couturiereId) : null,
          defauts:      selectedDefauts,
        })
      }
      onDone(result)
    } catch (e) {
      showToast(e.response?.data?.error || e.message || 'Erreur', 'error')
      savingRef.current = false
      setSaving(false)
    }
  }

  const field = (label, children, required = false) => (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <label style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.5px' }}>
        {label}{required && <span style={{ color:'#e53e3e', marginLeft:3 }}>*</span>}
      </label>
      {children}
    </div>
  )

  const selectStyle = {
    padding:'12px 14px', border:'2px solid #e2e8f0', borderRadius:10, fontSize:14,
    outline:'none', background:'#fff', fontWeight:600, color:'#334155', width:'100%',
    cursor:'pointer', transition:'border-color .15s',
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1100, background:'rgba(10,14,30,0.6)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(3px)' }}>
      <div role="dialog" aria-modal="true" aria-label={isEdit ? 'Modifier la coiffe' : 'Ajouter une coiffe NOK'}
        style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:940,
        maxHeight:'94vh', overflow:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ background:`linear-gradient(135deg, ${C}, #5b21b6)`, padding:'16px 22px',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          borderRadius:'18px 18px 0 0', position:'sticky', top:0, zIndex:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {/* Icône 36px */}
            <div style={{ width:40, height:40, borderRadius:12, background:'rgba(255,255,255,0.18)',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              {isEdit
                ? <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width:20, height:20 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width:20, height:20 }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              }
            </div>
            <div>
              <div style={{ color:'#fff', fontWeight:800, fontSize:16 }}>
                {isEdit ? t('delibera_edit_entry') : 'Ajouter une coiffe NOK'}
              </div>
              <div style={{ color:'#e9d5ff', fontSize:12, marginTop:1, fontFamily:'monospace' }}>
                {barcode || 'Saisie manuelle'}
              </div>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Fermer"
            style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:36, height:36,
              borderRadius:10, cursor:'pointer', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        <div style={{ padding:'20px 26px', display:'flex', flexDirection:'column', gap:18 }}>
          {optionsLoading && <p role="status">Chargement des postes et couturières…</p>}
          {optionsError && <div role="alert" className="alert alert-error">{optionsError}
            <button type="button" onClick={() => setOptionsRetry(n => n + 1)}>Réessayer</button>
          </div>}
          <fieldset disabled={saving || optionsLoading} style={{ border:0, padding:0, margin:0, minWidth:0, display:'flex', flexDirection:'column', gap:18 }}>

          {/* Infos pièce */}
          {(projet || ref_ || version || ligne_ || design) && (
            <div style={{ background:`${C}08`, border:`1.5px solid ${C}22`, borderRadius:12, padding:'12px 16px',
              display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))', gap:10 }}>
              {[['Projet', projet], ['Ligne', ligne_], ['Référence', ref_], ['Version', version], ['Désignation', design]]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} style={{ display:'flex', flexDirection:'column', gap:1 }}>
                    <span style={{ fontSize:9, color:`${C}99`, fontWeight:800, textTransform:'uppercase', letterSpacing:'.6px' }}>{k}</span>
                    <span style={{ fontSize:13, fontWeight:800, color:'#1e293b' }}>{v}</span>
                  </div>
                ))}
            </div>
          )}

          {/* Two-column layout: Poste + Couturière */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap:20 }}>

          {/* Étape 1 — Poste (card grid) */}
          {field('① Poste',
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {/* Barre de recherche postes */}
              <div style={{ position:'relative' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
                  style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', width:14, height:14, pointerEvents:'none' }}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  placeholder="Rechercher par code ou nom..."
                  value={posteSearch}
                  onChange={e => setPosteSearch(e.target.value)}
                  style={{ width:'100%', boxSizing:'border-box', paddingLeft:32, paddingRight:12,
                    paddingTop:9, paddingBottom:9, border:`2px solid ${C}44`, borderRadius:9,
                    fontSize:13, outline:'none', background:'#fafaff', fontWeight:500 }}
                  onFocus={e => { e.target.style.borderColor = C; e.target.style.boxShadow = `0 0 0 3px ${C}18` }}
                  onBlur={e => { e.target.style.borderColor = `${C}44`; e.target.style.boxShadow = 'none' }}
                />
              </div>
              {/* Chips postes sélectionnés — mode nouvelle saisie uniquement */}
              {posteIds.length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:5, padding:'6px 10px',
                  background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:8 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:'#15803d', alignSelf:'center', marginRight:4, textTransform:'uppercase', letterSpacing:'.5px' }}>Sélectionnés :</span>
                  {posteIds.map(id => {
                    const found = modalPostes.find(p => String(p.ID || p.id) === id)
                    const label = found ? (found.NOM || found.nom || id) : id
                    return (
                      <span key={id} style={{ display:'inline-flex', alignItems:'center', gap:4,
                        fontSize:12, fontWeight:800, padding:'3px 9px', borderRadius:99,
                        background:'#dcfce7', color:'#15803d', border:'1.5px solid #86efac' }}>
                        {label}
                        <button type="button" onClick={() => togglePoste(id)}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#15803d',
                            fontSize:14, lineHeight:1, padding:0, display:'flex', alignItems:'center' }}>×</button>
                      </span>
                    )
                  })}
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6, maxHeight:220, overflowY:'auto', paddingRight:2 }}>
                {/* "Aucun" card — toujours visible */}
                <button
                  onClick={() => {
                    setPosteIds([])
                  }}
                  style={{
                    padding:'8px 6px', borderRadius:9, cursor:'pointer', fontSize:11, fontWeight:600,
                    border: posteIds.length === 0 ? `2px solid ${C}` : '2px solid #e2e8f0',
                    background: posteIds.length === 0 ? `${C}12` : '#f8fafc',
                    color: posteIds.length === 0 ? C : '#94a3b8',
                    textAlign:'center', transition:'all .12s',
                  }}>
                  Aucun
                </button>
                {modalPostes
                  .filter(p => {
                    const nom  = (p.NOM  || p.nom  || '').toLowerCase()
                    const code = (p.CODE || p.code || '').toLowerCase()
                    const q    = posteSearch.toLowerCase()
                    return !q || nom.includes(q) || code.includes(q)
                  })
                  .map(p => {
                    const id   = String(p.ID || p.id)
                    const code = p.CODE || p.code || ''
                    const nom  = p.NOM  || p.nom  || ''
                    const active = isPosteActive(id)
                    return (
                      <button key={id} aria-pressed={active}
                        onClick={() => togglePoste(id)}
                        style={{
                          padding:'8px 6px', borderRadius:9, cursor:'pointer', textAlign:'center',
                          border: active ? `2px solid ${C}` : '2px solid #e2e8f0',
                          background: active ? `${C}12` : '#f8fafc',
                          transition:'all .12s', display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                        }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke={active ? C : '#94a3b8'} strokeWidth="2" style={{ width:14, height:14, flexShrink:0 }}>
                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                        </svg>
                        {code && <span style={{ fontSize:9, fontWeight:800, color: active ? C : '#64748b', fontFamily:'monospace', background: active ? `${C}22` : '#e2e8f0', borderRadius:3, padding:'1px 4px' }}>{code}</span>}
                        <span style={{ fontSize:10, fontWeight:700, color: active ? '#1e293b' : '#475569', lineHeight:1.2, wordBreak:'break-word' }}>{nom}</span>
                      </button>
                    )
                  })
                }
              </div>
            </div>
          )}

          {/* Étape 2 — Couturière */}
          {field('② Couturière',
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <input type="search" aria-label="Rechercher une couturière" placeholder="Rechercher par nom ou matricule…"
              value={couturiereSearch} onChange={e => setCouturiereSearch(e.target.value)} style={selectStyle} />
            <select ref={couturiereRef} aria-label="Couturière" value={couturiereId} onChange={handleCouturiereChange}
              style={{ ...selectStyle, minHeight: 48 }}
              onFocus={e => { e.target.style.borderColor = C; e.target.style.boxShadow = `0 0 0 3px ${C}18` }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}>
              <option value="">— Aucune couturière —</option>
              {modalCouturieres.filter(c => String(c.id) === couturiereId || ((c.actif === 1 || isEdit) &&
                `${c.nom} ${c.matricule}`.toLocaleLowerCase().includes(couturiereSearch.trim().toLocaleLowerCase()))).map(c => (
                <option key={c.id} value={c.id}>{c.nom} ({c.matricule})</option>
              ))}
            </select>
            </div>
          )}

          </div> {/* end two-column */}

          {/* Étape 3 — Codes défauts (grille inline, auto-avance depuis Couturière) */}
          {field('③ Codes défauts',
            <DefautGrid
              defCodes={defCodes}
              selected={selectedDefauts}
              onChange={setSelectedDefauts}
              searchRef={defSearchRef}
            />,
            !isEdit
          )}

          {/* Boutons */}
          <div style={{ display:'flex', gap:10, marginTop:4 }}>
            <button onClick={onClose}
              style={{ flex:1, padding:'14px', background:'#f1f5f9', color:'#475569',
                border:'1.5px solid #e2e8f0', borderRadius:11, cursor:'pointer', fontWeight:700, fontSize:14 }}>
              Annuler
            </button>
            <button onClick={handleSubmit} disabled={saving || optionsLoading || Boolean(optionsError) || defectsLoading}
              style={{ flex:2, padding:'14px', background: C, color:'#fff', border:'none',
                borderRadius:11, cursor: saving ? 'wait' : 'pointer', fontWeight:800, fontSize:15,
                boxShadow:`0 4px 14px ${C}55`, opacity: saving ? 0.6 : 1,
                display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              {saving
                ? <><div style={{ width:16, height:16, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>Enregistrement…</>
                : <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width:18, height:18 }}>
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {isEdit ? 'Mettre à jour' : 'Enregistrer'}
                  </>
              }
            </button>
          </div>
          </fieldset>
        </div>
      </div>
    </div>
  )
}

// ── VerifyModal — vérification des défauts d'une pièce ouverte ────────────────
function VerifyModal({ record, defCodes, onClose, onDone }) {
  const [defauts,    setDefauts]    = useState(record.defauts || [])
  const [newDefauts, setNewDefauts] = useState([])
  const [addingNew,  setAddingNew]  = useState(false)
  const [newCode,    setNewCode]    = useState('')
  const [saving,     setSaving]     = useState(false)

  const toggleVerif = (id) => setDefauts(prev => prev.map(d => d.id === id ? { ...d, verifie: !d.verifie } : d))

  const addNewDefaut = () => {
    if (!newCode) return
    const found = defCodes.find(d => d.cod === newCode)
    setNewDefauts(prev => [...prev, { codeDefaut: newCode, descDefaut: found?.description||'' }])
    setNewCode(''); setAddingNew(false)
  }

  const handleSubmit = async () => {
    const recId = safeId(record.id ?? record.ID)
    if (!recId) { alert('ID enregistrement invalide'); return }
    setSaving(true)
    try {
      const result = await deliberaApi.verifyRecord(recId, {
        defautsVerifies: defauts.filter(d => safeId(d.id)).map(d => ({ id: d.id, verifie: d.verifie })),
        newDefauts,
      })
      onDone(result)
    } catch (e) { alert(e.message); setSaving(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1100, background:'rgba(10,14,30,0.6)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(3px)' }}>
      <div style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:580,
        maxHeight:'90vh', overflow:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }}>

        <div style={{ background:`linear-gradient(135deg, ${C}, #5b21b6)`, padding:'18px 22px',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          borderRadius:'18px 18px 0 0', position:'sticky', top:0 }}>
          <div>
            <div style={{ color:'#fff', fontWeight:800, fontSize:16 }}>Vérification — Retour de pièce</div>
            <div style={{ color:'#e9d5ff', fontSize:12, marginTop:2, fontFamily:'monospace' }}>
              {record.BARCODE || record.barcode}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:32, height:32,
              borderRadius:8, cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:14 }}>

          {/* Infos pièce */}
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'12px 16px',
            display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[['Barcode',    record.BARCODE||record.barcode],
              ['Code 2', record.SCAN_CODE_2],
              ['Code 3', record.SCAN_CODE_3],
              ['Projet',     record.PROJET||record.projet],
              ['Ligne',      record.LIGNE||record.ligne],
              ['Référence',  record.REFERENCE||record.reference],
              ['Version',    record.VERSION||record.version],
              ['Couturière', record.COUTURIERE_NOM||record.couturiereNom||'—'],
              ['Poste',      record.POSTE_NOM||record.posteNom||'—']
            ].filter(([,v]) => v).map(([k,v]) => (
              <div key={k}>
                <span style={{ fontSize:10, color:'#94a3b8', fontWeight:700, textTransform:'uppercase' }}>{k}</span>
                <div style={{ fontSize:13, fontWeight:600, color:'#1e293b', marginTop:1 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Défauts à vérifier */}
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'#475569', marginBottom:8, textTransform:'uppercase', letterSpacing:'.5px' }}>
              Codes défauts à vérifier
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {defauts.map(d => (
                <div key={d.id} onClick={() => toggleVerif(d.id)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10,
                    border:`2px solid ${d.verifie ? '#86efac' : '#e2e8f0'}`,
                    background: d.verifie ? '#f0fdf4' : '#fff', cursor:'pointer', userSelect:'none',
                    transition:'all .15s' }}>
                  <div style={{ width:22, height:22, borderRadius:7, flexShrink:0,
                    border:`2px solid ${d.verifie ? '#15803d' : '#cbd5e1'}`,
                    background: d.verifie ? '#15803d' : '#fff',
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {d.verifie && <svg viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" style={{ width:12, height:12 }}><polyline points="1.5,6 4.5,9 10.5,3"/></svg>}
                  </div>
                  <code style={{ fontWeight:700, color:C, minWidth:64, fontSize:13 }}>{d.codeDefaut}</code>
                  <span style={{ fontSize:12, color:'#475569' }}>{d.descDefaut||''}</span>
                  {d.addedAt === 'VERIFY' && (
                    <span style={{ marginLeft:'auto', fontSize:10, color:C, background:'#f3f0ff', padding:'2px 8px', borderRadius:99 }}>nouveau</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Nouveaux défauts */}
          {newDefauts.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {newDefauts.map((nd, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px',
                  background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:8 }}>
                  <code style={{ fontWeight:700, color:'#92400e', fontSize:12 }}>{nd.codeDefaut}</code>
                  <span style={{ fontSize:12, color:'#92400e' }}>{nd.descDefaut}</span>
                  <button onClick={() => setNewDefauts(p => p.filter((_,j) => j !== i))}
                    style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'#92400e', fontSize:16 }}>×</button>
                </div>
              ))}
            </div>
          )}

          {addingNew ? (
            <div style={{ display:'flex', gap:8 }}>
              <select value={newCode} onChange={e => setNewCode(e.target.value)}
                style={{ flex:1, padding:'9px 10px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:13, outline:'none' }}>
                <option value="">Choisir un code…</option>
                {defCodes.map(d => <option key={d.cod} value={d.cod}>{d.cod} — {d.description}</option>)}
              </select>
              <button onClick={addNewDefaut}
                style={{ padding:'9px 14px', background:C, color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700 }}>Ajouter</button>
              <button onClick={() => { setAddingNew(false); setNewCode('') }}
                style={{ padding:'9px 12px', background:'#f1f5f9', color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer' }}>Annuler</button>
            </div>
          ) : (
            <button onClick={() => setAddingNew(true)}
              style={{ alignSelf:'flex-start', padding:'7px 16px', background:'#f3f0ff', color:C,
                border:`1px solid ${C}44`, borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 }}>
              + Ajouter un code défaut
            </button>
          )}

          <div style={{ display:'flex', gap:10, marginTop:4 }}>
            <button onClick={onClose}
              style={{ flex:1, padding:13, background:'#f1f5f9', color:'#475569', border:'1.5px solid #e2e8f0', borderRadius:11, cursor:'pointer', fontWeight:700 }}>
              Annuler
            </button>
            <button onClick={handleSubmit} disabled={saving}
              style={{ flex:2, padding:13, background:C, color:'#fff', border:'none', borderRadius:11,
                cursor: saving ? 'wait' : 'pointer', fontWeight:800, fontSize:15,
                boxShadow:`0 4px 14px ${C}55`, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Enregistrement…' : 'Valider la vérification'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Page principale Délibéra ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function CheckpointReviewModal({ review, saving, onCancel, onConfirm }) {
  const [results, setResults] = useState(() => Object.fromEntries(
    review.checkpoints.map(checkpoint => {
      const existing = review.record?.checkpointResults?.find(item =>
        (item.CHECKPOINT || item.checkpoint) === checkpoint
      )
      return [checkpoint, existing?.STATUS || existing?.status || '']
    })
  ))
  const piece = review.piece
  const fieldStyle = { fontSize: 11, color: '#64748b' }
  const confirm = () => onConfirm(review.checkpoints.map(checkpoint => ({
    checkpoint,
    status: results[checkpoint],
  })))

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1200, background:'rgba(10,14,30,0.65)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'min(620px, 100%)', maxHeight:'90vh', overflowY:'auto', background:'#fff', borderRadius:14, boxShadow:'0 24px 70px rgba(0,0,0,.3)' }}>
        <div style={{ background:'#4f46e5', color:'#fff', padding:'18px 22px', borderRadius:'14px 14px 0 0' }}>
          <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em', opacity:.8 }}>CONTRÔLE DES CHECKPOINTS</div>
          <h3 style={{ margin:'7px 0 0', fontSize:18 }}>Résultat de chaque point de vérification</h3>
        </div>
        <div style={{ padding:20, display:'grid', gap:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'8px 16px', padding:12, background:'#f8fafc', borderRadius:8 }}>
            <div><span style={fieldStyle}>Projet</span><div>{piece.projet || '—'}</div></div>
            <div><span style={fieldStyle}>Ligne</span><div>{piece.ligne || '—'}</div></div>
            <div><span style={fieldStyle}>Version</span><div>{piece.version || '—'}</div></div>
            <div><span style={fieldStyle}>PDEF</span><div>{piece.pdef || '—'}</div></div>
            <div><span style={fieldStyle}>FAS / code-barres</span><div>{piece.barcodeRaw || piece.barcode || '—'}</div></div>
            <div><span style={fieldStyle}>Désignation</span><div>{piece.designation || '—'}</div></div>
            <div><span style={fieldStyle}>REF_DETAIL</span><div>{piece.reference || '—'}</div></div>
          </div>
          <div style={{ display:'grid', gap:10 }}>
            {review.checkpoints.map(checkpoint => (
              <div key={checkpoint} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'10px 12px', border:'1px solid #e2e8f0', borderRadius:8 }}>
                <strong style={{ fontSize:13, color:'#334155' }}>{checkpoint}</strong>
                <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                  {['OK', 'NOK'].map(status => {
                    const selected = results[checkpoint] === status
                    const color = status === 'OK' ? '#15803d' : '#dc2626'
                    return (
                      <button key={status} type="button" disabled={saving}
                        onClick={() => setResults(current => ({ ...current, [checkpoint]: status }))}
                        style={{ minWidth:64, padding:'7px 12px', border:`1px solid ${selected ? color : '#cbd5e1'}`, borderRadius:7, background:selected ? color : '#fff', color:selected ? '#fff' : '#475569', fontWeight:700, cursor:'pointer' }}>
                        {status}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:10, padding:'14px 20px', borderTop:'1px solid #e2e8f0' }}>
          <button type="button" onClick={onCancel} disabled={saving} className="btn btn-secondary">Annuler</button>
          <button type="button" onClick={confirm} disabled={saving || review.checkpoints.some(checkpoint => !results[checkpoint])}
            className="btn btn-primary">
            {saving ? 'Enregistrement…' : 'Valider les checkpoints'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Delibera() {
  const { can } = useAuth()
  const { t } = useLang()
  const canWrite = can('delibera', 'write')

  // ── Données dropdowns ──────────────────────────────────────────────────────
  const [projects,    setProjects]    = useState([])
  const [defCodes,    setDefCodes]    = useState([])
  const [couturieres, setCouturieres] = useState([])
  const [postes,      setPostes]      = useState([])

  // ── Filtres tableau ────────────────────────────────────────────────────────
  const [filterProjet,     setFilterProjet]     = useState('')
  const [filterStatut,     setFilterStatut]     = useState('')
  const [filterDate,       setFilterDate]       = useState('today')
  const [filterRefDetail,  setFilterRefDetail]  = useState('')
  const [filterShift,      setFilterShift]      = useState('')
  const [filterUser,       setFilterUser]       = useState('')
  const [userList,         setUserList]         = useState([])
  const [dateFrom,         setDateFrom]         = useState('')
  const [dateTo,           setDateTo]           = useState('')

  // ── Scan ───────────────────────────────────────────────────────────────────
  const [barcode,     setBarcode]     = useState('')
  const [scanning,    setScanning]    = useState(false)
  const barcodeRef = useRef(null)
  const [pendingNokPiece, setPendingNokPiece] = useState(null)
  const pendingNokPieceRef = useRef(null)
  const [pendingNokCheckpointResults, setPendingNokCheckpointResults] = useState([])
  const [checkpointReview, setCheckpointReview] = useState(null)
  const [checkpointReviewSaving, setCheckpointReviewSaving] = useState(false)
  const [defCodesLoading, setDefCodesLoading] = useState(true)
  const nokScanningRef = useRef(false)
  const [okBarcode, setOkBarcode] = useState('')
  const [okScanning, setOkScanning] = useState(false)
  const okBarcodeRef = useRef(null)
  const okScanningRef = useRef(false)
  const [scanRecords, setScanRecords] = useState({ ok: [], nok: [] })
  const [scanRecordsTotal, setScanRecordsTotal] = useState({ ok: 0, nok: 0 })
  const [scanRecordsLoading, setScanRecordsLoading] = useState(false)
  const [scanRecordsError, setScanRecordsError] = useState('')
  const [scanPage, setScanPage] = useState('coiffe-ok')
  const [scanType, setScanType] = useState(null)
  const [showScanSetup, setShowScanSetup] = useState(true)
  const importFileRef = useRef(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [importFilter, setImportFilter] = useState({ type:'ALL', dateFrom:'', dateTo:'' })

  // ── Tableau ────────────────────────────────────────────────────────────────
  const [rows,       setRows]       = useState([])
  const [pagination, setPagination] = useState({ currentPage:1, totalPages:1, totalRecords:0, recordsPerPage:50 })
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(true)

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const [kpis, setKpis] = useState({ TOTAL:0, RETURNED:0, NOT_RETURNED:0 })

  // ── Modales ────────────────────────────────────────────────────────────────
  const [scanModal,    setScanModal]    = useState(null)  // { mode:'new'|'edit', barcodeInfo?, record? }
  const [verifyRecord, setVerifyRecord] = useState(null)
  const [returnRecord, setReturnRecord] = useState(null)
  const [toast,        setToast]        = useState(null)

  const showToast = (msg, type='success') => setToast({ msg, type })
  const todayStr    = () => new Date().toISOString().slice(0,10)
  const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10) }

  const buildDateParams = useCallback(() => {
    if (filterDate === 'today')  return { dateFrom: todayStr(), dateTo: todayStr() }
    if (filterDate === 'month')  return { dateFrom: firstOfMonth(), dateTo: todayStr() }
    if (filterDate === 'custom') return { dateFrom, dateTo }
    return {}
  }, [filterDate, dateFrom, dateTo])

  const loadRecords = useCallback(() => {
    setLoading(true)
    const dp = buildDateParams()
    deliberaApi.getRecords({
      projet:    filterProjet    || undefined,
      statut:    filterStatut    || undefined,
      refDetail: filterRefDetail || undefined,
      shift:     filterShift     || undefined,
      createdBy: filterUser      || undefined,
      page, limit: 50, ...dp
    })
      .then(d => { setRows(d.records||[]); setPagination(d.pagination||{}) })
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [page, filterProjet, filterStatut, filterRefDetail, filterShift, filterUser, buildDateParams])

  const loadScanRecords = useCallback(async () => {
    setScanRecordsLoading(true)
    setScanRecordsError('')
    try {
      const [okResult, nokResult] = await Promise.all([
        deliberaApi.getRecords({ statut: 'RETURNED', page: 1, limit: 10 }),
        deliberaApi.getRecords({ statut: 'NOT_RETURNED', page: 1, limit: 10 }),
      ])
      setScanRecords({
        ok: okResult?.records || [],
        nok: nokResult?.records || [],
      })
      setScanRecordsTotal({
        ok: okResult?.pagination?.totalRecords || 0,
        nok: nokResult?.pagination?.totalRecords || 0,
      })
    } catch (error) {
      console.error('Failed to load recent Délibéra scan records', error)
      setScanRecordsError('Impossible de charger le tableau des pièces enregistrées.')
    } finally {
      setScanRecordsLoading(false)
    }
  }, [])

  const loadKpis = useCallback(() => {
    const dp   = buildDateParams()
    const base = {
      projet:    filterProjet    || undefined,
      refDetail: filterRefDetail || undefined,
      shift:     filterShift     || undefined,
      createdBy: filterUser      || undefined,
      limit: 1, page: 1, ...dp,
    }
    Promise.all([
      deliberaApi.getRecords(base).catch(() => null),
      deliberaApi.getRecords({ ...base, statut: 'RETURNED'     }).catch(() => null),
      deliberaApi.getRecords({ ...base, statut: 'NOT_RETURNED' }).catch(() => null),
    ]).then(([all, ret, notRet]) => {
      setKpis({
        TOTAL:        all?.pagination?.totalRecords    ?? 0,
        RETURNED:     ret?.pagination?.totalRecords    ?? 0,
        NOT_RETURNED: notRet?.pagination?.totalRecords ?? 0,
      })
    }).catch(() => {})
  }, [filterProjet, filterRefDetail, filterShift, filterUser, buildDateParams])

  // ── Mount ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    projectsApi.getProjects().then(d => {
      const raw = d?.projects || []
      const seen = new Set()
      const deduped = raw
        .map(p => ({ ...(typeof p === 'object' ? p : { name: p }), name: (p?.name || p || '').toUpperCase() }))
        .filter(p => { if (!p.name || seen.has(p.name)) return false; seen.add(p.name); return true })
      setProjects(deduped)
    }).catch(() => {})
    lookupApi.defCodesList().then(d => {
      const raw = Array.isArray(d) ? d : (d?.defCodes || d?.codes || [])
      const seen = new Set()
      setDefCodes(raw.filter(item => { if (seen.has(item.cod)) return false; seen.add(item.cod); return true }))
    }).catch(error => {
      console.error('Failed to load Délibéra defect codes', error)
      showToast('Impossible de charger la liste des défauts.', 'error')
    }).finally(() => setDefCodesLoading(false))
    deliberaApi.getCouturieres({}).then(d => setCouturieres(Array.isArray(d) ? d : [])).catch(() => {})
    deliberaApi.getPostes().then(d => setPostes(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!canWrite || !scanType || showScanSetup) return
      if (scanPage === 'coiffe-ok') okBarcodeRef.current?.focus()
      if (scanPage === 'nok') barcodeRef.current?.focus()
    }, 150)
    return () => clearTimeout(timer)
  }, [canWrite, scanPage, scanType, showScanSetup])

  useEffect(() => { loadRecords() }, [loadRecords])
  useEffect(() => { loadKpis() }, [loadKpis])
  useEffect(() => { loadScanRecords() }, [loadScanRecords])

  useEffect(() => {
    const proj = filterProjet || undefined
    deliberaApi.getCouturieres(proj ? { projet: proj } : {}).then(d => setCouturieres(Array.isArray(d) ? d : [])).catch(() => {})
    deliberaApi.getPostes(proj).then(d => setPostes(Array.isArray(d) ? d : [])).catch(() => {})
    deliberaApi.getUsers(proj).then(d => setUserList(Array.isArray(d) ? d : [])).catch(() => {})
  }, [filterProjet])

  // ── Scan barcode ──────────────────────────────────────────────────────────
  const checkScanType = data => {
    if (!scanType || showScanSetup) throw new Error('Validez le projet, la ligne et la version avant de scanner.')
    const text = value => String(value ?? '').trim()
    if (!('ligne' in data)) throw new Error('Impossible de vérifier la ligne de cette pièce. Vérifiez sa référence dans le projet.')
    const matches = text(data.projet).toUpperCase() === scanType.projet.toUpperCase()
      && text(data.version) === scanType.version
      && text(data.ligne) === scanType.ligne
    if (!matches) throw new Error(`Pièce refusée : le type ne correspond pas à ${scanType.projet} / ${scanType.ligne || 'Sans ligne'} / ${scanType.version || 'Sans version'}.`)
  }

  const openCheckpointReview = async (piece, mode, record = null) => {
    if (!piece?.projet || !piece?.pdef) return false
    const data = await projectsApi.getRefCheckpoints(piece.projet, piece.pdef)
    const checkpoints = data?.checkpoints || []
    if (checkpoints.length === 0) return false
    setCheckpointReview({ piece, mode, record, checkpoints })
    return true
  }

  const submitCheckpointReview = async checkpointResults => {
    if (!checkpointReview || checkpointReviewSaving) return
    const { piece, mode, record } = checkpointReview
    const savedResults = checkpointResults.map(result => ({
      ...result,
      project: piece.projet || '',
      ligne: piece.ligne || '',
      pdef: piece.pdef || '',
      fas: piece.barcodeRaw || piece.barcode || '',
      designation: piece.designation || '',
      version: piece.version || '',
      refDetail: piece.reference || '',
    }))
    setCheckpointReviewSaving(true)
    try {
      if (mode === 'ok-new') {
        await deliberaApi.createRecord({
          barcode: piece.barcodeRaw,
          scanCodes: piece.scanCodes,
          projet: piece.projet || null,
          reference: piece.reference || null,
          version: piece.version || null,
          ligne: piece.ligne || null,
          statutReprise: 'RETURNED',
          defauts: [],
          checkpointResults: savedResults,
        })
        setCheckpointReview(null)
        showToast('Pièce OK enregistrée avec les checkpoints ✓')
        loadRecords()
        loadKpis()
        loadScanRecords()
        window.setTimeout(() => okBarcodeRef.current?.focus(), 100)
      } else if (mode === 'nok-new') {
        pendingNokPieceRef.current = piece
        setPendingNokPiece(piece)
        setPendingNokCheckpointResults(savedResults)
        setCheckpointReview(null)
        showToast('Points de vérification conservés. Complétez maintenant la fenêtre NOK.', 'warning')
      } else {
        const recordId = record.ID ?? record.id
        await deliberaApi.setRecordCheckpoints(recordId, savedResults)
        const updatedRecord = { ...record, checkpointResults: savedResults }
        setCheckpointReview(null)
        if (mode === 'ok-existing') setReturnRecord(updatedRecord)
        else setVerifyRecord(updatedRecord)
        window.setTimeout(() => (mode === 'ok-existing' ? okBarcodeRef : barcodeRef).current?.focus(), 100)
      }
    } catch (error) {
      showToast(error?.response?.data?.error || error.message || 'Erreur lors de l’enregistrement des checkpoints', 'error')
    } finally {
      setCheckpointReviewSaving(false)
    }
  }

  const triggerScan = async (scanCodes = [barcode.trim()]) => {
    const scannedValue = scanCodes[0]
    if (nokScanningRef.current || pendingNokPieceRef.current || verifyRecord || returnRecord) return
    nokScanningRef.current = true
    setBarcode('')
    setScanning(true)
    try {
      if (!scanType || showScanSetup) throw new Error('Validez le type de pièce avant de scanner.')
      const data = await deliberaApi.validateScan(scanType.projet, scanCodes, scanType.version)
      if (data.wasReturnedBefore) {
        window.dispatchEvent(new CustomEvent('barcode-error', { detail: {
          title: 'Pièce déjà scannée',
          message: 'Cette pièce existe déjà : elle a déjà été retournée. Rescan impossible.',
          barcode: scannedValue,
          hint: 'Enregistrement bloqué. Vérifiez la pièce dans l’historique avant de continuer.',
        } }))
        return
      }
      if (data.found) checkScanType(data)
      if (data.hasOpenRecord) {
        const recId = safeId(data.recordId)
        if (recId) {
          const d = await deliberaApi.getRecord(recId)
          const statut = d?.STATUT_REPRISE || d?.statutReprise
          if (statut === 'RETURNED') {
            showToast('Pièce déjà retournée – modification interdite', 'warning')
            return
          }
          const piece = { ...data, barcodeRaw: scannedValue, scanCodes }
          const hasCheckpoints = await openCheckpointReview(piece, 'nok-existing', d)
          if (!hasCheckpoints) setVerifyRecord(d)
          showToast('Cette coiffe est déjà enregistrée NOK. Vérifiez les défauts existants.', 'warning')
        } else {
          showToast('Enregistrement introuvable (ID manquant)', 'warning')
        }
        return
      }

      if (data.found) {
        const piece = { ...data, barcodeRaw: scannedValue, scanCodes }
        if (await openCheckpointReview(piece, 'nok-new')) return
        pendingNokPieceRef.current = piece
        setPendingNokPiece(piece)
        showToast('Pièce reconnue. Complétez les postes, la couturière et les défauts, puis enregistrez.', 'warning')
      } else {
        showToast('Code-barres non référencé dans aucun projet', 'error')
      }
    } catch (error) {
      showToast(error?.response?.data?.error || error.message || 'Erreur lors du scan', 'error')
    } finally {
      nokScanningRef.current = false
      setScanning(false)
      setTimeout(() => {
        if (!pendingNokPieceRef.current) barcodeRef.current?.focus()
      }, 100)
    }
  }

  const triggerOkScan = async (scanCodes = [okBarcode.trim()]) => {
    const scannedBarcode = scanCodes[0]
    if (okScanningRef.current || returnRecord || verifyRecord) return

    okScanningRef.current = true
    setOkScanning(true)
    setOkBarcode('')
    try {
      if (!scanType || showScanSetup) throw new Error('Validez le type de pièce avant de scanner.')
      const data = await deliberaApi.validateScan(scanType.projet, scanCodes, scanType.version)
      if (!data.found) throw new Error('Code-barres non référencé dans aucun projet')
      if (data.wasReturnedBefore) {
        window.dispatchEvent(new CustomEvent('barcode-error', { detail: {
          title: 'Pièce déjà scannée',
          message: 'Cette pièce existe déjà : elle a déjà été scannée et enregistrée OK.',
          barcode: scannedBarcode,
          hint: 'Enregistrement bloqué. Vérifiez la pièce dans l’historique avant de continuer.',
        } }))
        return
      }
      checkScanType(data)
      if (data.hasOpenRecord) {
        const recId = safeId(data.recordId)
        if (!recId) throw new Error('Enregistrement NOK introuvable (ID manquant)')
        const record = await deliberaApi.getRecord(recId)
        if ((record.STATUT_REPRISE || record.statutReprise) !== 'NOT_RETURNED') {
          throw new Error('Cette coiffe est déjà OK. Aucun nouvel enregistrement ne sera créé.')
        }
        checkScanType({ projet: record.PROJET ?? record.projet, ligne: record.LIGNE ?? record.ligne,
          version: record.VERSION ?? record.version })
        const piece = { ...data, barcodeRaw: scannedBarcode, scanCodes }
        const hasCheckpoints = await openCheckpointReview(piece, 'ok-existing', record)
        if (!hasCheckpoints) setReturnRecord(record)
        return
      }

      const piece = { ...data, barcodeRaw: scannedBarcode, scanCodes }
      if (await openCheckpointReview(piece, 'ok-new')) return
      await deliberaApi.createRecord({
        barcode: scannedBarcode,
        scanCodes,
        projet: data.projet || null,
        reference: data.reference || null,
        version: data.version || null,
        ligne: data.ligne || null,
        statutReprise: 'RETURNED',
        defauts: [],
      })
      showToast('Pièce OK enregistrée ✓')
      loadRecords()
      loadKpis()
      loadScanRecords()
    } catch (error) {
      showToast(error?.response?.data?.error || error.message || "Erreur lors de l'enregistrement de la pièce OK", 'error')
    } finally {
      okScanningRef.current = false
      setOkScanning(false)
      setTimeout(() => okBarcodeRef.current?.focus(), 100)
    }
  }

  const selectScanPage = (pageKey) => {
    if (nokScanningRef.current || okScanningRef.current || pendingNokPieceRef.current || returnRecord || verifyRecord) return
    setScanPage(pageKey)
    setBarcode('')
    setOkBarcode('')
    pendingNokPieceRef.current = null
    setPendingNokPiece(null)
    window.setTimeout(() => {
      if (pageKey === 'coiffe-ok') okBarcodeRef.current?.focus()
      if (pageKey === 'nok') barcodeRef.current?.focus()
    }, 100)
  }

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportMessage('Lecture du fichier…')
    let inserted = 0
    let skipped = 0
    const errors = []
    try {
      const sourceRows = await parseExcelFile(file)
      const normalize = (value) => String(value ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z0-9]/g, '')
      const toText = (value) => value instanceof Date
        ? value.toISOString().slice(0, 16).replace('T', ' ')
        : String(value ?? '').trim()
      const recordsByBarcode = new Map()

      for (const [index, sourceRow] of sourceRows.entries()) {
        const columns = new Map(Object.entries(sourceRow).map(([key, value]) => [normalize(key), value]))
        const col = (...names) => {
          for (const name of names) {
            const value = columns.get(normalize(name))
            if (value !== undefined && value !== null && String(value).trim() !== '') return value
          }
          return ''
        }
        const barcodeValue = toText(col('Barcode', 'Bar Code'))
        if (!barcodeValue) continue

        const dateValue = col('Date/Heure', 'Date', 'Created At')
        if (importFilter.type !== 'ALL') {
          const date = dateValue instanceof Date ? dateValue : new Date(dateValue)
          if (!dateValue || Number.isNaN(date.getTime())) continue
          const now = new Date()
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
          if (importFilter.type === 'TODAY' && startOfDate.getTime() !== startOfToday.getTime()) continue
          if (importFilter.type === 'THIS_WEEK') {
            const weekStart = new Date(startOfToday)
            weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
            if (date < weekStart) continue
          }
          if (importFilter.type === 'THIS_MONTH' &&
              (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear())) continue
          if (importFilter.type === 'CUSTOM' &&
              ((importFilter.dateFrom && date < new Date(`${importFilter.dateFrom}T00:00:00`)) ||
               (importFilter.dateTo && date > new Date(`${importFilter.dateTo}T23:59:59`)))) continue
        }

        const statusValue = normalize(col('Statut', 'Status', 'Statut reprise', 'Record Status'))
        const status = ['RETURNED', 'RETOURNEE', 'OK'].includes(statusValue) ? 'RETURNED'
          : ['NOTRETURNED', 'NONRETOURNEE', 'OPEN', 'CLOSED', 'SCRAP', 'NOK'].includes(statusValue) || !statusValue ? 'NOT_RETURNED'
          : null
        if (!status) {
          errors.push(`Ligne ${index + 2}: statut invalide`)
          continue
        }
        const barcodeKey = barcodeValue
        const record = recordsByBarcode.get(barcodeKey) || {
          barcode: barcodeValue,
          scanCodes: [barcodeValue, toText(col('Code 2')), toText(col('Code 3'))].filter((value, i, values) =>
            i === 0 || value || (i === 1 && values[2])),
          projet: toText(col('Projet', 'Project')),
          reference: toText(col('Référence', 'Reference', 'Ref')),
          version: toText(col('Version')),
          ligne: toText(col('Ligne', 'Line')),
          poste: toText(col('Poste')),
          couturiere: toText(col('Couturière', 'Couturiere', 'Seamstress')),
          checkpoint: toText(col('Checkpoint')),
          statutReprise: status,
          defauts: [],
        }
        if (record.statutReprise !== status) {
          errors.push(`Ligne ${index + 2}: statuts différents pour le barcode ${barcodeValue}`)
          continue
        }

        const rawCodes = toText(col('Codes défauts', 'Codes Defauts', 'Code défaut', 'Code Defaut', 'Code Def'))
        const rawDescriptions = toText(col('Desc. défauts', 'Descriptions défauts', 'Desc Defauts', 'Description défaut', 'Desc Def'))
        const codes = rawCodes.split(/[,;|]/).map(code => code.trim()).filter(Boolean)
        const descriptions = rawDescriptions.split('|').map(description => description.trim())
        for (const code of codes) {
          if (!record.defauts.some(defaut => defaut.codeDefaut === code)) {
            record.defauts.push({
              codeDefaut: code,
              descDefaut: descriptions[codes.indexOf(code)] || '',
            })
          }
        }
        recordsByBarcode.set(barcodeKey, record)
      }

      const importedRecords = Array.from(recordsByBarcode.values())
      if (!importedRecords.length) throw new Error('Aucune ligne valide trouvée dans le fichier')
      const projectOptions = new Map()
      for (const [index, record] of importedRecords.entries()) {
        setImportMessage(`Importation… ${index + 1}/${importedRecords.length}`)
        if (record.statutReprise === 'NOT_RETURNED' && record.defauts.length === 0) {
          errors.push(`${record.barcode}: code défaut requis pour une coiffe NOK`)
          continue
        }
        const existing = await deliberaApi.lookupBarcode(record.barcode)
        if (existing.hasOpenRecord || existing.wasReturnedBefore) {
          skipped++
          continue
        }

        let posteIds = []
        let couturiereId = null
        if (record.projet && !projectOptions.has(record.projet.toUpperCase())) {
          const [posteRows, couturiereRows] = await Promise.all([
            deliberaApi.getPostes(),
            deliberaApi.getCouturieres({ projet: record.projet }),
          ])
          projectOptions.set(record.projet.toUpperCase(), {
            postes: Array.isArray(posteRows) ? posteRows : [],
            couturieres: Array.isArray(couturiereRows) ? couturiereRows : [],
          })
        }
        const options = projectOptions.get(record.projet.toUpperCase()) || { postes, couturieres }
        const matchByName = (items, name, alternatives = []) => {
          if (!name) return null
          const target = normalize(name)
          const item = items.find(option => [option.NOM, option.nom, option.CODE, option.MATRICULE]
            .some(value => normalize(value) === target) || alternatives.some(value => normalize(value) === target))
          return item ? Number(item.ID ?? item.id) : null
        }
        const singlePoste = matchByName(options.postes, record.poste)
        posteIds = singlePoste ? [singlePoste] : record.poste
          ? record.poste.split(' / ').map(name => matchByName(options.postes, name)) : []
        couturiereId = matchByName(options.couturieres, record.couturiere)
        if (posteIds.some(id => !id) || (record.couturiere && !couturiereId)) {
          errors.push(`${record.barcode}: poste ou couturière introuvable (${record.poste || record.couturiere})`)
          continue
        }
        try {
          await deliberaApi.createRecordSilent({
            barcode: record.barcode,
            scanCodes: record.scanCodes,
            projet: record.projet || null,
            reference: record.reference || null,
            version: record.version || null,
            ligne: record.ligne || null,
            checkpoint: record.checkpoint || null,
            posteId: posteIds[0] ?? null,
            posteIds,
            couturiereId,
            statutReprise: record.statutReprise,
            defauts: record.defauts,
          })
          inserted++
        } catch (e) {
          errors.push(`${record.barcode}: ${e.response?.data?.error || e.message || "erreur d'enregistrement"}`)
        }
      }
      loadRecords()
      loadKpis()
      const summary = `Import terminé : ${inserted} inséré(s), ${skipped} ignoré(s), ${errors.length} erreur(s)`
      setImportMessage(errors.length ? `${summary}\n${errors.slice(0, 3).join('\n')}` : summary)
      if (!errors.length) {
        setShowImportModal(false)
        showToast(summary)
      } else {
        showToast(summary, 'warning')
      }
    } catch (e) {
      if (inserted > 0) {
        loadRecords()
        loadKpis()
      }
      setImportMessage(`Erreur import : ${e.message}${inserted ? ` (${inserted} enregistrement(s) déjà importé(s))` : ''}`)
    } finally {
      setImporting(false)
      event.target.value = ''
    }
  }

  // ── Actions tableau ────────────────────────────────────────────────────────
  const openEdit = (r) => {
    const id = safeId(r.ID ?? r.id)
    if (!id) { showToast('ID invalide', 'error'); return }
    deliberaApi.getRecord(id)
      .then(d => setScanModal({ mode:'edit', record: d }))
      .catch(() => showToast('Erreur chargement', 'error'))
  }

  const openVerify = (r) => {
    const id = safeId(r.ID ?? r.id)
    if (!id) { showToast('ID invalide', 'error'); return }
    deliberaApi.getRecord(id)
      .then(d => {
        const statut = d?.STATUT_REPRISE || d?.statutReprise
        if (statut === 'RETURNED') {
          showToast('Pièce déjà retournée – modification interdite', 'warning')
          return
        }
        setVerifyRecord(d)
      })
      .catch(() => showToast('Erreur chargement', 'error'))
  }

  const handleDelete = async (r) => {
    const id = safeId(r.ID ?? r.id)
    if (!id) return
    if (!confirm(`Supprimer l'enregistrement barcode "${r.BARCODE||r.barcode}" ?`)) return
    try {
      await deliberaApi.deleteRecord(id)
      showToast('Supprimé ✓')
      loadRecords(); loadKpis()
    } catch (e) { showToast(e.message || 'Erreur suppression', 'error') }
  }

  const handleToggleStatus = async (r) => {
    const id = safeId(r.ID ?? r.id)
    if (!id) return
    const cur    = r.STATUT_REPRISE || r.statutReprise
    const newSt  = cur === 'RETURNED' ? 'NOT_RETURNED' : 'RETURNED'
    try {
      if (newSt === 'RETURNED') {
        setReturnRecord(await deliberaApi.getRecord(id))
        return
      }
      await deliberaApi.patchStatus(id, newSt)
      showToast(newSt === 'RETURNED' ? 'Marquée retournée ✓' : 'Marquée non retournée')
      loadRecords(); loadKpis()
      loadScanRecords()
    } catch (e) { showToast(e.message || 'Erreur', 'error') }
  }

  const handleScanDone = () => {
    setScanModal(null)
    showToast('Enregistré ✓')
    loadRecords(); loadKpis()
    loadScanRecords()
    setTimeout(() => barcodeRef.current?.focus(), 100)
  }

  const handleVerifyDone = (result) => {
    setVerifyRecord(null)
    const returned = result?.statut === 'RETURNED' || result?.statutReprise === 'RETURNED'
    showToast(returned ? 'Pièce retournée ✓' : 'Défauts restants', returned ? 'success' : 'warning')
    loadRecords(); loadKpis()
    loadScanRecords()
    setTimeout(() => barcodeRef.current?.focus(), 100)
  }

  // ── Export Excel ──────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const dp = buildDateParams()
      const data = await deliberaApi.getRecords({
        projet:    filterProjet    || undefined,
        statut:    filterStatut    || undefined,
        refDetail: filterRefDetail || undefined,
        shift:     filterShift     || undefined,
        createdBy: filterUser      || undefined,
        page: 1, limit: 10000, ...dp
      })
      const shiftLabel = { SHIFT_1: 'Matin (06h-14h)', SHIFT_2: 'Après-midi (14h-22h)', SHIFT_3: 'Nuit (22h-06h)' }
      const exportRows = (data.records||[]).map((r, i) => ({
        '#':              i + 1,
        'Date/Heure':     (r.CREATED_AT||r.createdAt||'').slice(0, 16),
        'Barcode':        r.BARCODE||r.barcode||'',
        'Code 2':         r.SCAN_CODE_2 || '',
        'Code 3':         r.SCAN_CODE_3 || '',
        'Projet':         (r.PROJET||r.projet||'').toUpperCase(),
        'Ligne':          r.LIGNE||r.ligne||'',
        'Référence':      r.REFERENCE||r.reference||'',
        'Version':        r.VERSION||r.version||'',
        'Réf. Détail':    r.REFERENCE||r.reference||'',
        'Poste':          r.POSTE_NOM||r.posteNom||'',
        'Couturière':     r.COUTURIERE_NOM||r.couturiereNom||'',
        'Checkpoint':     r.CHECKPOINT||r.checkpoint||'',
        'Codes défauts':  (r.defauts||[]).map(d => d.codeDefaut).join(', '),
        'Desc. défauts':  (r.defauts||[]).map(d => d.descDefaut||'').filter(Boolean).join(' | '),
        'Statut':         (r.STATUT_REPRISE||r.statutReprise) === 'RETURNED' ? 'Retournée' : 'Non retournée',
        'Utilisateur':    r.CREATED_BY||r.createdBy||'',
        'Matricule':      r.SCANNER_MATRICULE || r.scannerMatricule || r.MATRICULE || '',
        'Scannée par':    r.SCANNER_NOM || r.scannerNom || r.CREATED_BY || r.createdBy || '',
        'Shift':          (() => { const h = parseInt((r.CREATED_AT||'').slice(11,13)||'0'); return h>=6&&h<14?shiftLabel.SHIFT_1:h>=14&&h<22?shiftLabel.SHIFT_2:shiftLabel.SHIFT_3 })(),
      }))

      const { utils, writeFile } = await import('xlsx')
      const ws = utils.json_to_sheet(exportRows)

      // Auto-fit column widths
      const cols = Object.keys(exportRows[0] || {}).map(k => ({
        wch: Math.max(k.length, ...exportRows.map(r => String(r[k]||'').length), 8)
      }))
      ws['!cols'] = cols

      // Style header row (row 1) as bold with background — xlsx community edition only supports limited styles via !rows
      const headerRange = utils.decode_range(ws['!ref'] || 'A1')
      ws['!rows'] = [{ hpt: 20 }] // Header row height

      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, 'Délibéra')

      // Metadata sheet with active filters
      const meta = [
        ['Export Délibéra', new Date().toLocaleString('fr-FR')],
        ['Projet', filterProjet || 'Tous'],
        ['Statut', filterStatut || 'Tous'],
        ['Réf. Détail', filterRefDetail || '—'],
        ['Shift', filterShift ? shiftLabel[filterShift] : 'Tous'],
        ['Utilisateur', filterUser || 'Tous'],
        ['Période', filterDate === 'today' ? "Aujourd'hui" : filterDate === 'month' ? 'Ce mois' : filterDate === 'custom' ? `${dp.dateFrom} → ${dp.dateTo}` : 'Toutes dates'],
        ['Total lignes', exportRows.length],
      ]
      const wsMeta = utils.aoa_to_sheet(meta)
      utils.book_append_sheet(wb, wsMeta, 'Filtres actifs')

      writeFile(wb, `delibera_export_${todayStr()}.xlsx`)
      reportClientExport('delibera')
      showToast(`Export réussi — ${exportRows.length} ligne(s)`)
    } catch (e) { showToast('Erreur export : ' + e.message, 'error') }
  }

  // ── KPI card helper ───────────────────────────────────────────────────────
  const total  = Number(kpis.TOTAL ?? 0)
  const ret    = Number(kpis.RETURNED ?? 0)
  const nonRet = Number(kpis.NOT_RETURNED ?? 0)
  const pctRet = total > 0 ? Math.round(ret  / total * 100) : 0
  const pctNon = total > 0 ? Math.round(nonRet / total * 100) : 0

  const analytics = useMemo(() => {
    const countBy = (keyFn) => {
      const c = {}
      rows.forEach(r => {
        const k = keyFn(r)
        if (!k || k === 'null' || k === 'undefined') return
        c[k] = (c[k] || 0) + ((r.defauts || []).length || 1)
      })
      return Object.entries(c).sort((a, b) => b[1] - a[1])
    }
    const topCodes = () => {
      const c = {}
      rows.forEach(r => (r.defauts || []).forEach(d => { c[d.codeDefaut] = (c[d.codeDefaut] || 0) + 1 }))
      return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3)
    }
    return {
      byRef:          countBy(r => r.REFERENCE      || r.reference).slice(0, 5),
      byVersion:      countBy(r => r.VERSION        || r.version).slice(0, 5),
      topPostes:      countBy(r => r.POSTE_NOM      || r.posteNom).slice(0, 3),
      topCouturieres: countBy(r => r.COUTURIERE_NOM || r.couturiereNom).slice(0, 3),
      topDefauts:     topCodes(),
    }
  }, [rows])

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar" style={{ background: C }}></div>
          <div className="header-title-group">
            <h2 style={{ color: C }}>{t('delibera')}</h2>
            <span className="header-subtitle">{t('delibera_page_subtitle')}</span>
          </div>
        </div>
        <div className="header-right">
          <div className="hbadge hbadge-clock">
            <span className="hbadge-clock-dot"></span>
            <span>{new Date().toLocaleTimeString('fr-FR')}</span>
          </div>
        </div>
      </div>

      <nav className="delibera-scan-tabs" aria-label="Pages Délibéra">
        {[
          { key: 'coiffe-ok', label: 'Coiffe OK', symbol: '✓' },
          { key: 'nok', label: 'Add NOK', symbol: '+' },
          { key: 'history', label: 'Historique', symbol: '≡' },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            className={`delibera-scan-tab delibera-scan-tab--${tab.key}${scanPage === tab.key ? ' active' : ''}`}
            aria-pressed={scanPage === tab.key}
            disabled={scanning || okScanning || Boolean(returnRecord) || Boolean(verifyRecord)}
            onClick={() => selectScanPage(tab.key)}
          >
            <span aria-hidden="true">{tab.symbol}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {canWrite && scanPage !== 'history' && (
        <div className="delibera-scan-type">
          <div>
            <strong>{scanType ? 'Type de pièce validé' : 'Avant de scanner'}</strong>
            <p>{scanType
              ? `${scanType.projet} / ${scanType.ligne || 'Sans ligne'} / ${scanType.version || 'Sans version'}`
              : 'Choisissez et validez le projet, la ligne et la version.'}</p>
          </div>
          <button type="button" disabled={scanning || okScanning || Boolean(pendingNokPiece) || Boolean(verifyRecord) || Boolean(returnRecord)}
            onClick={() => { setBarcode(''); setOkBarcode(''); setShowScanSetup(true) }}>
            {scanType ? 'Changer le type' : 'Préparer le scan'}
          </button>
        </div>
      )}
      {canWrite && showScanSetup && scanPage !== 'history' && (
        <DeliberaScanSetup current={scanType} onClose={() => setShowScanSetup(false)}
          onConfirm={type => { setScanType(type); setShowScanSetup(false); setBarcode(''); setOkBarcode('') }} />
      )}

      {scanPage === 'coiffe-ok' && (
        <>
          <section className={`delibera-fast-scan delibera-fast-scan--ok${scanType ? ' delibera-fast-scan--with-photo' : ''}`} aria-label="Scan Coiffe OK">
            <div className="delibera-fast-scan__heading">
              <span className="delibera-fast-scan__icon" aria-hidden="true">✓</span>
              <div>
                <h3>Coiffe OK</h3>
                <p>Scannez une pièce conforme. Elle est enregistrée automatiquement, sans clic.</p>
              </div>
            </div>
            {canWrite ? (
              <DeliberaMultiScanner key={JSON.stringify(scanType)} project={scanType?.projet} version={scanType?.version} mode="ok"
                firstInputRef={okBarcodeRef} onComplete={triggerOkScan}
                disabled={okScanning || !scanType || showScanSetup || Boolean(returnRecord) || Boolean(verifyRecord) || Boolean(checkpointReview)} />
            ) : (
              <p className="delibera-fast-scan__readonly">Votre profil ne permet pas d’enregistrer des scans.</p>
            )}
            {scanType && <aside className="delibera-fast-scan__photo" aria-label="Modèle de la pièce à contrôler">
              <VersionPhoto project={scanType.projet} line={scanType.ligne} version={scanType.version} />
            </aside>}
          </section>
          <ScanRecordsTable
            title="Dernières coiffes OK"
            records={scanRecords.ok}
            total={scanRecordsTotal.ok}
            loading={scanRecordsLoading}
            error={scanRecordsError}
            status="RETURNED"
          />
        </>
      )}

      {scanPage === 'nok' && (
        <>
          <section className={`delibera-fast-scan delibera-fast-scan--nok${scanType ? ' delibera-fast-scan--with-photo' : ''}`} aria-label="Scan pièce NOK">
            <div className="delibera-fast-scan__heading">
              <span className="delibera-fast-scan__icon" aria-hidden="true">!</span>
              <div>
                <h3>Add NOK</h3>
                <p>
                  {pendingNokPiece
                    ? `Pièce ${pendingNokPiece.barcodeRaw} reconnue. Complétez la fenêtre NOK, puis cliquez sur Enregistrer.`
                    : 'Scannez la pièce non conforme, sélectionnez les postes, la couturière et les défauts, puis cliquez sur Enregistrer.'}
                </p>
              </div>
            </div>
            {canWrite ? (
              <DeliberaMultiScanner key={JSON.stringify(scanType)} project={scanType?.projet} version={scanType?.version} mode="nok"
                firstInputRef={barcodeRef} onComplete={triggerScan}
                disabled={scanning || Boolean(pendingNokPiece) || !scanType || showScanSetup || Boolean(returnRecord) || Boolean(verifyRecord) || Boolean(checkpointReview)} />
            ) : (
              <p className="delibera-fast-scan__readonly">Votre profil ne permet pas d’enregistrer des scans.</p>
            )}
            {scanType && <aside className="delibera-fast-scan__photo" aria-label="Modèle de la pièce à contrôler">
              <VersionPhoto project={scanType.projet} line={scanType.ligne} version={scanType.version} />
            </aside>}
          </section>
          <ScanRecordsTable
            title="Dernières coiffes NOK"
            records={scanRecords.nok}
            total={scanRecordsTotal.nok}
            loading={scanRecordsLoading}
            error={scanRecordsError}
            status="NOT_RETURNED"
          />
        </>
      )}

      {scanPage === 'history' && <>
      {/* ══ FILTRES ══════════════════════════════════════════════════════════ */}
      <div style={{ padding:'14px 24px', display:'flex', gap:10, alignItems:'center',
        flexWrap:'wrap', borderBottom:'1.5px solid #e2e8f0', background:'#fafbfc' }}>

        <select value={filterProjet} onChange={e => { setFilterProjet(e.target.value); setPage(1) }}
          style={{ border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 12px', fontSize:12, color:'#334155', background:'#fff', outline:'none', fontWeight:600 }}>
          <option value="">{t('delibera_all_projects')}</option>
          {projects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>

        <select value={filterStatut} onChange={e => { setFilterStatut(e.target.value); setPage(1) }}
          style={{ border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 12px', fontSize:12, color:'#334155', background:'#fff', outline:'none' }}>
          <option value="">{t('delibera_all_statuts')}</option>
          <option value="NOT_RETURNED">{t('delibera_filter_nonret')}</option>
          <option value="RETURNED">{t('delibera_filter_ret')}</option>
        </select>

        <select value={filterDate} onChange={e => { setFilterDate(e.target.value); setPage(1) }}
          style={{ border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 12px', fontSize:12, color:'#334155', background:'#fff', outline:'none' }}>
          <option value="today">{t('delibera_filter_today')}</option>
          <option value="month">{t('delibera_filter_month')}</option>
          <option value="">{t('delibera_filter_all')}</option>
          <option value="custom">{t('delibera_filter_custom')}</option>
        </select>

        {filterDate === 'custom' && <>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            style={{ border:'1.5px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:12, outline:'none', background:'#fff' }} />
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
            style={{ border:'1.5px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:12, outline:'none', background:'#fff' }} />
        </>}

        <input
          type="text"
          placeholder="Réf. Détail"
          value={filterRefDetail}
          onChange={e => { setFilterRefDetail(e.target.value); setPage(1) }}
          style={{ border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 12px', fontSize:12, color:'#334155', background:'#fff', outline:'none', minWidth:130 }}
        />

        {/* Filtre Shift */}
        <select value={filterShift} onChange={e => { setFilterShift(e.target.value); setPage(1) }}
          style={{ border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 12px', fontSize:12, color:'#334155', background:'#fff', outline:'none' }}>
          <option value="">Tous les shifts</option>
          <option value="SHIFT_1">Matin (06h–14h)</option>
          <option value="SHIFT_2">Après-midi (14h–22h)</option>
          <option value="SHIFT_3">Nuit (22h–06h)</option>
        </select>

        {/* Filtre Utilisateur */}
        {userList.length > 0 ? (
          <select value={filterUser} onChange={e => { setFilterUser(e.target.value); setPage(1) }}
            style={{ border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 12px', fontSize:12, color:'#334155', background:'#fff', outline:'none', maxWidth:200 }}>
            <option value="">Tous les utilisateurs</option>
            {userList.map(u => {
              const mat  = u.MATRICULE || u.matricule || String(u)
              const name = u.FULLNAME  || u.FULL_NAME || u.fullName || ''
              return <option key={mat} value={mat}>[{mat}] — {name}</option>
            })}
          </select>
        ) : (
          <input type="text" placeholder="Utilisateur" value={filterUser}
            onChange={e => { setFilterUser(e.target.value); setPage(1) }}
            style={{ border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 12px', fontSize:12, color:'#334155', background:'#fff', outline:'none', minWidth:120 }} />
        )}

        {(filterProjet || filterStatut || filterDate !== 'today' || filterRefDetail || filterShift || filterUser) && (
          <button onClick={() => { setFilterProjet(''); setFilterStatut(''); setFilterDate('today'); setFilterRefDetail(''); setFilterShift(''); setFilterUser(''); setPage(1) }}
            style={{ border:'1.5px solid #e2e8f0', borderRadius:8, padding:'6px 12px', fontSize:12, color:'#64748b', background:'#fff', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:12, height:12 }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            {t('delibera_reset_filter')}
          </button>
        )}

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          {canWrite && (
            <>
              <input ref={importFileRef} type="file" accept=".xls,.xlsx,.csv" style={{ display:'none' }} onChange={handleImportFile} />
              <button onClick={() => { setImportMessage(''); setShowImportModal(true) }} disabled={importing}
                style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 13px',
                  background:importing ? '#94a3b8' : '#475569', border:'1.5px solid transparent', borderRadius:8,
                  fontSize:12, fontWeight:700, color:'#fff', cursor:importing ? 'wait' : 'pointer' }}>
                {importing ? 'Importation…' : 'Import'}
              </button>
            </>
          )}
          <button onClick={handleExport}
            style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 16px',
              background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:12, fontWeight:600, color:'#334155', cursor:'pointer' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:13, height:13 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {t('delibera_export_excel')}
          </button>
        </div>
      </div>

      {/* ══ CARTES KPI ══════════════════════════════════════════════════════ */}
      <div style={{ padding:'16px 24px', background:'#fafaff', borderBottom:`2px solid ${C}18` }}>

        {/* Row 1 — 5 analytical cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5, minmax(0, 1fr))', gap:12, marginBottom:12 }}>
          {[
            { key:'ref',        title: t('delibera_kpi_by_ref'),        icon:'📋', data: analytics.byRef,          accent:'#7c3aed' },
            { key:'version',    title: t('delibera_kpi_by_version'),    icon:'🏷️', data: analytics.byVersion,      accent:'#166534' },
            { key:'poste',      title: t('delibera_kpi_by_poste'),      icon:'🔧', data: analytics.topPostes,      accent:'#0891b2' },
            { key:'couturiere', title: t('delibera_kpi_by_couturiere'), icon:'🧵', data: analytics.topCouturieres, accent:'#6d28d9' },
            { key:'defaut',     title: t('delibera_kpi_by_defaut'),     icon:'⚡', data: analytics.topDefauts,     accent:'#b91c1c' },
          ].map(({ key, title, icon, data, accent }) => (
            <div key={key} style={{
              background:'#fff', borderRadius:12, padding:'12px 14px', minHeight:120,
              borderTop:'1.5px solid #e2e8f0', borderRight:'1.5px solid #e2e8f0',
              borderBottom:'1.5px solid #e2e8f0', borderLeft:`4px solid ${accent}`,
              boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:9 }}>
                <span style={{ fontSize:16 }}>{icon}</span>
                <span style={{ fontSize:10, fontWeight:800, color: accent, textTransform:'uppercase', letterSpacing:'.5px', lineHeight:1.3 }}>{title}</span>
              </div>
              {data.length === 0 ? (
                <div style={{ fontSize:11, color:'#cbd5e1', textAlign:'center', paddingTop:10 }}>—</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {data.map(([label, count], i) => (
                    <div key={label} style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ fontSize:9, fontWeight:800, color:'#fff', background: accent,
                        borderRadius:99, minWidth:15, height:15, display:'inline-flex',
                        alignItems:'center', justifyContent:'center', flexShrink:0 }}>{i + 1}</span>
                      <span style={{ fontSize:11, fontWeight:600, color:'#334155', flex:1,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</span>
                      <span style={{ fontSize:11, fontWeight:800, color: accent,
                        background:`${accent}14`, padding:'1px 6px', borderRadius:99, flexShrink:0 }}>{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Row 2 — Synthèse (3 sub-cards) */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, paddingBottom:4 }}>
          {[
            { key:'total',  label: t('delibera_kpi_total'),  value: total,  pct: null,   bg:'#f3f0ff', color: C,   border:`${C}44`,  icon:'📦' },
            { key:'ret',    label: t('delibera_kpi_ret'),    value: ret,    pct: pctRet, bg:'#f0fdf4', color: RET, border:'#86efac', icon:'✅' },
            { key:'nonret', label: t('delibera_kpi_nonret'), value: nonRet, pct: pctNon, bg:'#fff1f2', color: NON, border:'#fca5a5', icon:'⚠️' },
          ].map(({ key, label, value, pct, bg, color, border, icon }) => (
            <div key={key} style={{ background: bg, border:`1.5px solid ${border}`, borderRadius:12,
              padding:'14px 18px', display:'flex', alignItems:'center', gap:14 }}>
              <span style={{ fontSize:26 }}>{icon}</span>
              <div>
                <div style={{ fontSize:30, fontWeight:900, color, lineHeight:1 }}>{value}</div>
                {pct !== null && <div style={{ fontSize:12, fontWeight:700, color, opacity:.75 }}>{pct}%</div>}
              </div>
              <div style={{ marginLeft:'auto', fontSize:11, fontWeight:700, color, opacity:.7,
                textTransform:'uppercase', letterSpacing:'.5px', textAlign:'right', lineHeight:1.4, maxWidth:100 }}>{label}</div>
            </div>
          ))}
        </div>

      </div>

      {/* ══ TABLEAU ══════════════════════════════════════════════════════════ */}
      <div style={{ padding:'16px 24px' }}>
        {loading ? (
          <div className="loading"><div className="spinner"/></div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 0', color:'#94a3b8' }}>
            <svg viewBox="0 0 24 24" style={{ width:44, height:44, stroke:'#cbd5e1', fill:'none', display:'block', margin:'0 auto 14px' }}>
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <p style={{ fontSize:14, fontWeight:600 }}>Aucun enregistrement trouvé</p>
            <p style={{ fontSize:12, color:'#cbd5e1', marginTop:4 }}>Scannez une pièce pour commencer</p>
          </div>
        ) : (
          <>
            <div className="table-wrapper" style={{ overflowX:'auto' }}>
              <table className="data-table" style={{ minWidth:1280 }}>
                <thead>
                  <tr>
                    <th style={{ width:44 }}>#</th>
                    <th style={{ width:140 }}>{t('delibera_col_dt')}</th>
                    <th>{t('delibera_col_barcode')}</th>
                    <th style={{ width:90 }}>{t('delibera_col_version')}</th>
                    <th style={{ width:110 }}>{t('delibera_col_ref')}</th>
                    <th style={{ width:90 }}>{t('delibera_col_projet')}</th>
                    <th style={{ width:90 }}>{t('delibera_col_ligne')}</th>
                    <th>{t('delibera_col_poste')}</th>
                    <th>{t('delibera_col_couturiere')}</th>
                    <th style={{ width:90 }}>Matricule</th>
                    <th style={{ width:130 }}>Scannée par</th>
                    <th style={{ width:120 }}>{t('delibera_col_checkpoint')}</th>
                    <th>{t('delibera_col_defauts')}</th>
                    <th style={{ textAlign:'center', width:130 }}>{t('delibera_col_statut')}</th>
                    <th style={{ textAlign:'right', width:180 }}>{t('delibera_col_actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const statut   = r.STATUT_REPRISE || r.statutReprise
                    const isNotRet = statut === 'NOT_RETURNED'
                    return (
                      <tr key={r.ID ?? r.id ?? idx}
                        style={{ opacity: statut === 'RETURNED' ? 0.8 : 1 }}>
                        <td style={{ color:'#64748b', fontWeight:600, fontSize:12 }}>
                          {(pagination.currentPage - 1) * pagination.recordsPerPage + idx + 1}
                        </td>
                        <td style={{ fontSize:11, color:'#475569', fontFamily:'monospace', whiteSpace:'nowrap' }}>
                          {(r.CREATED_AT||r.createdAt||'').replace('T',' ').slice(0,16)}
                        </td>
                        <td>
                          <code style={{ fontSize:12, background:'#f8fafc', padding:'2px 8px', borderRadius:5, color:'#334155', fontWeight:700 }}>
                            {r.BARCODE||r.barcode}
                          </code>
                          {r.RETURNED_AT && <details style={{ marginTop: 6, fontSize: 12 }}>
                            <summary>Retour NOK → OK</summary>
                            <p>{r.RETURNED_BY} — {r.RETURNED_AT}</p>
                            <p>{r.RETURN_JUSTIFICATION || 'Tous les codes défauts ont été confirmés résolus.'}</p>
                          </details>}
                        </td>
                        <td style={{ fontSize:11, color:'#475569' }}>
                          {r.VERSION||r.version
                            ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99, background:'#f0fdf4', color:'#166534', border:'1px solid #bbf7d0' }}>{r.VERSION||r.version}</span>
                            : <span style={{ color:'#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ fontSize:11, color:'#475569', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {r.REFERENCE||r.reference||<span style={{ color:'#cbd5e1' }}>—</span>}
                        </td>
                        <td>
                          {(r.PROJET||r.projet) ? (
                            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99,
                              background:`${C}15`, color:C, border:`1px solid ${C}33`, whiteSpace:'nowrap' }}>
                              {(r.PROJET||r.projet||'').toUpperCase()}
                            </span>
                          ) : <span style={{ color:'#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ fontSize:11, color:'#475569' }}>
                          {r.LIGNE||r.ligne||<span style={{ color:'#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ fontSize:12 }}>{r.POSTE_NOM||r.posteNom||<span style={{ color:'#cbd5e1' }}>—</span>}</td>
                        <td style={{ fontSize:12 }}>{r.COUTURIERE_NOM||r.couturiereNom||<span style={{ color:'#cbd5e1' }}>—</span>}</td>
                        <td style={{ fontSize:11, color:'#475569', fontFamily:'monospace' }}>
                          {r.SCANNER_MATRICULE || r.scannerMatricule || r.MATRICULE || '—'}
                        </td>
                        <td style={{ fontSize:12 }}>
                          {r.SCANNER_NOM || r.scannerNom || r.CREATED_BY || r.createdBy || '—'}
                        </td>
                        <td style={{ fontSize:11, color:'#475569', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {r.CHECKPOINT||r.checkpoint||<span style={{ color:'#cbd5e1' }}>—</span>}
                        </td>
                        <td>
                          <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                            {(r.defauts||[]).map(d => (
                              <span key={d.id||d.codeDefaut}
                                style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99,
                                  background: d.verifie ? '#dcfce7' : '#f3f0ff',
                                  color: d.verifie ? RET : C,
                                  border:`1px solid ${d.verifie ? '#86efac' : C+'44'}` }}>
                                {d.codeDefaut}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ textAlign:'center' }}>
                          <button
                            title={isNotRet ? 'Cliquer pour marquer retournée' : 'Cliquer pour marquer non retournée'}
                            onClick={() => handleToggleStatus(r)}
                            style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
                            <StatusBadge statut={statut} />
                          </button>
                        </td>
                        <td>
                          <div style={{ display:'flex', gap:5, justifyContent:'flex-end' }}>
                            {/* Vérifier — seulement si non retourné */}
                            {canWrite && isNotRet && (
                              <button onClick={() => openVerify(r)} title="Vérifier les défauts"
                                style={{ padding:'5px 10px', background:`${C}15`, color:C,
                                  border:`1px solid ${C}44`, borderRadius:7,
                                  cursor:'pointer', fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>
                                ✓ Vérifier
                              </button>
                            )}
                            {/* Modifier */}
                            {canWrite && (
                              <button onClick={() => openEdit(r)} title="Modifier"
                                style={{ padding:'5px 8px', background:'#f0fdf4', color:'#166534',
                                  border:'1px solid #bbf7d0', borderRadius:7, cursor:'pointer', fontSize:13 }}>
                                ✏️
                              </button>
                            )}
                            {/* Supprimer */}
                            {canWrite && (
                              <button onClick={() => handleDelete(r)} title="Supprimer"
                                style={{ padding:'5px 8px', background:'#fff1f2', color:NON,
                                  border:'1px solid #fca5a5', borderRadius:7, cursor:'pointer', fontSize:13 }}>
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pagination.currentPage} totalPages={pagination.totalPages}
              total={pagination.totalRecords} limit={pagination.recordsPerPage}
              onPage={p => setPage(p)}
            />
          </>
        )}
      </div>
      </>}

      {/* ══ MODALES ═══════════════════════════════════════════════════════════ */}
      {scanModal && (
        <ScanModal
          mode={scanModal.mode}
          barcodeInfo={scanModal.barcodeInfo}
          record={scanModal.record}
          defCodes={defCodes}
          onClose={() => { setScanModal(null); setTimeout(() => barcodeRef.current?.focus(), 100) }}
          onDone={handleScanDone}
          showToast={showToast}
        />
      )}

      {checkpointReview && (
        <CheckpointReviewModal
          review={checkpointReview}
          saving={checkpointReviewSaving}
          onCancel={() => {
            setCheckpointReview(null)
            setTimeout(() => (scanPage === 'coiffe-ok' ? okBarcodeRef : barcodeRef).current?.focus(), 100)
          }}
          onConfirm={submitCheckpointReview}
        />
      )}

      {pendingNokPiece && (
        <ScanModal
          mode="new"
          barcodeInfo={pendingNokPiece}
          defCodes={defCodes}
          defectsLoading={defCodesLoading}
          checkpointResults={pendingNokCheckpointResults}
          showToast={showToast}
          onDone={() => {
            pendingNokPieceRef.current = null
            setPendingNokPiece(null)
            setPendingNokCheckpointResults([])
            showToast('Pièce NOK enregistrée ✓')
            loadRecords(); loadKpis(); loadScanRecords()
            setTimeout(() => barcodeRef.current?.focus(), 100)
          }}
          onClose={() => {
            pendingNokPieceRef.current = null
            setPendingNokPiece(null)
            setPendingNokCheckpointResults([])
            setBarcode('')
            setTimeout(() => barcodeRef.current?.focus(), 100)
          }}
        />
      )}

      {verifyRecord && (
        <VerifyModal
          record={verifyRecord}
          defCodes={defCodes}
          onClose={() => { setVerifyRecord(null); setTimeout(() => barcodeRef.current?.focus(), 100) }}
          onDone={handleVerifyDone}
        />
      )}

      {returnRecord && (
        <DeliberaReturnModal record={returnRecord}
          onClose={() => {
            setReturnRecord(null)
            setTimeout(() => (scanPage === 'coiffe-ok' ? okBarcodeRef : barcodeRef).current?.focus(), 100)
          }}
          onDone={() => {
            setReturnRecord(null)
            showToast('Coiffe passée de NOK à OK ✓')
            loadRecords(); loadKpis(); loadScanRecords()
            setTimeout(() => (scanPage === 'coiffe-ok' ? okBarcodeRef : barcodeRef).current?.focus(), 100)
          }} />
      )}

      {showImportModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1200, background:'rgba(15,23,42,.65)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          >
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:500, padding:24,
            boxShadow:'0 12px 40px rgba(0,0,0,.22)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:'#334155' }}>Importer des enregistrements Délibéra</div>
                <div style={{ fontSize:12, color:'#64748b', marginTop:3 }}>Fichier Excel/CSV, y compris l'export Délibéra.</div>
              </div>
              <button onClick={() => setShowImportModal(false)} disabled={importing}
                style={{ background:'#f1f5f9', border:0, borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:18 }}>×</button>
            </div>
            <label style={{ display:'flex', flexDirection:'column', gap:6, fontSize:12, color:'#475569', fontWeight:700 }}>
              Période à importer
              <select value={importFilter.type} disabled={importing}
                onChange={e => setImportFilter(f => ({ ...f, type:e.target.value }))}
                style={{ padding:10, border:'1px solid #cbd5e1', borderRadius:8, background:'#fff' }}>
                <option value="ALL">Toutes les dates</option>
                <option value="TODAY">Aujourd'hui</option>
                <option value="THIS_WEEK">Cette semaine</option>
                <option value="THIS_MONTH">Ce mois</option>
                <option value="CUSTOM">Personnalisée</option>
              </select>
            </label>
            {importFilter.type === 'CUSTOM' && (
              <div style={{ display:'flex', gap:8, marginTop:10 }}>
                <input type="date" value={importFilter.dateFrom} disabled={importing}
                  onChange={e => setImportFilter(f => ({ ...f, dateFrom:e.target.value }))}
                  style={{ flex:1, padding:9, border:'1px solid #cbd5e1', borderRadius:8 }} />
                <input type="date" value={importFilter.dateTo} disabled={importing}
                  onChange={e => setImportFilter(f => ({ ...f, dateTo:e.target.value }))}
                  style={{ flex:1, padding:9, border:'1px solid #cbd5e1', borderRadius:8 }} />
              </div>
            )}
            <div style={{ marginTop:12, padding:10, borderRadius:8, background:'#f8fafc', color:'#64748b', fontSize:11 }}>
              Les barcodes déjà enregistrés sont ignorés. Les codes défauts sont importés avec leur description.
            </div>
            {importMessage && <div style={{ marginTop:12, padding:10, borderRadius:8, background:importMessage.startsWith('Erreur') ? '#fef2f2' : '#f0fdf4',
              color:importMessage.startsWith('Erreur') ? '#b91c1c' : '#14532d', fontSize:12, whiteSpace:'pre-line' }}>{importMessage}</div>}
            <button onClick={() => importFileRef.current?.click()} disabled={importing}
              style={{ width:'100%', marginTop:16, padding:12, border:0, borderRadius:9, background:importing ? '#94a3b8' : '#475569',
                color:'#fff', fontWeight:800, cursor:importing ? 'wait' : 'pointer' }}>
              {importing ? 'Importation en cours…' : 'Choisir un fichier Excel ou CSV'}
            </button>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </>
  )
}