import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cslApi } from '../api/csl.api.js'
import { lookupApi } from '../api/lookup.api.js'
import { projectsApi } from '../api/projects.api.js'
import { postesApi } from '../api/postes.api.js'
import { echeancesApi } from '../api/echeances.api.js'
import { productionApi } from '../api/production.api.js'
import { Link } from 'react-router-dom'
import Pagination from '../components/Pagination.jsx'
import BulkActionBar from '../components/BulkActionBar.jsx'
import QualityCoiffeScanner from '../components/QualityCoiffeScanner.jsx'
import { useBulkSelection } from '../hooks/useBulkSelection.js'
import { exportToExcel, parseExcelFile, debounce } from '../utils/helpers.js'
import { useAuth } from '../contexts/AuthContext.jsx'

// ── Constrained tampon autocomplete ──────────────────────────────────────────
function TamponAutocomplete({ value, onChange, tamponCodes, placeholder }) {
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState('')
  const [inputVal, setInputVal] = React.useState(value)
  const [activeIdx, setActiveIdx] = React.useState(-1)
  const wrapRef = React.useRef()

  React.useEffect(() => { setInputVal(value) }, [value])

  const suggestions = tamponCodes.filter(t =>
    inputVal && t.toLowerCase().includes(inputVal.toLowerCase())
  )

  const commit = (val) => {
    if (!val) { setError(''); onChange(''); setOpen(false); return }
    if (tamponCodes.length > 0 && !tamponCodes.includes(val)) {
      setError('Veuillez sélectionner un tampon valide de la liste')
      setInputVal(''); onChange(''); setOpen(false)
    } else {
      setError(''); onChange(val); setOpen(false)
    }
  }

  const handleBlur = (e) => {
    if (wrapRef.current && wrapRef.current.contains(e.relatedTarget)) return
    commit(inputVal)
  }

  const handleKey = (e) => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (activeIdx >= 0) { commit(suggestions[activeIdx]); setInputVal(suggestions[activeIdx]) } }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        className="form-input"
        placeholder={placeholder}
        value={inputVal}
        autoComplete="off"
        style={error ? { borderColor: '#e53e3e' } : {}}
        onChange={e => { setInputVal(e.target.value); setOpen(true); setActiveIdx(-1); setError('') }}
        onFocus={() => { if (inputVal) setOpen(true) }}
        onBlur={handleBlur}
        onKeyDown={handleKey}
      />
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.1)', marginTop: 2, maxHeight: 200, overflowY: 'auto' }}>
          {suggestions.map((t, i) => (
            <div key={t}
              onMouseDown={e => { e.preventDefault(); commit(t); setInputVal(t) }}
              style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, fontFamily: 'monospace', fontWeight: 600, background: i === activeIdx ? '#f0fdf4' : 'transparent', color: '#1e293b' }}>
              {t}
            </div>
          ))}
        </div>
      )}
      {error && <div style={{ color: '#e53e3e', fontSize: 11, marginTop: 2 }}>{error}</div>}
    </div>
  )
}

// ── Constrained select (dropdown from list only) ─────────────────────────────
function ConstrainedSelect({ value, onChange, options, placeholder, id, required }) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState(value || '')
  const [activeIdx, setActiveIdx] = React.useState(-1)
  const [error, setError] = React.useState('')
  const wrapRef = React.useRef()

  React.useEffect(() => { setQuery(value || '') }, [value])

  const filtered = options.filter(o => !query || o.toLowerCase().includes(query.toLowerCase()))

  const commit = (val) => {
    if (!val) { setError(''); onChange(''); setOpen(false); setQuery(''); return }
    if (options.length > 0 && !options.includes(val)) {
      setError('Veuillez sélectionner une valeur valide de la liste')
      setQuery(''); onChange(''); setOpen(false)
    } else {
      setError(''); onChange(val); setQuery(val); setOpen(false)
    }
  }

  const handleBlur = (e) => {
    if (wrapRef.current && wrapRef.current.contains(e.relatedTarget)) return
    commit(query)
  }

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (activeIdx >= 0 && filtered[activeIdx]) { commit(filtered[activeIdx]) } }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        id={id}
        type="text"
        className="form-input"
        placeholder={placeholder}
        value={query}
        autoComplete="off"
        style={error ? { borderColor: '#e53e3e' } : (required && !value ? { borderColor: '#f59e0b' } : {})}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIdx(-1); setError('') }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKey}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.1)', marginTop: 2, maxHeight: 200, overflowY: 'auto' }}>
          {filtered.length > 0 ? filtered.map((o, i) => (
            <div key={o}
              onMouseDown={e => { e.preventDefault(); commit(o) }}
              style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, background: i === activeIdx ? '#f0fdf4' : 'transparent', color: '#1e293b' }}>
              {o}
            </div>
          )) : (
            <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>Aucun résultat</div>
          )}
        </div>
      )}
      {error && <div style={{ color: '#e53e3e', fontSize: 11, marginTop: 2 }}>{error}</div>}
    </div>
  )
}

const EMPTY_DEFECT = { codeDef: '', checkpoint: '', descDef: '', qty: 1, demirite: 0 }
const EMPTY_FORM   = {
  barCode: '', dateFw: '', cqCsl: '', cqDelibera: '', ref: '', version: '',
  poste: '', remarque: '', reprise: 'Not Returned', ref2: '', ref3: '',
  tampon: '', project: '', equipe: '', equipe2: '', superviseur: '',
  defects: [{ ...EMPTY_DEFECT }],
}

const createEmptyRecord = () => ({
  id: Math.random(), barCode: '', cqCsl: '', cqDelibera: '',
  ref: '', version: '', superviseur: '', equipe2: '', poste: '',
  remarque: '', reprise: 'Not Returned', ref2: '', ref3: '',
  tampon: '', project: '', isOpen: true,
  defects: [{ codeDef: '', checkpoint: '', descDef: '', qty: 1, demirite: 0 }],
})

export default function Csl() {
  const { canWrite, canDelete, isReadOnly, user } = useAuth()
  const [sources, setSources]   = useState([])
  const [source, setSource]     = useState('')
  const [records, setRecords]   = useState([])
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, totalRecords: 0, recordsPerPage: 50 })
  const [stats, setStats]       = useState({})
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [page, setPage]         = useState(1)
  const [filters, setFilters]   = useState({ search: '', dateFilter: 'today', refFilter: '', versionFilter: '', repriseFilter: '' })
  const [versions, setVersions] = useState([])
  const [showHidden, setShowHidden] = useState(false)
  const [barcodeSearch, setBarcodeSearch] = useState('')
  const [repriseRecord, setRepriseRecord] = useState(null)
  const [report, setReport]     = useState({ partCount: 0 })
  const [reportFilters, setReportFilters] = useState({ supervisor: '', ref: '', startDate: '', endDate: '' })
  const [showReportModal, setShowReportModal] = useState(false)
  const [modal, setModal]       = useState(null)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [editingRecord, setEditingRecord] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [formError, setFormError] = useState('')
  const [tampons, setTampons]   = useState([])
  const [defCodes, setDefCodes] = useState([])
  const [postes, setPostes]     = useState([])
  const [supervisors, setSupervisors] = useState([])
  const [multiRecords, setMultiRecords] = useState([])
  const [checkpointOptions, setCheckpointOptions] = useState({}) // recordIdx -> string[]
  const [editCheckpointOptions, setEditCheckpointOptions] = useState([])
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFilter, setImportFilter] = useState({ type: 'ALL', dateFrom: '', dateTo: '' })
  const [barcodeStep, setBarcodeStep] = useState('barcode')
  const [pendingBarcode, setPendingBarcode] = useState('')
  // ── Stats period filter ──
  const [statsPeriod, setStatsPeriod] = useState('today')
  // ── Échéances banner ──
  const [echeanceSummary, setEcheanceSummary] = useState(null)
  // ── Production QTE ──
  const [prodQte, setProdQte]         = useState('')
  const [prodSaving, setProdSaving]   = useState(false)
  const [prodAnalyse, setProdAnalyse] = useState(null)
  const [prodQteId, setProdQteId]     = useState(null)
  const [statsDateFrom, setStatsDateFrom] = useState('')
  const [statsDateTo, setStatsDateTo] = useState('')
  const fileRef = useRef()
  const barcodeInputRef = useRef()

  // ── Bulk reprise selection ──────────────────────────────────────────────────
  const { selected: selectedBarcodes, isSelected: isBarcodeSelected, toggle: toggleBarcode,
          toggleAll: toggleAllBarcodes, clear: clearSelection,
          allSelected, someSelected } = useBulkSelection(records, r => r.barCode)
  const [bulkRepriseVal, setBulkRepriseVal] = useState('Returned')
  const [bulkApplying, setBulkApplying]     = useState(false)
  const [toast, setToast]                   = useState('')

  const handleBulkReprise = async () => {
    if (selectedBarcodes.size === 0) return
    setBulkApplying(true)
    try {
      await cslApi.bulkReprise(source, [...selectedBarcodes], bulkRepriseVal)
      setToast(`✓ ${selectedBarcodes.size} enregistrement(s) mis à jour`)
      clearSelection()
      loadData()
      setTimeout(() => setToast(''), 3000)
    } catch (e) {
      setToast('✗ Erreur: ' + e.message)
      setTimeout(() => setToast(''), 5000)
    } finally {
      setBulkApplying(false)
    }
  }

  useEffect(() => {
    cslApi.getSources()
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.sources || [])
        setSources(list)
        if (list.length > 0) setSource(list[0])
      })
      .catch(() => { setSources(['CSL_P6']); setSource('CSL_P6') })
  }, [])

  useEffect(() => {
    lookupApi.tampons().then(d => setTampons(Array.isArray(d) ? d : (d?.tampons || []))).catch(() => {})
    lookupApi.defCodes().then(d => setDefCodes(Array.isArray(d) ? d : (d?.codes || []))).catch(() => {})
    postesApi.getAll().then(d => setPostes((Array.isArray(d) ? d : []).map(p => p.NOM || p.nom || ''))).catch(() => {})
    lookupApi.supervisors().then(d => setSupervisors(Array.isArray(d) ? d : (d?.supervisors || []))).catch(() => {})
  }, [])

  const loadData = useCallback(() => {
    if (!source) { setLoading(false); return }
    setLoading(true); setError('')
    Promise.all([
      cslApi.getAll({ source, page, limit: 50, ...filters }),
      cslApi.getStats(source, statsPeriod, statsDateFrom, statsDateTo),
    ]).then(([data, st]) => {
      setRecords(data.records || [])
      setPagination(data.pagination || {})
      setStats(st || {})
      const vSet = new Set((data.records || []).map(r => r.version).filter(Boolean))
      setVersions([...vSet])
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [source, page, filters, statsPeriod, statsDateFrom, statsDateTo])

  const loadReport = useCallback(() => {
    if (!source) return
    cslApi.getReport(source, reportFilters).then(r => setReport(r || { partCount: 0 })).catch(() => {})
  }, [source, reportFilters])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { loadReport() }, [loadReport])
  useEffect(() => { const id = setInterval(loadData, 30000); return () => clearInterval(id) }, [loadData])

  // ── Charger le résumé échéances pour ce projet ──
  useEffect(() => {
    if (!source) return
    const proj = source.replace(/^CSL_/i, '')
    const fetch = () => echeancesApi.getProject(proj).then(d => setEcheanceSummary(d)).catch(() => {})
    fetch()
    const id = setInterval(fetch, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [source])

  // ── Production QTE ──
  const loadProdAnalyse = useCallback(() => {
    if (!source) return
    const projet = source.replace(/^CSL_/i, '')
    productionApi.getAnalyse(projet, 'CSL', statsPeriod, statsDateFrom, statsDateTo)
      .then(d => setProdAnalyse(d)).catch(() => {})
    const today = new Date().toISOString().slice(0, 10)
    productionApi.getQte(projet, 'CSL',
      statsPeriod === 'today' ? today : statsDateFrom,
      statsPeriod === 'today' ? today : statsDateTo)
      .then(list => {
        if (list && list.length > 0) {
          setProdQte(String(list[0].QTE_GLOBALE ?? list[0].qteGlobale ?? ''))
          setProdQteId(list[0].ID ?? list[0].id ?? null)
        } else { setProdQte(''); setProdQteId(null) }
      }).catch(() => {})
  }, [source, statsPeriod, statsDateFrom, statsDateTo])

  useEffect(() => { loadProdAnalyse() }, [loadProdAnalyse])

  const handleSaveProdQte = async () => {
    if (!source || !prodQte) return
    const projet = source.replace(/^CSL_/i, '')
    const today  = new Date().toISOString().slice(0, 10)
    setProdSaving(true)
    try {
      if (prodQteId) {
        await productionApi.updateQte(prodQteId, Number(prodQte))
      } else {
        const res = await productionApi.createQte({ projet, module: 'CSL', dateProd: today, qteGlobale: Number(prodQte) })
        setProdQteId(res?.id ?? null)
      }
      loadProdAnalyse()
      setToast('✓ Quantité enregistrée'); setTimeout(() => setToast(''), 3000)
    } catch (e) { setToast('✗ ' + e.message); setTimeout(() => setToast(''), 5000) }
    finally { setProdSaving(false) }
  }

  const handleSearch = useCallback(debounce((val) => { setFilters(f => ({ ...f, search: val })); setPage(1) }, 500), [])
  const setFilter    = (key, val) => { setFilters(f => ({ ...f, [key]: val })); setPage(1) }

  const runBarcodeSearch = useCallback(async (barcode) => {
    const val = String(barcode || '').trim().replace(/^'+/, '')
    if (!val || val.length < 6) return
    try {
      const data = await cslApi.getAll({ source, page: 1, limit: 50, search: val, dateFilter: '', repriseFilter: '', refFilter: '', versionFilter: '' })
      if (data.records?.length > 0) {
        const rec = data.records.find(r => (r.barCode||'').replace(/^'+/,'') === val) || data.records[0]
        if (rec.reprise === 'Not Returned') { setRepriseRecord(rec) }
        else { alert('Part is already ' + rec.reprise); setBarcodeSearch('') }
      } else { alert('Barcode does not exist on project: ' + source.toUpperCase()); setBarcodeSearch('') }
    } catch (e) { alert('Erreur: ' + e.message); setBarcodeSearch('') }
  }, [source])

  const doBarcodeSearch = useCallback(debounce((b) => runBarcodeSearch(b), 500), [runBarcodeSearch])

  useEffect(() => { if (barcodeSearch) doBarcodeSearch(barcodeSearch) }, [barcodeSearch, doBarcodeSearch])

  const handleRepriseUpdate = async (reprise) => {
    if (!repriseRecord) return
    try {
      for (const d of repriseRecord.defects) {
        await cslApi.update({ ...repriseRecord, ...d, codeDef: d.codeDef, defStatus: reprise === 'Returned' ? 'FIXED' : d.status || 'NOT FIXED', reprise, source })
      }
      setRepriseRecord(null); setBarcodeSearch(''); loadData(); loadReport()
    } catch (e) { alert(e.message) }
  }

  const confirmBarcode = (val) => {
    const bc = val.trim()
    if (!bc || bc.length < 4) return
    setPendingBarcode(bc)
    setMultiRecords([{ ...createEmptyRecord(), barCode: bc }])
    setCheckpointOptions({})
    setBarcodeStep('form')
    lookupApi.barcode(bc).then(d => {
      setMultiRecords(rs => rs.map((r, i) => i === 0
        ? { ...r, ref: d.refDetail || d.tableName || '', version: d.version || '', project: d.tableName || '' }
        : r))
      if (d.pdef && d.tableName) {
        projectsApi.getRefCheckpoints(d.tableName, d.pdef)
          .then(r => setCheckpointOptions(o => ({ ...o, 0: r?.checkpoints || [] })))
          .catch(() => setCheckpointOptions(o => ({ ...o, 0: [] })))
      }
    }).catch(() => {})
  }

  const openAdd  = () => {
    setMultiRecords([createEmptyRecord()])
    setBarcodeStep('scan'); setPendingBarcode('')
    setFormError(''); setEditingRecord(null); setModal('add')
  }

  // ── Multi-record helpers ──
  const addRecord        = () => setMultiRecords(rs => [...rs, createEmptyRecord()])
  const removeRecord     = (idx) => { if (multiRecords.length === 1) return; setMultiRecords(rs => rs.filter((_, i) => i !== idx)) }
  const toggleRecord     = (idx) => setMultiRecords(rs => rs.map((r, i) => i === idx ? { ...r, isOpen: !r.isOpen } : r))
  const updateRec        = (idx, key, val) => setMultiRecords(rs => rs.map((r, i) => i === idx ? { ...r, [key]: val } : r))
  const updateRecDefect  = (rIdx, dIdx, key, val) => setMultiRecords(rs => rs.map((r, i) => {
    if (i !== rIdx) return r
    const defects = [...r.defects]; defects[dIdx] = { ...defects[dIdx], [key]: val }
    return { ...r, defects }
  }))
  const addRecDefect     = (rIdx) => setMultiRecords(rs => rs.map((r, i) => i === rIdx ? { ...r, defects: [...r.defects, { ...EMPTY_DEFECT }] } : r))
  const removeRecDefect  = (rIdx, dIdx) => setMultiRecords(rs => rs.map((r, i) => {
    if (i !== rIdx || r.defects.length <= 1) return r
    return { ...r, defects: r.defects.filter((_, j) => j !== dIdx) }
  }))

  const handleRecBarcodeScan = async (idx, barcode) => {
    if (!barcode || barcode.length < 8) return
    try {
      const d = await lookupApi.barcode(barcode)
      setMultiRecords(rs => rs.map((r, i) => i === idx ? { ...r, ref: d.refDetail || d.tableName || '', version: d.version || '', project: d.tableName || '' } : r))
      if (d.pdef && d.tableName) {
        projectsApi.getRefCheckpoints(d.tableName, d.pdef)
          .then(r => setCheckpointOptions(o => ({ ...o, [idx]: r?.checkpoints || [] })))
          .catch(() => setCheckpointOptions(o => ({ ...o, [idx]: [] })))
      }
    } catch {}
  }
  const handleRecPolyLookup = async (idx, val) => {
    if (!val) return
    const cqVal = val.startsWith('CQ') ? val : 'CQ' + val
    try {
      const d = await lookupApi.poly(cqVal)
      setMultiRecords(rs => rs.map((r, i) => i === idx ? { ...r, superviseur: d.superviseur || '', equipe2: d.equipe2 || '' } : r))
    } catch {}
  }
  const handleRecDefLookup = async (rIdx, dIdx, cod) => {
    if (!cod) return
    try {
      const d = await lookupApi.def(cod)
      updateRecDefect(rIdx, dIdx, 'descDef', d.descDef || '')
      updateRecDefect(rIdx, dIdx, 'demirite', d.demirite || 0)
    } catch {}
  }
  const openEdit = (rec) => {
    setForm({
      barCode: rec.barCode, dateFw: rec.date, cqCsl: rec.cqCsl || '',
      cqDelibera: rec.cqDelibera || '', ref: rec.ref || '', version: rec.version || '',
      poste: rec.poste || '', remarque: rec.remarque || '', reprise: rec.reprise || 'Not Returned',
      ref2: rec.ref2 || '', ref3: rec.ref3 || '', tampon: rec.tampon || '',
      project: rec.project || '', equipe: '', equipe2: rec.equipeProd || '', superviseur: rec.superviseur || '',
      defects: rec.defects.map(d => ({ codeDef: d.codeDef || '', checkpoint: d.checkpoint || '', descDef: d.descDef || '', qty: d.qty || 1, demirite: d.demirite || 0, status: d.status || 'NOT FIXED' })),
    })
    setEditingRecord(rec); setFormError(''); setModal('edit')
    setEditCheckpointOptions([])
    lookupApi.barcode(rec.barCode).then(d => {
      if (d.pdef && d.tableName) {
        projectsApi.getRefCheckpoints(d.tableName, d.pdef)
          .then(r => setEditCheckpointOptions(r?.checkpoints || []))
          .catch(() => setEditCheckpointOptions([]))
      }
    }).catch(() => {})
  }

  const handlePolyLookup = async (val) => {
    if (!val) return
    const cqVal = val.startsWith('CQ') ? val : 'CQ' + val
    try { const d = await lookupApi.poly(cqVal); setForm(f => ({ ...f, superviseur: d.superviseur || '', equipe: d.equipe || '', equipe2: d.equipe2 || '' })) } catch {}
  }
  const handleDefLookup = async (cod, idx) => {
    if (!cod) return
    try {
      const d = await lookupApi.def(cod)
      setForm(f => { const defects = [...f.defects]; defects[idx] = { ...defects[idx], descDef: d.descDef || '', demirite: d.demirite || 0 }; return { ...f, defects } })
    } catch {}
  }

  const updateDefect = (idx, key, val) => setForm(f => { const defects = [...f.defects]; defects[idx] = { ...defects[idx], [key]: val }; return { ...f, defects } })
  const addDefect    = () => setForm(f => ({ ...f, defects: [...f.defects, { ...EMPTY_DEFECT }] }))
  const removeDefect = (idx) => { if (form.defects.length <= 1) return; setForm(f => ({ ...f, defects: f.defects.filter((_, i) => i !== idx) })) }

  const handleSave = async () => {
    setSaving(true); setFormError('')
    try {
      if (modal === 'add') {
        const invalid = multiRecords.some(r => !r.barCode || !r.poste || r.defects.some(d => !d.codeDef))
        if (invalid) { setFormError('Barcode, poste et code défaut requis pour chaque enregistrement'); setSaving(false); return }
        const payload = multiRecords.flatMap(r => r.defects.map(d => ({
          barCode: r.barCode, dateFw: '', cqCsl: r.cqCsl, cqDelibera: r.cqDelibera,
          ref: r.ref, version: r.version, poste: r.poste, remarque: r.remarque, reprise: r.reprise,
          ref2: r.ref2, ref3: r.ref3, tampon: r.tampon || r.cqDelibera,
          project: r.project, equipe2: r.equipe2, superviseur: r.superviseur,
          codeDef: d.codeDef, checkpoint: d.checkpoint, descDef: d.descDef, qty: d.qty, demirite: d.demirite,
          defstatus: 'NOT FIXED', source,
        })))
        await cslApi.create(payload)
      } else {
        if (!form.barCode || !form.poste || form.defects.some(d => !d.codeDef)) { setFormError('Barcode, poste et code défaut requis'); setSaving(false); return }
        if (editingRecord) for (const d of editingRecord.defects) await cslApi.delete(editingRecord.barCode, d.codeDef, source)
        const payload = form.defects.map(d => ({
          barCode: form.barCode, dateFw: form.dateFw, cqCsl: form.cqCsl, cqDelibera: form.cqDelibera,
          ref: form.ref, version: form.version, poste: form.poste, remarque: form.remarque, reprise: form.reprise,
          ref2: form.ref2, ref3: form.ref3, tampon: form.tampon || form.cqDelibera,
          project: form.project, equipe2: form.equipe2, superviseur: form.superviseur,
          codeDef: d.codeDef, checkpoint: d.checkpoint, descDef: d.descDef, qty: d.qty, demirite: d.demirite, defstatus: d.status || 'NOT FIXED', source,
        }))
        await cslApi.create(payload)
      }
      setModal(null); loadData(); loadReport()
    } catch (e) { setFormError(e.response?.data?.error || e.response?.data?.message || e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (barCode, codDef) => {
    if (!confirm(`Supprimer le défaut ${codDef} du barcode ${barCode} ?`)) return
    try { await cslApi.delete(barCode, codDef, source); loadData() } catch (e) { alert(e.response?.data?.error || e.message) }
  }

  const handleImportFile = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setImporting(true); setImportMsg('Importing…')
    try {
      // ── Détecte si le fichier est un HTML-XLS (export PHP) ou un vrai XLSX ──
      const preview = await file.slice(0, 300).text()
      const isHtmlXls = preview.trimStart().startsWith('<') ||
                        preview.includes('<html') ||
                        preview.includes('<table')

      let mapped = []

      if (isHtmlXls) {
        // ── Parser HTML-XLS (export de l'ancienne appli PHP) ──────────────────
        // Structure confirmée : header ligne 0 (colspan=5 sur "Defects"),
        // sub-header ligne 1, données à partir de ligne 2 avec 23 colonnes :
        // [0]=#  [1]=BarCode  [2]=Date  [3]=Reprise  [4]=Superviseur
        // [5]=CQCSL  [6]=CQDelibera  [7]=Ref
        // [8]=CodeDef  [9]=DescDef  [10]=Demerite  [11]=Qty  [12]=Status  ← sous "Defects" colspan=5
        // [13]=Version  [14]=Poste  [15]=Remarque  [16]=DateCode
        // [17]=Ref2  [18]=Ref3  [19]=Tampon  [20]=RefDetail  [21]=Project  [22]=EquipeProd
        const htmlText = await file.text()
        const doc = new DOMParser().parseFromString(htmlText, 'text/html')
        const rows = Array.from(doc.querySelectorAll('tr'))
        for (let i = 2; i < rows.length; i++) {
          const cells = Array.from(rows[i].querySelectorAll('td,th'))
            .map(td => td.textContent.trim())
          if (cells.length < 9) continue
          const id = cells[0].replace(/'/g, '')
          if (!id || isNaN(id)) continue
          const barCode = (cells[1] || '').replace(/^'/, '')
          const codeDef = (cells[8] || '').trim()
          if (!barCode || !codeDef) continue
          mapped.push({
            barCode,
            dateFw:      cells[2]  || '',
            reprise:     cells[3]  || 'Not Returned',
            superviseur: cells[4]  || '',
            cqCsl:       cells[5]  || '',
            cqDelibera:  cells[6]  || '',
            ref:         cells[7]  || '',
            codeDef,
            descDef:     cells[9]  || '',
            demirite:    Number(cells[10]) || 0,
            qty:         Number(cells[11]) || 1,
            defstatus:   cells[12] || 'NOT FIXED',
            version:     cells[13] || '',
            poste:       cells[14] || '',
            remarque:    cells[15] || '',
            ref2:        cells[17] || '',
            ref3:        cells[18] || '',
            tampon:      cells[19] || '',
            refDetail:   cells[20] || '',
            project:     cells[21] || '',
            equipe2:     cells[22] || '',
          })
        }
      } else {
        // ── Parser XLSX standard avec SheetJS ─────────────────────────────────
        const rows = await parseExcelFile(file)
        mapped = rows.map(r => {
          const norm = {}
          for (const k of Object.keys(r)) norm[k.toUpperCase().replace(/[\s_]/g, '')] = r[k]
          const col = (...keys) => {
            for (const k of keys) {
              const v = r[k]
              if (v !== undefined && v !== null && v !== '') return String(v)
              const nv = norm[k.toUpperCase().replace(/[\s_]/g, '')]
              if (nv !== undefined && nv !== null && nv !== '') return String(nv)
            }
            return ''
          }
          return {
            barCode:     col('BARCODE', 'barCode', 'Bar Code'),
            dateFw:      col('DATEFW', 'dateFw', 'Date'),
            cqCsl:       col('CQCSL', 'cqCsl', 'CQ CSL'),
            cqDelibera:  col('CQDELIBERA', 'cqDelibera', 'CQ Delibera'),
            ref:         col('REF', 'ref', 'Ref'),
            codeDef:     col('CODDEF', 'codeDef', 'Code Def'),
            checkpoint:  col('CHECKPOINT', 'checkpoint', 'Checkpoint'),
            descDef:     col('DESC_DEF', 'descDef', 'Desc Def'),
            qty:         Number(col('QTY', 'qty', 'Qty')) || 1,
            version:     col('VERSION', 'version', 'Version'),
            poste:       col('POSTE', 'poste', 'Poste'),
            remarque:    col('REMARQUEDEFAUT', 'remarque', 'Remarque'),
            demirite:    Number(col('DEMERITE', 'demirite', 'Demerite')) || 0,
            reprise:     col('REPRISE', 'reprise', 'Reprise') || 'Not Returned',
            ref2:        col('REF2', 'ref2', 'Ref2'),
            ref3:        col('REF3', 'ref3', 'Ref3'),
            tampon:      col('TAMPON', 'tampon', 'Tampon'),
            project:     col('PROJET', 'project', 'Project'),
            equipe2:     col('EQUIPEPROD', 'equipe2', 'Equipe Prod'),
            superviseur: col('SUPERVISEUR', 'superviseur', 'Superviseur'),
            defstatus:   col('DEFECT_STATUS', 'defstatus', 'Status') || 'NOT FIXED',
          }
        }).filter(r => r.barCode && r.codeDef)
      }

      if (mapped.length === 0) {
        alert('Aucune ligne valide trouvée.\nVérifiez que le fichier contient les colonnes Bar Code et Code Def.')
        e.target.value = ''
        return
      }

      // ── Filtre par date ───────────────────────────────────────────────────
      const totalExcel = mapped.length
      if (importFilter.type !== 'ALL') {
        const now = new Date()
        mapped = mapped.filter(row => {
          const raw = row.dateFw; if (!raw) return false
          const d = new Date(raw); if (isNaN(d)) return false
          if (importFilter.type === 'TODAY') {
            return d.toDateString() === now.toDateString()
          } else if (importFilter.type === 'THIS_WEEK') {
            const ws = new Date(now); ws.setDate(now.getDate() - ((now.getDay() + 6) % 7)); ws.setHours(0,0,0,0)
            return d >= ws
          } else if (importFilter.type === 'THIS_MONTH') {
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
          } else if (importFilter.type === 'CUSTOM') {
            const from = importFilter.dateFrom ? new Date(importFilter.dateFrom) : null
            const to   = importFilter.dateTo   ? new Date(importFilter.dateTo + 'T23:59:59') : null
            if (from && d < from) return false
            if (to   && d > to)   return false
            return true
          }
          return true
        })
        if (mapped.length === 0) {
          setImportMsg(`✗ Aucune ligne ne correspond au filtre (${totalExcel} lignes dans le fichier)`)
          e.target.value = ''; setImporting(false); setTimeout(() => setImportMsg(''), 5000); return
        }
        setImportMsg(`Filtre : ${mapped.length}/${totalExcel} lignes — Import en cours…`)
      }

      // ── Chunked upload: send 500 rows at a time to avoid 413 ───────────────
      const CHUNK = 500
      let ins = 0, skip = 0, errs = 0
      for (let i = 0; i < mapped.length; i += CHUNK) {
        const chunk = mapped.slice(i, i + CHUNK)
        const pct   = Math.round(((i + chunk.length) / mapped.length) * 100)
        setImportMsg(`Importation… ${pct}% (${i + chunk.length}/${mapped.length})`)
        const r = await cslApi.importRecords(source, chunk)
        ins += r.inserted; skip += r.skipped; errs += (r.errors || 0)
      }
      const icon = ins === 0 ? '✗' : errs > 0 ? '⚠' : '✓'
      const filteredNote = importFilter.type !== 'ALL' ? ` (filtrés sur ${totalExcel})` : ''
      setImportMsg(`${icon} Import terminé : ${ins} insérés, ${skip} ignorés${errs > 0 ? ', ' + errs + ' erreurs' : ''} / ${mapped.length}${filteredNote}`)
      loadData()
      setShowImportModal(false)
    } catch (err) {
      setImportMsg('✗ Erreur import: ' + err.message)
    } finally {
      setImporting(false)
      e.target.value = ''
      setTimeout(() => setImportMsg(''), 5000)
    }
  }

  const handleExport = async () => {
    try {
      const activeDateFilter = filters.dateFilter || ''
      const exportParams = { source, page: 1, limit: 0, dateFilter: activeDateFilter }
      if (activeDateFilter === 'custom' && statsDateFrom) exportParams.dateFrom = statsDateFrom
      if (activeDateFilter === 'custom' && statsDateTo)   exportParams.dateTo   = statsDateTo
      const data = await cslApi.getAll(exportParams)
      const all  = data.records || []
      const flat = all.flatMap(r => r.defects.map(d => ({
        BARCODE: r.barCode, DATEFW: r.date, CQCSL: r.cqCsl, CQDELIBERA: r.cqDelibera,
        REF: r.ref, VERSION: r.version, POSTE: r.poste, REMARQUEDEFAUT: r.remarque,
        CHECKPOINT: d.checkpoint || '', CODDEF: d.codeDef, DESC_DEF: d.descDef, QTY: d.qty, DEMERITE: d.demirite,
        DEFECT_STATUS: d.status, REPRISE: r.reprise, SUPERVISEUR: r.superviseur,
        PROJET: r.project, EQUIPEPROD: r.equipeProd, TAMPON: r.tampon,
      })))
      const periodLabel = activeDateFilter || 'all_time'
      const today = new Date().toISOString().slice(0, 10)
      exportToExcel(flat, `csl_${periodLabel}_${today}.xlsx`, 'CSL')
    } catch (err) { alert('Erreur export: ' + err.message) }
  }

  const displayName    = (s) => s.replace(/^CSL_/i, '')
  const totalItems     = stats.total ?? stats.todayItems ?? 0
  const returnedItems  = stats.returned ?? stats.returnedToday ?? 0
  const scrappedItems  = stats.scrapped ?? 0
  const returnPct      = stats.returnedPercent ?? (totalItems > 0 ? Math.round((returnedItems / totalItems) * 100) : 0)
  const notReturnedPct = totalItems > 0 ? Math.round(((report.partCount || 0) / totalItems) * 100) : 0
  const hStyle         = { display: showHidden ? 'table-cell' : 'none' }

  return (
    <>
      {/* ── HEADER : dropdown + scan + search (identique PHP) ── */}
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar"></div>
          <div className="header-project">
            <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'none', stroke: '#64748b', strokeWidth: 2 }}>
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            <select className="project-switcher" value={source} onChange={e => { setSource(e.target.value); setPage(1) }}>
              {sources.map(s => <option key={s} value={s}>{displayName(s)}</option>)}
            </select>
          </div>
        </div>

        <div className="barcode-search-input-container">
          <svg className="barcode-search-icon" viewBox="0 0 24 24">
            <path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14"/>
          </svg>
          <input type="text" className="barcode-search-input" placeholder="Scan returned barcode…"
            value={barcodeSearch}
            onChange={e => setBarcodeSearch(e.target.value)}
            onPaste={e => { setTimeout(() => { const v = e.target.value.trim(); if (v.length >= 6) runBarcodeSearch(v) }, 50) }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runBarcodeSearch(barcodeSearch) } }} />
        </div>

        <div className="header-right">
          <div className="search-container">
            <span className="search-icon">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            <input type="text" className="search-input" placeholder="Search…" onChange={e => handleSearch(e.target.value)} />
          </div>
          <QualityCoiffeScanner module="csl" source={source} api={cslApi} user={user} canWrite={canWrite} />
        </div>
      </div>

      <div className="content">
        <div className="page-title"><h2>CSL {displayName(source)} Dashboard</h2></div>

        {/* ── PERIOD FILTER BAR ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {['today', 'month', 'custom'].map(p => (
            <button key={p} onClick={() => setStatsPeriod(p)}
              style={{ padding: '6px 16px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: statsPeriod === p ? '#1e293b' : '#f1f5f9',
                color: statsPeriod === p ? '#fff' : '#64748b' }}>
              {p === 'today' ? 'Aujourd\'hui' : p === 'month' ? 'Ce mois' : 'Personnalisé'}
            </button>
          ))}
          {statsPeriod === 'custom' && (
            <>
              <input type="date" value={statsDateFrom} onChange={e => setStatsDateFrom(e.target.value)}
                style={{ padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
              <span style={{ color: '#cbd5e1', fontSize: 13 }}>→</span>
              <input type="date" value={statsDateTo} onChange={e => setStatsDateTo(e.target.value)}
                style={{ padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
            </>
          )}
        </div>

        {/* ── KPI CARDS ── */}
        <div className="stats-grid">
          <div className="stat-card stat-total">
            <div className="stat-header">
              <span className="stat-title">Total</span>
              <div className="stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="14" width="4" height="7" rx="1"/><rect x="9" y="9" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="17" rx="1"/>
                </svg>
              </div>
            </div>
            <div className="stat-value">{totalItems}</div>
            <div className="stat-sub">pièces contrôlées</div>
          </div>

          <div className="stat-card stat-returned">
            <div className="stat-header">
              <span className="stat-title">Retournées</span>
              <div className="stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
            </div>
            <div className="stat-chart-row">
              <div className="stat-ring-wrap">
                <svg className="stat-ring" viewBox="0 0 36 36">
                  <circle className="ring-bg" cx="18" cy="18" r="15.9"/>
                  <circle className="ring-fill ring-green" cx="18" cy="18" r="15.9"
                    strokeDasharray={`${returnPct} ${100 - returnPct}`}/>
                </svg>
                <div className="ring-pct">{returnPct}%</div>
              </div>
              <div>
                <div className="stat-value">{returnedItems}</div>
                <div className="stat-sub">pièces retournées</div>
              </div>
            </div>
          </div>

          <div className="stat-card" style={{ borderTopColor: '#8b5cf6' }}>
            <div className="stat-header">
              <span className="stat-title">Mise au rebut</span>
              <div className="stat-icon" style={{ color: '#8b5cf6' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
            </div>
            <div className="stat-value" style={{ color: '#8b5cf6' }}>{scrappedItems}</div>
            <div className="stat-sub">pièces scrappées</div>
          </div>

          <div className="stat-card stat-defects">
            <div className="stat-header">
              <span className="stat-title">Défaut fréquent</span>
              <div className="stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
            </div>
            <div className="stat-defect-badge">{stats.mostCommonDefect ?? stats.commonDefect ?? '-'}</div>
            <div className="stat-sub">code le plus fréquent</div>
          </div>

          <div className="stat-card stat-not-returned">
            <div className="stat-header">
              <span className="stat-title">Non retournées</span>
              <div className="stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div className="stat-value">{report.partCount || 0}</div>
                <div className="stat-sub">{totalItems > 0 ? `${notReturnedPct}% du total` : ''}</div>
              </div>
              <button className="filter-icon-btn" onClick={() => setShowReportModal(true)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#283618" viewBox="0 0 16 16">
                  <path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5zm1 .5v1.308l4.372 4.858A.5.5 0 0 1 7 8.5v5.306l2-.666V8.5a.5.5 0 0 1 .128-.334L13.5 3.308V2z"/>
                </svg>
              </button>
            </div>
            <div className="stat-progress">
              <div className="stat-progress-fill" style={{ width: `${Math.min(notReturnedPct, 100)}%` }}></div>
            </div>
          </div>
        </div>

        {/* ── PRODUCTION QTE WIDGET ── 
        <div style={{ background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:14, padding:'16px 20px', marginBottom:16, display:'flex', flexWrap:'wrap', gap:16, alignItems:'flex-start' }}>
          <div style={{ flex:'0 0 auto' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Quantité fabriquée</div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input type="number" min="0" placeholder="Ex: 1500" value={prodQte}
                onChange={e => setProdQte(e.target.value)}
                style={{ width:130, padding:'7px 10px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:14, fontWeight:700 }} />
              <button onClick={handleSaveProdQte} disabled={prodSaving || !prodQte}
                style={{ padding:'7px 16px', borderRadius:8, border:'none', cursor: prodSaving || !prodQte ? 'not-allowed' : 'pointer', fontSize:13, fontWeight:700,
                  background: prodSaving || !prodQte ? '#94a3b8' : 'linear-gradient(135deg,#15803d,#14532d)', color:'#fff' }}>
                {prodSaving ? '…' : 'Enregistrer'}
              </button>
            </div>
          </div>
          {prodAnalyse && (
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', flex:1 }}>
              {[
                { label:'QTE GLOBALE',    val: prodAnalyse.qteGlobale,       color:'#15803d', bg:'#f0fdf4', border:'#bbf7d0', fmt: v => Number(v).toLocaleString('fr-FR') },
                { label:'TAUX CONTRÔLE',  val: prodAnalyse.tauxControle,     color:'#0891b2', bg:'#ecfeff', border:'#a5f3fc', fmt: v => `${v}%`, ring: prodAnalyse.tauxControle },
                { label:'NON CONTRÔLÉES', val: prodAnalyse.qteNonControlees, color:'#f59e0b', bg:'#fffbeb', border:'#fde68a', fmt: v => Number(v).toLocaleString('fr-FR') },
              ].map(({ label, val, color, bg, border, fmt, ring }) => (
                <div key={label} style={{ background:bg, border:`1.5px solid ${border}`, borderRadius:12, padding:'12px 16px', minWidth:130, display:'flex', flexDirection:'column', gap:4 }}>
                  {ring !== undefined ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <svg viewBox="0 0 36 36" style={{ width:40, height:40, flexShrink:0 }}>
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3"/>
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
                          strokeDasharray={`${Math.min(ring,100)} ${100 - Math.min(ring,100)}`}
                          strokeLinecap="round" transform="rotate(-90 18 18)"/>
                      </svg>
                      <div style={{ fontSize:20, fontWeight:800, color, lineHeight:1 }}>{fmt(val)}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize:22, fontWeight:800, color, lineHeight:1 }}>{fmt(val)}</div>
                  )}
                  <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.05em' }}>{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        */}

        {/* ── BANDEAU ÉCHÉANCES ── */}
        {echeanceSummary && (echeanceSummary.nbRetard > 0 || echeanceSummary.nbProches > 0) && (() => {
          const proj = source.replace(/^CSL_/i, '')
          const isRed = echeanceSummary.nbRetard > 0
          const bg    = isRed ? '#fef2f2' : '#fffbeb'
          const bdr   = isRed ? '#fecaca' : '#fde68a'
          const clr   = isRed ? '#dc2626' : '#d97706'
          const msg = isRed
            ? `${echeanceSummary.nbRetard} pièce${echeanceSummary.nbRetard > 1 ? 's ont' : ' a'} dépassé leur délai`
            : `${echeanceSummary.nbProches} pièce${echeanceSummary.nbProches > 1 ? 's arrivent' : ' arrive'} à échéance dans <48h`
          return (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:bg, border:`1.5px solid ${bdr}`, borderRadius:10, padding:'10px 16px', marginBottom:14, gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" style={{ width:16, height:16, flexShrink:0 }}>
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <span style={{ color:clr, fontWeight:700, fontSize:13 }}>{msg}</span>
              </div>
              <Link to={`/echeances/${proj}`}
                style={{ fontSize:12, fontWeight:700, color:clr, background:'rgba(0,0,0,.05)', border:`1px solid ${bdr}`, borderRadius:6, padding:'4px 12px', textDecoration:'none', whiteSpace:'nowrap' }}>
                Voir les échéances →
              </Link>
            </div>
          )
        })()}

        {/* ── TABLE CONTAINER (identique PHP) ── */}
        <div className="table-container">
          <div className="table-header">
            <h3 className="table-title">CSL {displayName(source)} Records</h3>
            <div className="table-controls">
              <div className="filters">
                <select className="filter-select" value={filters.dateFilter} onChange={e => setFilter('dateFilter', e.target.value)}>
                  <option value="">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                </select>
                <select className="filter-select" value={filters.refFilter} onChange={e => setFilter('refFilter', e.target.value)}>
                  <option value="">All Ref</option>
                  <option value="CAV">CAV</option>
                  <option value="DAV">DAV</option>
                  <option value="CAR">CAR</option>
                  <option value="DAR">DAR</option>
                </select>
                <select className="filter-select" value={filters.versionFilter} onChange={e => setFilter('versionFilter', e.target.value)}>
                  <option value="">All Versions</option>
                  {versions.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select className="filter-select" value={filters.repriseFilter} onChange={e => setFilter('repriseFilter', e.target.value)}>
                  <option value="">All Reprise</option>
                  <option value="Returned">Returned</option>
                  <option value="Not Returned">Not Returned</option>
                  <option value="Scrap">Scrap</option>
                </select>
              </div>
              <button className="toggle-btn" onClick={() => setShowHidden(h => !h)}>
                <svg viewBox="0 0 24 24"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18"/></svg>
                Columns
              </button>
              {canWrite && (
                <button className="add-btn" onClick={openAdd}>
                  <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add
                </button>
              )}
              <button className="add-btn" style={{ background: '#059669' }} onClick={handleExport}>
                <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export
              </button>
              {canWrite && (
                <>
                  <input ref={fileRef} type="file" accept=".xls,.xlsx,.html,.htm" style={{ display: 'none' }} onChange={handleImportFile} />
                  <button className="add-btn" style={{ background: importing ? '#94a3b8' : '#475569' }} onClick={() => !importing && setShowImportModal(true)} disabled={importing}>
                    {importing
                      ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, margin: 0, marginRight: 6 }} />Importing…</>
                      : <><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Import</>
                    }
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="table-wrapper">
            {error && <div style={{ padding: 12, color: '#e53e3e' }}>{error}</div>}
            {loading ? <div className="loading"><div className="spinner" /></div> : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ width: 36 }}>
                      <input type="checkbox"
                        ref={el => { if (el) el.indeterminate = someSelected }}
                        checked={allSelected}
                        onChange={toggleAllBarcodes}
                        style={{ cursor: 'pointer' }} />
                    </th>
                    <th rowSpan={2}>#</th>
                    <th rowSpan={2}>Bar Code</th>
                    <th rowSpan={2}>Date</th>
                    <th rowSpan={2} className="reprise-column">Reprise</th>
                    <th rowSpan={2}>Superviseur</th>
                    <th rowSpan={2}>CQ CSL</th>
                    <th rowSpan={2}>CQ Delibera</th>
                    <th rowSpan={2}>Ref</th>
                    <th colSpan={6}>Defects</th>
                    <th rowSpan={2}>Version</th>
                    <th rowSpan={2}>Poste</th>
                    <th rowSpan={2}>Remarque</th>
                    <th rowSpan={2} className="hidden-column" style={hStyle}>Date Code</th>
                    <th rowSpan={2} className="hidden-column" style={hStyle}>Ref2</th>
                    <th rowSpan={2} className="hidden-column" style={hStyle}>Ref3</th>
                    <th rowSpan={2} className="hidden-column" style={hStyle}>Tampon</th>
                    <th rowSpan={2} className="hidden-column" style={hStyle}>Ref Detail</th>
                    <th rowSpan={2} className="hidden-column" style={hStyle}>Project</th>
                    <th rowSpan={2} className="hidden-column" style={hStyle}>Equipe Prod</th>
                    <th rowSpan={2} className="actions-column">Actions</th>
                  </tr>
                  <tr>
                    <th>Checkpoint</th><th>Code Def</th><th>Desc Def</th><th>Demerite</th><th>Qty</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 && (
                    <tr><td colSpan={25} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>No records found</td></tr>
                  )}
                  {records.map((rec, recIdx) => {
                    const chronNum = pagination.totalRecords - (pagination.currentPage - 1) * pagination.recordsPerPage - recIdx
                    const dcount = rec.defects.length
                    const rs     = dcount > 1 ? dcount : undefined
                    return rec.defects.map((d, dIdx) => (
                      <tr key={`${rec.barCode}-${d.codeDef}-${dIdx}`}>
                        {dIdx === 0 && <>
                          <td rowSpan={rs}>
                            <input type="checkbox"
                              checked={isBarcodeSelected(rec)}
                              onChange={() => toggleBarcode(rec)}
                              style={{ cursor: 'pointer' }} />
                          </td>
                          <td rowSpan={rs} style={{ fontWeight: 600, color: '#059669' }}>{chronNum}</td>
                          <td rowSpan={rs}><code style={{ fontSize: 11 }}>{rec.barCode}</code></td>
                          <td rowSpan={rs} style={{ fontSize: 11 }}>{rec.date?.slice(0, 16)}</td>
                          <td rowSpan={rs}>
                            <span className={`status-badge ${rec.reprise === 'Returned' ? 'status-returned' : rec.reprise === 'Scrap' ? 'status-scrap' : 'status-not-returned'}`}>
                              {rec.reprise || 'Not Returned'}
                            </span>
                            {(rec.reprise === 'Not Returned' || !rec.reprise) && rec.echeanceDepassee && (
                              <span title={`Échéance dépassée de ${rec.depassementHeures ? Math.round(rec.depassementHeures) + 'h' : '?'}`}
                                style={{ display:'inline-flex', alignItems:'center', marginLeft:5, verticalAlign:'middle', cursor:'help' }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" style={{ width:13, height:13 }}>
                                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                </svg>
                              </span>
                            )}
                          </td>
                          <td rowSpan={rs}>{rec.superviseur}</td>
                          <td rowSpan={rs}>{rec.cqCsl}</td>
                          <td rowSpan={rs}>{rec.cqDelibera}</td>
                          <td rowSpan={rs}>{rec.ref}</td>
                        </>}
                        <td>{d.checkpoint || '-'}</td>
                        <td><strong>{d.codeDef}</strong></td>
                        <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.descDef}</td>
                        <td>{d.demirite}</td>
                        <td>{d.qty}</td>
                        <td>
                          <span className={`status-badge ${d.status === 'FIXED' ? 'status-returned' : 'status-not-returned'}`}>
                            {d.status || 'NOT FIXED'}
                          </span>
                        </td>
                        {dIdx === 0 && <>
                          <td rowSpan={rs}>{rec.version}</td>
                          <td rowSpan={rs}>{rec.poste}</td>
                          <td rowSpan={rs}>{rec.remarque}</td>
                          <td rowSpan={rs} style={hStyle}>{rec.dateCode}</td>
                          <td rowSpan={rs} style={hStyle}>{rec.ref2}</td>
                          <td rowSpan={rs} style={hStyle}>{rec.ref3}</td>
                          <td rowSpan={rs} style={hStyle}>{rec.tampon}</td>
                          <td rowSpan={rs} style={hStyle}>{rec.defDetail}</td>
                          <td rowSpan={rs} style={hStyle}>{rec.project}</td>
                          <td rowSpan={rs} style={hStyle}>{rec.equipeProd}</td>
                          <td rowSpan={rs}>
                            {canWrite && !isReadOnly && (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(rec)}>✏️</button>
                                {canDelete && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(rec.barCode, d.codeDef)}>🗑️</button>}
                              </div>
                            )}
                          </td>
                        </>}
                      </tr>
                    ))
                  })}
                </tbody>
              </table>
            )}
          </div>
          <Pagination page={pagination.currentPage} totalPages={pagination.totalPages} total={pagination.totalRecords} limit={pagination.recordsPerPage} onPage={setPage} />
        </div>
      </div>

      {/* ── Import result toast ── */}
      {importMsg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,.15)', background: importMsg.startsWith('✓') ? '#059669' : importMsg.startsWith('⚠') ? '#d97706' : '#c92a2a', color: '#fff' }}>
          {importMsg}
        </div>
      )}

      {/* ── Bulk reprise toast ── */}
      {toast && !importMsg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,.15)', background: toast.startsWith('✓') ? '#059669' : '#c92a2a', color: '#fff' }}>
          {toast}
        </div>
      )}

      {/* ── Bulk action bar ── */}
      <BulkActionBar count={selectedBarcodes.size} onClear={clearSelection}>
        <select value={bulkRepriseVal} onChange={e => setBulkRepriseVal(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <option value="Returned">Returned</option>
          <option value="Scrap">Scrap</option>
          <option value="Not Returned">Not Returned</option>
        </select>
        <button onClick={handleBulkReprise} disabled={bulkApplying}
          style={{ background: bulkApplying ? '#94a3b8' : '#059669', border: 'none', color: '#fff', borderRadius: 8,
            padding: '6px 16px', cursor: bulkApplying ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>
          {bulkApplying ? 'Mise à jour…' : 'Appliquer'}
        </button>
      </BulkActionBar>

      {/* ── MODAL Import avec filtre de date ── */}
      {showImportModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.65)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => { if(e.target===e.currentTarget) setShowImportModal(false) }}>
          <div style={{ background:'#fff', borderRadius:16, minWidth:420, maxWidth:480, width:'100%', overflow:'hidden', boxShadow:'0 8px 40px rgba(0,0,0,0.22)' }}>
            <div style={{ background:'linear-gradient(135deg,#475569 0%,#334155 100%)', padding:'18px 22px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
                <span style={{ color:'#fff', fontSize:15, fontWeight:600 }}>Importer un fichier Excel</span>
              </div>
              <button onClick={() => setShowImportModal(false)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:6, width:28, height:28, cursor:'pointer', color:'#fff', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
            </div>
            <div style={{ padding:'20px 22px 24px' }}>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:8 }}>Filtre par date</label>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {[['ALL','Tout'],['TODAY','Aujourd\'hui'],['THIS_WEEK','Cette semaine'],['THIS_MONTH','Ce mois'],['CUSTOM','Personnalisé']].map(([val,label]) => (
                    <button key={val} onClick={() => setImportFilter(f => ({ ...f, type: val }))}
                      style={{ padding:'6px 14px', borderRadius:99, border:'1.5px solid', cursor:'pointer', fontSize:12, fontWeight:600, transition:'all .15s',
                        borderColor: importFilter.type === val ? '#475569' : '#e2e8f0',
                        background: importFilter.type === val ? '#1e293b' : '#f8fafc',
                        color: importFilter.type === val ? '#fff' : '#64748b' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {importFilter.type === 'CUSTOM' && (
                <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16 }}>
                  <div style={{ flex:1 }}>
                    <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:4 }}>Du</label>
                    <input type="date" value={importFilter.dateFrom} onChange={e => setImportFilter(f => ({ ...f, dateFrom: e.target.value }))}
                      style={{ width:'100%', padding:'7px 10px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:13, boxSizing:'border-box' }} />
                  </div>
                  <span style={{ color:'#cbd5e1', fontSize:16, marginTop:16 }}>→</span>
                  <div style={{ flex:1 }}>
                    <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:4 }}>Au</label>
                    <input type="date" value={importFilter.dateTo} onChange={e => setImportFilter(f => ({ ...f, dateTo: e.target.value }))}
                      style={{ width:'100%', padding:'7px 10px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:13, boxSizing:'border-box' }} />
                  </div>
                </div>
              )}
              <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 14px', marginBottom:18, fontSize:12, color:'#475569' }}>
                {importFilter.type === 'ALL' && 'Toutes les lignes du fichier seront importées.'}
                {importFilter.type === 'TODAY' && 'Seules les lignes dont la date correspond à aujourd\'hui seront importées.'}
                {importFilter.type === 'THIS_WEEK' && 'Seules les lignes de cette semaine (lun–dim) seront importées.'}
                {importFilter.type === 'THIS_MONTH' && 'Seules les lignes du mois en cours seront importées.'}
                {importFilter.type === 'CUSTOM' && 'Seules les lignes dans la plage de dates saisie seront importées.'}
              </div>
              <button onClick={() => fileRef.current.click()} disabled={importing}
                style={{ width:'100%', padding:'11px 0', background: importing ? '#94a3b8' : 'linear-gradient(135deg,#475569,#334155)', color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor: importing ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {importing
                  ? <><span className="spinner" style={{ width:14, height:14, borderWidth:2, margin:0 }} /> Importation…</>
                  : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Choisir un fichier Excel</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL Not Returned Filter (identique PHP) ── */}
      {showReportModal && (
        <div className="modal filter-modal" style={{ display: 'block' }} onClick={e => e.target === e.currentTarget && setShowReportModal(false)}>
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg,#1e293b 0%,#334155 100%)', borderRadius: '14px 14px 0 0', padding: '18px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, background: 'rgba(255,255,255,.12)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ width: 16, height: 16 }}>
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                  </svg>
                </div>
                <div>
                  <h2 className="modal-title" style={{ color: '#fff', fontSize: 15, margin: 0 }}>Pièces Non Retournées</h2>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>Filtrer par période · superviseur · ligne</div>
                </div>
              </div>
              <span className="close" onClick={() => setShowReportModal(false)} style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>×</span>
            </div>
            <div className="modal-body" style={{ padding: '20px 22px' }}>
              <div style={{ background: '#fef9ec', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 18, display: 'flex', gap: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                  Affiche le nombre de pièces avec statut <strong>Non Retournées</strong> selon les critères ci-dessous.
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Période</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="date" value={reportFilters.startDate} onChange={e => setReportFilters(f => ({ ...f, startDate: e.target.value }))}
                      style={{ flex: 1, padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
                    <span style={{ color: '#cbd5e1' }}>→</span>
                    <input type="date" value={reportFilters.endDate} onChange={e => setReportFilters(f => ({ ...f, endDate: e.target.value }))}
                      style={{ flex: 1, padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Superviseur</label>
                  <input type="text" list="supervisorListCsl" value={reportFilters.supervisor}
                    onChange={e => setReportFilters(f => ({ ...f, supervisor: e.target.value }))}
                    placeholder="Sélectionner ou saisir..."
                    style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
                  <datalist id="supervisorListCsl">{supervisors.map(s => <option key={s} value={s} />)}</datalist>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Ligne de production</label>
                  <select value={reportFilters.ref} onChange={e => setReportFilters(f => ({ ...f, ref: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
                    <option value="">Toutes les lignes</option>
                    <option value="CAV">CA (Avant)</option>
                    <option value="DAV">SA (Avant)</option>
                    <option value="CAR">CP (Arrière)</option>
                    <option value="DAR">SP (Arrière)</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
                <button onClick={() => { loadReport(); setShowReportModal(false) }}
                  style={{ flex: 1, padding: '9px 16px', background: 'linear-gradient(135deg,#e8590c,#c2440a)', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  Appliquer le filtre
                </button>
                <button onClick={() => { setReportFilters({ supervisor: '', ref: '', startDate: '', endDate: '' }); loadReport(); setShowReportModal(false) }}
                  style={{ padding: '9px 14px', background: '#f1f5f9', color: '#475569', border: '1.5px solid #e2e8f0', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  Réinitialiser
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL Update Reprise (identique PHP) ── */}
      {repriseRecord && (
        <div className="update-reprise-modal-overlay">
          <div className="update-reprise-modal-content">
            <div className="update-reprise-modal-header">
              <h2 className="update-reprise-modal-title">Update Reprise</h2>
              <button className="update-reprise-modal-close-btn" onClick={() => { setRepriseRecord(null); setBarcodeSearch('') }}>✕</button>
            </div>
            <div className="update-reprise-modal-body">
              <p>Barcode : <code>{repriseRecord.barCode}</code></p>
              <p>REF : {repriseRecord.ref} — Version : {repriseRecord.version}</p>
              <p>Superviseur : {repriseRecord.superviseur}</p>
              <p>Please click on the new Reprise status</p>
            </div>
            <div className="update-reprise-modal-footer">
              <button className="btn btn-success" onClick={() => handleRepriseUpdate('Returned')}>Returned</button>
              <button className="btn btn-warning" onClick={() => handleRepriseUpdate('Scrap')}>Scrap</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL Add New Record — 2-phase single modal ══ */}
      {modal === 'add' && createPortal(
        <div className="modal" style={{ display: 'block' }} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-content" style={barcodeStep === 'scan' ? { maxWidth: 460, margin: '10vh auto' } : {}}>
            <div className="modal-header">
              <h2 className="modal-title">
                {barcodeStep === 'scan' ? '📋 Ajouter un enregistrement' : '📋 Add New Record'}
              </h2>
              <span className="close" onClick={() => setModal(null)}>×</span>
            </div>
            <div className="modal-body" id="modalBody">

              {/* ══ PHASE 1 : Scan only ══ */}
              {barcodeStep === 'scan' && (
                <div style={{ padding: '32px 24px 40px', textAlign: 'center' }}>
                  <div style={{ width: 72, height: 72, background: 'linear-gradient(135deg,#e8590c,#c2440a)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 36, height: 36 }}>
                      <path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Scanner le code-barres</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 32 }}>Placez le curseur ici et scannez le produit</div>
                  <input
                    ref={barcodeInputRef}
                    autoFocus
                    type="text"
                    placeholder="Code-barres..."
                    value={pendingBarcode}
                    onChange={e => setPendingBarcode(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmBarcode(pendingBarcode) } }}
                    onPaste={e => { setTimeout(() => { const v = e.target.value.trim(); if (v.length >= 6) confirmBarcode(v) }, 30) }}
                    style={{ width: '100%', padding: '13px 18px', border: '2px solid #fbbf8a', borderRadius: 10, fontSize: 16, fontFamily: 'monospace', outline: 'none', textAlign: 'center', background: '#fff9f5', boxSizing: 'border-box', transition: 'all .2s' }}
                    onFocus={e => { e.target.style.borderColor = '#e8590c'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px rgba(232,89,12,.12)' }}
                    onBlur={e => { e.target.style.borderColor = '#fbbf8a'; e.target.style.background = '#fff9f5'; e.target.style.boxShadow = 'none' }}
                  />
                  <button
                    onClick={() => confirmBarcode(pendingBarcode)}
                    disabled={!pendingBarcode.trim()}
                    style={{ marginTop: 16, width: '100%', padding: '12px 0', background: pendingBarcode.trim() ? 'linear-gradient(135deg,#e8590c,#c2440a)' : '#e2e8f0', color: pendingBarcode.trim() ? '#fff' : '#94a3b8', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: pendingBarcode.trim() ? 'pointer' : 'not-allowed', transition: 'all .2s' }}>
                    Continuer →
                  </button>
                </div>
              )}

              {/* ══ PHASE 2 : Full form ══ */}
              {barcodeStep === 'form' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff7f0', border: '1.5px solid #fbbf8a', borderRadius: 10, padding: '10px 14px', marginBottom: 20 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#e8590c" strokeWidth="2" style={{ width: 18, height: 18, flexShrink: 0 }}>
                      <path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14"/>
                    </svg>
                    <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: '#1e293b', flex: 1 }}>{multiRecords[0]?.barCode}</span>
                    <button type="button" onClick={() => { setBarcodeStep('scan'); setPendingBarcode('') }}
                      style={{ fontSize: 11, color: '#e8590c', background: 'none', border: '1px solid #fbbf8a', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600 }}>
                      ✎ Changer
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={addRecord} style={{ fontSize: 11, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                      ➕ Add Barcode
                    </button>
                  </div>

                  {formError && <div style={{ color: '#e53e3e', margin: '0 0 12px' }}>{formError}</div>}

                  {multiRecords[0] && (() => {
                    const rec = multiRecords[0]
                    return (
                      <div>
                        <div className="form-section">
                          <h3 className="section-title section-quality">Quality Control</h3>
                          <div className="form-grid-2">
                            <div className="form-group">
                              <label className="form-label label-required">CQ Delibera</label>
                              <TamponAutocomplete
                                value={rec.cqDelibera}
                                tamponCodes={tampons}
                                placeholder="Sélectionner CQ Delibera"
                                onChange={v => { updateRec(0, 'cqDelibera', v); if (v) handleRecPolyLookup(0, v) }}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label label-required">CQ CSL</label>
                              <TamponAutocomplete
                                value={rec.cqCsl}
                                tamponCodes={tampons}
                                placeholder="Sélectionner CQ CSL"
                                onChange={v => updateRec(0, 'cqCsl', v)}
                              />
                            </div>
                          </div>
                          <div className="form-grid-2" style={{ marginTop: 8 }}>
                            <div className="form-group"><label className="form-label">REF (auto)</label><input className="form-input" value={rec.ref} readOnly style={{ background: '#f7fafc' }} /></div>
                            <div className="form-group"><label className="form-label">Version (auto)</label><input className="form-input" value={rec.version} readOnly style={{ background: '#f7fafc' }} /></div>
                            <div className="form-group"><label className="form-label">Superviseur (auto)</label><input className="form-input" value={rec.superviseur} readOnly style={{ background: '#f7fafc' }} /></div>
                            <div className="form-group"><label className="form-label">Equipe Prod (auto)</label><input className="form-input" value={rec.equipe2} readOnly style={{ background: '#f7fafc' }} /></div>
                            <div className="form-group">
                              <label className="form-label">Reprise</label>
                              <select className="form-input" value={rec.reprise} onChange={e => updateRec(0, 'reprise', e.target.value)}>
                                {['Not Returned', 'Returned', 'Scrap'].map(o => <option key={o}>{o}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                        <div className="form-section">
                          <h3 className="section-title section-defect" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            Defect Information
                            <button type="button" className="btn btn-secondary" onClick={() => addRecDefect(0)} style={{ fontSize: 12, padding: '4px 10px' }}>➕ Add Defect</button>
                          </h3>
                          <div className="defects-container">
                            {rec.defects.map((d, dIdx) => (
                              <div key={dIdx} className="defect-entry form-grid-2" style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, marginBottom: 8, position: 'relative' }}>
                                <div className="form-group">
                                  <label className="form-label label-required">Code Def</label>
                                  <ConstrainedSelect
                                    options={defCodes}
                                    value={d.codeDef}
                                    placeholder="Sélectionner code défaut"
                                    onChange={v => { updateRecDefect(0, dIdx, 'codeDef', v); if (v) handleRecDefLookup(0, dIdx, v) }}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Checkpoint</label>
                                  <select className="form-input" value={d.checkpoint || ''}
                                    disabled={!(checkpointOptions[0]?.length)}
                                    onChange={e => updateRecDefect(0, dIdx, 'checkpoint', e.target.value)}>
                                    <option value="">—</option>
                                    {(checkpointOptions[0] || []).map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Qty</label>
                                  <input type="number" className="form-input" min="0" value={d.qty} onChange={e => updateRecDefect(0, dIdx, 'qty', parseInt(e.target.value) || 1)} />
                                </div>
                                <button type="button" className="record-action-btn remove-defect-btn"
                                  onClick={() => removeRecDefect(0, dIdx)} disabled={rec.defects.length === 1}
                                  style={{ position: 'absolute', top: 8, right: 8 }}>🗑️</button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="form-section">
                          <h3 className="section-title section-optional">Optional Information</h3>
                          <div className="form-grid-2">
                            <div className="form-group">
                              <label className="form-label label-required">Poste *</label>
                              <ConstrainedSelect
                                options={postes}
                                value={rec.poste}
                                placeholder="Sélectionner poste"
                                required
                                onChange={v => updateRec(0, 'poste', v)}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Remarque <span className="label-optional">(Optional)</span></label>
                              <input type="text" className="form-input" placeholder="Additional remarks" value={rec.remarque} onChange={e => updateRec(0, 'remarque', e.target.value)} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {multiRecords.length > 1 && (
                    <div style={{ marginTop: 12 }}>
                      {multiRecords.slice(1).map((rec, i) => {
                        const rIdx = i + 1
                        const isComplete = rec.barCode && rec.defects.every(d => d.codeDef)
                        return (
                          <div key={rec.id} className="record-accordion">
                            <div className="record-accordion-trigger">
                              <div className={`record-status ${isComplete ? 'status-complete' : 'status-incomplete'}`} />
                              <div className="record-barcode-group">
                                <label className="form-label label-required">Original Bar Code</label>
                                <input type="text" className="form-input original-barcode-input" placeholder="Scan or enter barcode" value={rec.barCode}
                                  onChange={e => { updateRec(rIdx, 'barCode', e.target.value); handleRecBarcodeScan(rIdx, e.target.value) }}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRecBarcodeScan(rIdx, rec.barCode) } }} />
                              </div>
                              <div className="record-actions">
                                <button type="button" className="record-action-btn remove-record-btn" onClick={() => removeRecord(rIdx)}>🗑️</button>
                                <button type="button" className="record-action-btn toggle-accordion-btn" onClick={() => toggleRecord(rIdx)}>{rec.isOpen ? '▲' : '▼'}</button>
                              </div>
                            </div>
                            {rec.isOpen && (
                              <div className="record-accordion-content">
                                <div className="form-section">
                                  <h3 className="section-title section-quality">Quality Control</h3>
                                  <div className="form-grid-2">
                                    <div className="form-group">
                                      <label className="form-label label-required">CQ Delibera</label>
                                      <TamponAutocomplete value={rec.cqDelibera} tamponCodes={tampons} placeholder="Sélectionner CQ Delibera"
                                        onChange={v => { updateRec(rIdx, 'cqDelibera', v); if (v) handleRecPolyLookup(rIdx, v) }} />
                                    </div>
                                    <div className="form-group">
                                      <label className="form-label label-required">CQ CSL</label>
                                      <TamponAutocomplete value={rec.cqCsl} tamponCodes={tampons} placeholder="Sélectionner CQ CSL"
                                        onChange={v => updateRec(rIdx, 'cqCsl', v)} />
                                    </div>
                                  </div>
                                  <div className="form-grid-2" style={{ marginTop: 8 }}>
                                    <div className="form-group"><label className="form-label">REF (auto)</label><input className="form-input" value={rec.ref} readOnly style={{ background: '#f7fafc' }} /></div>
                                    <div className="form-group"><label className="form-label">Version (auto)</label><input className="form-input" value={rec.version} readOnly style={{ background: '#f7fafc' }} /></div>
                                    <div className="form-group"><label className="form-label">Superviseur (auto)</label><input className="form-input" value={rec.superviseur} readOnly style={{ background: '#f7fafc' }} /></div>
                                    <div className="form-group"><label className="form-label">Equipe Prod (auto)</label><input className="form-input" value={rec.equipe2} readOnly style={{ background: '#f7fafc' }} /></div>
                                    <div className="form-group"><label className="form-label">Reprise</label><select className="form-input" value={rec.reprise} onChange={e => updateRec(rIdx, 'reprise', e.target.value)}>{['Not Returned', 'Returned', 'Scrap'].map(o => <option key={o}>{o}</option>)}</select></div>
                                  </div>
                                </div>
                                <div className="form-section">
                                  <h3 className="section-title section-defect" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Defect Information<button type="button" className="btn btn-secondary" onClick={() => addRecDefect(rIdx)} style={{ fontSize: 12, padding: '4px 10px' }}>➕ Add Defect</button></h3>
                                  <div className="defects-container">{rec.defects.map((d, dIdx) => (<div key={dIdx} className="defect-entry form-grid-2" style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, marginBottom: 8, position: 'relative' }}><div className="form-group"><label className="form-label label-required">Code Def</label><ConstrainedSelect options={defCodes} value={d.codeDef} placeholder="Sélectionner code défaut" onChange={v => { updateRecDefect(rIdx, dIdx, 'codeDef', v); if (v) handleRecDefLookup(rIdx, dIdx, v) }} /></div><div className="form-group"><label className="form-label">Checkpoint</label><select className="form-input" value={d.checkpoint || ''} disabled={!(checkpointOptions[rIdx]?.length)} onChange={e => updateRecDefect(rIdx, dIdx, 'checkpoint', e.target.value)}><option value="">—</option>{(checkpointOptions[rIdx] || []).map(c => <option key={c} value={c}>{c}</option>)}</select></div><div className="form-group"><label className="form-label">Qty</label><input type="number" className="form-input" min="0" value={d.qty} onChange={e => updateRecDefect(rIdx, dIdx, 'qty', parseInt(e.target.value) || 1)} /></div><button type="button" className="record-action-btn remove-defect-btn" onClick={() => removeRecDefect(rIdx, dIdx)} disabled={rec.defects.length === 1} style={{ position: 'absolute', top: 8, right: 8 }}>🗑️</button></div>))}</div>
                                </div>
                                <div className="form-section"><h3 className="section-title section-optional">Optional Information</h3><div className="form-grid-2"><div className="form-group"><label className="form-label label-required">Poste *</label><ConstrainedSelect options={postes} value={rec.poste} placeholder="Sélectionner poste" required onChange={v => updateRec(rIdx, 'poste', v)} /></div><div className="form-group"><label className="form-label">Remarque <span className="label-optional">(Optional)</span></label><input type="text" className="form-input" placeholder="Additional remarks" value={rec.remarque} onChange={e => updateRec(rIdx, 'remarque', e.target.value)} /></div></div></div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="form-footer">
                    <button type="submit" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                      <span className="loading-spinner" style={{ display: saving ? 'inline-block' : 'none' }} />
                      💾 Save
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>,
        document.body
      )}


      {/* ══ MODAL Edit Record — single record ══ */}
      {modal === 'edit' && createPortal(
        <div className="modal" style={{ display: 'block' }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Edit Record — {form.barCode}</h2>
              <span className="close" onClick={() => setModal(null)}>×</span>
            </div>
            <div className="modal-body">
              {formError && <div style={{ color: '#e53e3e', marginBottom: 12 }}>{formError}</div>}

              <div className="form-header" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label label-required">Original Bar Code</label>
                  <input type="text" className="form-input original-barcode-input"
                    value={form.barCode} disabled style={{ background: '#f7fafc' }} />
                </div>
              </div>

              <div className="form-section">
                <h3 className="section-title section-quality">Quality Control</h3>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label label-required">CQ Delibera</label>
                    <TamponAutocomplete
                      value={form.cqDelibera}
                      tamponCodes={tampons}
                      placeholder="Sélectionner CQ Delibera"
                      onChange={v => { setForm(f => ({ ...f, cqDelibera: v })); if (v) handlePolyLookup(v) }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label label-required">CQ CSL</label>
                    <TamponAutocomplete
                      value={form.cqCsl}
                      tamponCodes={tampons}
                      placeholder="Sélectionner CQ CSL"
                      onChange={v => setForm(f => ({ ...f, cqCsl: v }))}
                    />
                  </div>
                </div>
                <div className="form-grid-2" style={{ marginTop: 8 }}>
                  <div className="form-group">
                    <label className="form-label">REF (auto)</label>
                    <input className="form-input" value={form.ref} readOnly style={{ background: '#f7fafc' }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Version (auto)</label>
                    <input className="form-input" value={form.version} readOnly style={{ background: '#f7fafc' }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Superviseur (auto)</label>
                    <input className="form-input" value={form.superviseur} readOnly style={{ background: '#f7fafc' }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Equipe Prod (auto)</label>
                    <input className="form-input" value={form.equipe2} readOnly style={{ background: '#f7fafc' }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Reprise</label>
                    <select className="form-input" value={form.reprise} onChange={e => setForm(f => ({ ...f, reprise: e.target.value }))}>
                      {['Not Returned', 'Returned', 'Scrap'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3 className="section-title section-defect" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  Defect Information
                  <button type="button" className="btn btn-secondary" onClick={addDefect} style={{ fontSize: 12, padding: '4px 10px' }}>
                    ➕ Add Defect
                  </button>
                </h3>
                <div className="defects-container">
                  {form.defects.map((d, idx) => (
                    <div key={idx} className="defect-entry form-grid-2" style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, marginBottom: 8, position: 'relative' }}>
                      <div className="form-group">
                        <label className="form-label label-required">Code Def</label>
                        <ConstrainedSelect
                          options={defCodes}
                          value={d.codeDef}
                          placeholder="Sélectionner code défaut"
                          onChange={v => { updateDefect(idx, 'codeDef', v); if (v) handleDefLookup(v, idx) }}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Checkpoint</label>
                        <select className="form-input" value={d.checkpoint || ''}
                          disabled={!(editCheckpointOptions?.length)}
                          onChange={e => updateDefect(idx, 'checkpoint', e.target.value)}>
                          <option value="">—</option>
                          {(editCheckpointOptions || []).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Qty</label>
                        <input type="number" className="form-input" min="0" value={d.qty}
                          onChange={e => updateDefect(idx, 'qty', parseInt(e.target.value) || 1)} />
                      </div>
                      <button type="button" className="record-action-btn remove-defect-btn"
                        onClick={() => removeDefect(idx)} disabled={form.defects.length === 1}
                        style={{ position: 'absolute', top: 8, right: 8 }}>🗑️</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-section">
                <h3 className="section-title section-optional">Optional Information</h3>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label label-required">Poste *</label>
                    <ConstrainedSelect
                      options={postes}
                      value={form.poste}
                      placeholder="Sélectionner poste"
                      required
                      onChange={v => setForm(f => ({ ...f, poste: v }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Remarque <span className="label-optional">(Optional)</span></label>
                    <input type="text" className="form-input" placeholder="Additional remarks"
                      value={form.remarque} onChange={e => setForm(f => ({ ...f, remarque: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="form-footer">
                <button type="submit" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving && <span className="loading-spinner" style={{ marginRight: 6 }} />}
                  💾 Save
                </button>
              </div>
            </div>
          </div>
        </div>
        , document.body
      )}
    </>
  )
}