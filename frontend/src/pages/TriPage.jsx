import React, { useEffect, useState, useCallback, useRef } from 'react'
import { triApi } from '../api/tri.api.js'
import Pagination from '../components/Pagination.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

export const TRI_ZONES = [
  { key: 'MAGASIN_MP',    label: 'MAGASIN MP',   side: 'left'  },
  { key: 'COUPE',         label: 'COUPE',         side: 'left'  },
  { key: 'DECOUPE_LIGNE', label: 'Découpe ligne', side: 'left'  },
  { key: 'LIGNE_COUTURE', label: 'Ligne couture', side: 'left'  },
  { key: 'ZONE_DELIBERA', label: 'ZONE DELIBERA', side: 'right' },
  { key: 'ZONE_FW',       label: 'ZONE FW',       side: 'right' },
  { key: 'RACK_PF',       label: 'RACK PF',       side: 'right' },
  { key: 'MAGASIN_PF',    label: 'MAGASIN PF',    side: 'right' },
]

const STATUS_OPTIONS = ['NON LANCEE', 'ENCOURS', 'CLOTURE']

const EMPTY_FORM = {
  projet: '', coiffe: '', version: '', defaut: '', status: 'NON LANCEE',
  zones: Object.fromEntries(TRI_ZONES.map(z => [z.key, { enabled: false, qteGlobale: '', qteTriee: '', qteNok: '', qteOk: '' }])),
}

function statusBadge(s) {
  const cfg = {
    'NON LANCEE': { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
    'ENCOURS':    { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
    'CLOTURE':    { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  }
  const c = cfg[s] || cfg['NON LANCEE']
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>
      {s || 'NON LANCEE'}
    </span>
  )
}

// ── Stat card icons ───────────────────────────────────────────────────────────
const IconTotal   = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
const IconEncours = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const IconCloture = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
const IconNonLancee = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>

const STAT_CARDS = [
  { key: null,          label: 'TOTAL TRI',    sub: 'toutes fiches',  field: 'total',     color: '#15803d', bg: 'rgba(21,128,61,.08)',  Icon: IconTotal    },
  { key: 'ENCOURS',     label: 'EN COURS',     sub: 'en cours de tri', field: 'encours',   color: '#d97706', bg: 'rgba(217,119,6,.08)',  Icon: IconEncours  },
  { key: 'CLOTURE',     label: 'CLÔTURÉES',    sub: 'fiches clôturées',field: 'cloture',   color: '#16a34a', bg: 'rgba(22,163,74,.08)',  Icon: IconCloture  },
  { key: 'NON LANCEE',  label: 'NON LANCÉES',  sub: 'non lancées',    field: 'nonLancee', color: '#64748b', bg: 'rgba(100,116,139,.08)', Icon: IconNonLancee },
]

export default function TriPage() {
  const { canWrite, canDelete } = useAuth()
  const [view, setView]             = useState('list')
  const [fiches, setFiches]         = useState([])
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, totalRecords: 0, recordsPerPage: 20 })
  const [loading, setLoading]       = useState(false)
  const [projects, setProjects]     = useState([])
  const [filterProjet, setFilterProjet] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage]             = useState(1)
  const [editingId, setEditingId]   = useState(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState('')
  const [toast, setToast]           = useState('')
  const [stats, setStats]           = useState({ total: 0, encours: 0, cloture: 0, nonLancee: 0 })
  const [exporting, setExporting]   = useState(false)
  const [importModal, setImportModal] = useState(null) // null | 'picking' | { imported, skipped, errors }
  const importInputRef              = useRef(null)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadStats = useCallback(() => {
    triApi.getStats(filterProjet || undefined)
      .then(d => setStats(d || {}))
      .catch(() => {})
  }, [filterProjet])

  const loadFiches = useCallback(() => {
    setLoading(true)
    triApi.getFiches(filterProjet || undefined, filterStatus || undefined, page, 20)
      .then(d => {
        setFiches(d.records || [])
        setPagination(d.pagination || {})
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [filterProjet, filterStatus, page])

  useEffect(() => {
    triApi.getProjects()
      .then(d => setProjects(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  useEffect(() => { loadStats() },  [loadStats])
  useEffect(() => { loadFiches() }, [loadFiches])

  const handleStatCardClick = (statusKey) => {
    if (statusKey === null) {
      setFilterStatus('')
    } else {
      setFilterStatus(prev => prev === statusKey ? '' : statusKey)
    }
    setPage(1)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setView('form')
  }

  const openEdit = (fiche) => {
    const zonesState = Object.fromEntries(
      TRI_ZONES.map(z => {
        const zoneData = fiche.zones?.find(fz => fz.zoneName === z.key)
        return [z.key, {
          enabled:    !!zoneData,
          qteGlobale: zoneData ? String(zoneData.qteGlobale ?? '') : '',
          qteTriee:   zoneData ? String(zoneData.qteTriee   ?? '') : '',
          qteNok:     zoneData ? String(zoneData.qteNok     ?? '') : '',
          qteOk:      zoneData ? String(zoneData.qteOk      ?? '') : '',
        }]
      })
    )
    setForm({
      projet:  fiche.projet  || '',
      coiffe:  fiche.coiffe  || '',
      version: fiche.version || '',
      defaut:  fiche.defaut  || '',
      status:  fiche.status  || 'NON LANCEE',
      zones:   zonesState,
    })
    setEditingId(fiche.id)
    setFormError('')
    setView('form')
  }

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette fiche de tri ?')) return
    try {
      await triApi.deleteFiche(id)
      showToast('✓ Fiche supprimée')
      loadFiches()
      loadStats()
    } catch (e) { alert(e.message) }
  }

  const buildPayload = () => ({
    projet:  form.projet,
    coiffe:  form.coiffe,
    version: form.version,
    defaut:  form.defaut,
    status:  form.status,
    zones: TRI_ZONES
      .filter(z => form.zones[z.key]?.enabled)
      .map(z => {
        const qteGlobale = parseInt(form.zones[z.key].qteGlobale) || 0
        const qteTriee   = parseInt(form.zones[z.key].qteTriee)   || 0
        const qteNok     = parseInt(form.zones[z.key].qteNok)     || 0
        const qteOk      = parseInt(form.zones[z.key].qteOk)      || 0
        return {
          zoneName:   z.key,
          qteGlobale,
          qteTriee,
          qteNok,
          qteOk,
        }
      }),
  })

  const handleSave = async () => {
    if (!form.projet) { setFormError('Le projet est obligatoire'); return }
    setSaving(true); setFormError('')
    try {
      const payload = buildPayload()
      if (editingId) {
        await triApi.updateFiche(editingId, payload)
        showToast('✓ Fiche mise à jour')
      } else {
        await triApi.createFiche(payload)
        showToast('✓ Fiche créée')
      }
      setView('list')
      loadFiches()
      loadStats()
    } catch (e) {
      setFormError(e.response?.data?.error || e.response?.data?.message || e.message)
    } finally { setSaving(false) }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const resp = await triApi.exportExcel(filterProjet || undefined, filterStatus || undefined)
      const url = URL.createObjectURL(new Blob([resp.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }))
      const a = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      a.href = url
      a.download = `tri_export_${filterProjet || 'all'}_${date}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { alert('Erreur export: ' + e.message) }
    finally { setExporting(false) }
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const result = await triApi.importExcel(file)
      setImportModal(result)
      loadFiches()
      loadStats()
    } catch (e) {
      setImportModal({ imported: 0, skipped: 0, errors: [e.message] })
    }
  }

  const setZone = (key, field, val) =>
    setForm(f => ({ ...f, zones: { ...f.zones, [key]: { ...f.zones[key], [field]: val } } }))

  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const zoneVal = (fiche, key, field) => {
    const z = fiche.zones?.find(fz => fz.zoneName === key)
    if (!z) return ''
    if (field === 'qteGlobale') return z.qteGlobale
    if (field === 'qteTriee')   return z.qteTriee
    if (field === 'qteOk')      return z.qteOk
    return z.qteNok
  }

  // ── FORM VIEW ─────────────────────────────────────────────────────────────
  if (view === 'form') {
    return (
      <>
        <div className="header">
          <div className="header-left">
            <div className="header-accent-bar" />
            <div className="header-title-group">
              <h2>{editingId ? 'Modifier une Fiche de Tri' : 'Créer une Fiche de Tri'}</h2>
              <span className="header-subtitle">Module Tri · Contrôle qualité coiffes</span>
            </div>
          </div>
          <div className="header-right">
            <div className="hbadge hbadge-clock">
              <span className="hbadge-clock-dot" />
              <span>{today}</span>
            </div>
          </div>
        </div>

        <div className="content">
          <div style={{ maxWidth: 780, margin: '0 auto' }}>
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,.06)', padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#15803d,#14532d)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                      {editingId ? 'MODIFICATION FICHE DE TRI' : 'CRÉATION FICHE DE TRI'}
                    </div>
                    {editingId && <div style={{ fontSize: 11, color: '#94a3b8' }}>ID: {editingId}</div>}
                  </div>
                </div>
                {!editingId && (
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                    NUM: <span style={{ fontFamily: 'monospace', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 8px' }}>AUTO</span>
                  </div>
                )}
              </div>

              {formError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>DATE</label>
                  <input className="form-input" value={today} disabled style={{ background: '#f8fafc', color: '#64748b' }} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>
                      PROJET <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select className="form-input" value={form.projet} onChange={e => setForm(f => ({ ...f, projet: e.target.value }))}>
                      <option value="">— Choisir —</option>
                      {projects.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>STATUS</label>
                    <select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>COIFFE</label>
                  <input className="form-input" placeholder="Référence coiffe…" value={form.coiffe} onChange={e => setForm(f => ({ ...f, coiffe: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>VERSION</label>
                  <input className="form-input" placeholder="Version…" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} />
                </div>
              </div>

              <div style={{ marginBottom: 22 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>DÉFAUT</label>
                <input className="form-input" placeholder="Description du défaut…" value={form.defaut} onChange={e => setForm(f => ({ ...f, defaut: e.target.value }))} />
              </div>

              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>ZONES</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {['left', 'right'].map(side => (
                    <div key={side} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Zone</th>
                            <th style={{ padding: '8px 4px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#0d9488', borderBottom: '1px solid #e2e8f0', width: 64 }}>GLOBALE</th>
                            <th style={{ padding: '8px 4px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#0f766e', borderBottom: '1px solid #e2e8f0', width: 64 }}>TRIEE</th>
                            <th style={{ padding: '8px 4px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0', width: 64 }}>RESTANTE</th>
                            <th style={{ padding: '8px 4px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#16a34a', borderBottom: '1px solid #e2e8f0', width: 64 }}>OK</th>
                            <th style={{ padding: '8px 4px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#dc2626', borderBottom: '1px solid #e2e8f0', width: 64 }}>NOK</th>
                          </tr>
                        </thead>
                        <tbody>
                          {TRI_ZONES.filter(z => z.side === side).map((z, i) => {
                            const zs = form.zones[z.key]
                            const qteGlobale  = parseInt(zs.qteGlobale) || 0
                            const qteTriee    = parseInt(zs.qteTriee)   || 0
                            const qteRestante = Math.max(0, qteGlobale - qteTriee)
                            return (
                              <tr key={z.key} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc', borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 10px' }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                                    <input type="checkbox" checked={zs.enabled} onChange={e => setZone(z.key, 'enabled', e.target.checked)} style={{ cursor: 'pointer' }} />
                                    {z.label}
                                  </label>
                                </td>
                                <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                                  <input type="number" min="0" value={zs.qteGlobale} disabled={!zs.enabled}
                                    onChange={e => setZone(z.key, 'qteGlobale', e.target.value)}
                                    style={{ width: 56, padding: '4px 4px', border: '1px solid #99f6e4', borderRadius: 6, fontSize: 12, textAlign: 'center',
                                      background: zs.enabled ? '#f0fdfa' : '#f1f5f9', color: zs.enabled ? '#0d9488' : '#94a3b8' }} />
                                </td>
                                <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                                  <input type="number" min="0" value={zs.qteTriee} disabled={!zs.enabled}
                                    onChange={e => setZone(z.key, 'qteTriee', e.target.value)}
                                    style={{ width: 56, padding: '4px 4px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, textAlign: 'center',
                                      background: zs.enabled ? '#fff' : '#f1f5f9', color: zs.enabled ? '#1e293b' : '#94a3b8' }} />
                                </td>
                                <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                                  <input type="number" readOnly value={zs.enabled ? qteRestante : ''} tabIndex={-1}
                                    style={{ width: 56, padding: '4px 4px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, textAlign: 'center',
                                      background: '#F3F4F6', color: '#64748b', cursor: 'default' }} />
                                </td>
                                <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                                  <input type="number" min="0" value={zs.qteOk} disabled={!zs.enabled}
                                    onChange={e => setZone(z.key, 'qteOk', e.target.value)}
                                    style={{ width: 56, padding: '4px 4px', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 12, textAlign: 'center',
                                      background: zs.enabled ? '#f0fdf4' : '#f1f5f9', color: zs.enabled ? '#16a34a' : '#94a3b8' }} />
                                </td>
                                <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                                  <input type="number" min="0" value={zs.qteNok} disabled={!zs.enabled}
                                    onChange={e => setZone(z.key, 'qteNok', e.target.value)}
                                    style={{ width: 56, padding: '4px 4px', border: '1px solid #fee2e2', borderRadius: 6, fontSize: 12, textAlign: 'center',
                                      background: zs.enabled ? '#fff5f5' : '#f1f5f9', color: zs.enabled ? '#dc2626' : '#94a3b8' }} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
                {['VALIDATION DEMANDEUR', 'VALIDATION RESP. QUALITÉ'].map(label => (
                  <div key={label} style={{ border: '1px dashed #e2e8f0', borderRadius: 8, padding: '12px 14px', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setView('list')}
                  style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  Annuler
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: saving ? '#94a3b8' : 'linear-gradient(135deg,#15803d,#14532d)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                  {saving ? 'Enregistrement…' : 'SAVE'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar" />
          <div className="header-title-group">
            <h2>Liste des Tri Encours</h2>
            <span className="header-subtitle">Module Tri · Fiches de contrôle qualité</span>
          </div>
        </div>
        <div className="header-right">
          <div className="hbadge hbadge-clock">
            <span className="hbadge-clock-dot" />
            <span>{today}</span>
          </div>
        </div>
      </div>

      <div className="content">

        {/* ── Stat cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
          {STAT_CARDS.map(card => {
            const val  = stats[card.field] ?? 0
            const isActive = filterStatus === card.key || (card.key === null && filterStatus === '')
            return (
              <div key={card.field}
                onClick={() => handleStatCardClick(card.key)}
                style={{
                  background: '#fff', borderRadius: 14, border: `1.5px solid ${isActive ? card.color : '#e2e8f0'}`,
                  padding: '16px 18px', cursor: 'pointer', position: 'relative', overflow: 'hidden',
                  boxShadow: isActive ? `0 4px 20px ${card.color}28` : '0 2px 8px rgba(0,0,0,.04)',
                  transition: 'all .18s', userSelect: 'none',
                }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: card.color, borderRadius: '14px 14px 0 0' }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.8px' }}>{card.label}</span>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: card.color, flexShrink: 0 }}>
                    <card.Icon />
                  </div>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 30, fontWeight: 700, color: '#0f172a', lineHeight: 1, letterSpacing: '-1px' }}>
                  {Number(val).toLocaleString('fr-FR')}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }}>{card.sub}</div>
              </div>
            )
          })}
        </div>

        {/* ── Filters + actions bar ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="filter-select" value={filterProjet} onChange={e => { setFilterProjet(e.target.value); setPage(1) }}>
            <option value="">Tous projets</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="filter-select" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
            <option value="">Tous statuts</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <div style={{ flex: 1 }} />

          {/* Export button */}
          <button onClick={handleExport} disabled={exporting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 8, border: 'none',
              background: exporting ? '#94a3b8' : 'linear-gradient(135deg,#059669,#0891b2)', color: '#fff',
              cursor: exporting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {exporting ? 'Export…' : 'Export Excel'}
          </button>

          {/* Import button */}
          {canWrite && (
            <>
              <input ref={importInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportFile} />
              <button onClick={() => importInputRef.current?.click()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 8,
                  border: '1.5px solid #15803d', background: '#fff', color: '#15803d',
                  cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Import Excel
              </button>
            </>
          )}

          {canWrite && (
            <button className="add-btn" style={{ background: '#15803d' }} onClick={openCreate}>
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Lancer un tri
            </button>
          )}
        </div>

        {/* ── Table ── */}
        <div className="table-container">
          <div className="table-header">
            <h3 className="table-title">
              Fiches de Tri
              <span className="badge-count">{pagination.totalRecords || 0}</span>
            </h3>
          </div>
          <div className="table-wrapper" style={{ overflowX: 'auto' }}>
            {loading ? <div className="loading"><div className="spinner" /></div> : (
              <table className="data-table" style={{ minWidth: 1200 }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ width: 50 }}>NUM</th>
                    <th rowSpan={2}>DATE</th>
                    <th rowSpan={2}>PROJET</th>
                    <th rowSpan={2}>COIFFE</th>
                    <th rowSpan={2}>VERSION</th>
                    <th rowSpan={2}>DÉFAUT</th>
                    <th rowSpan={2}>STATUS</th>
                    {TRI_ZONES.map(z => (
                      <th key={z.key} colSpan={4} style={{ textAlign: 'center', background: '#fef3c7', color: '#d97706', borderBottom: '1px solid #fde68a', fontSize: 11, fontWeight: 700 }}>
                        {z.label}
                      </th>
                    ))}
                    <th rowSpan={2} style={{ width: 90 }}>Actions</th>
                  </tr>
                  <tr>
                    {TRI_ZONES.map(z => (
                      <React.Fragment key={z.key}>
                        <th style={{ fontSize: 10, fontWeight: 700, color: '#0d9488', background: '#f0fdfa', padding: '4px 4px', whiteSpace: 'nowrap' }}>GLOBALE</th>
                        <th style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', background: '#f0fdf4', padding: '4px 4px', whiteSpace: 'nowrap' }}>TRIEE</th>
                        <th style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', padding: '4px 4px', whiteSpace: 'nowrap' }}>OK</th>
                        <th style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fff5f5', padding: '4px 4px', whiteSpace: 'nowrap' }}>NOK</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fiches.length === 0 && (
                    <tr>
                      <td colSpan={7 + TRI_ZONES.length * 4 + 1} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                        Aucune fiche de tri
                      </td>
                    </tr>
                  )}
                  {fiches.map(f => (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 700, color: '#15803d', fontFamily: 'monospace' }}>{f.num}</td>
                      <td style={{ fontSize: 12 }}>{f.dateTri}</td>
                      <td><span style={{ fontWeight: 700, fontSize: 12 }}>{f.projet}</span></td>
                      <td style={{ fontSize: 12 }}>{f.coiffe}</td>
                      <td style={{ fontSize: 12 }}>{f.version}</td>
                      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={f.defaut}>{f.defaut}</td>
                      <td>{statusBadge(f.status)}</td>
                      {TRI_ZONES.map(z => (
                        <React.Fragment key={z.key}>
                          <td style={{ textAlign: 'center', fontSize: 12, color: '#0d9488', fontWeight: zoneVal(f, z.key, 'qteGlobale') ? 700 : 400 }}>
                            {zoneVal(f, z.key, 'qteGlobale') || '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: 12, color: '#0f766e', fontWeight: zoneVal(f, z.key, 'qteTriee') ? 700 : 400 }}>
                            {zoneVal(f, z.key, 'qteTriee') || '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: 12, color: zoneVal(f, z.key, 'qteOk') ? '#16a34a' : '#94a3b8', fontWeight: zoneVal(f, z.key, 'qteOk') ? 700 : 400 }}>
                            {zoneVal(f, z.key, 'qteOk') || '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: 12, color: zoneVal(f, z.key, 'qteNok') ? '#dc2626' : '#94a3b8', fontWeight: zoneVal(f, z.key, 'qteNok') ? 700 : 400 }}>
                            {zoneVal(f, z.key, 'qteNok') || '—'}
                          </td>
                        </React.Fragment>
                      ))}
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {canWrite && (
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(f)} title="Modifier">✏️</button>
                          )}
                          {canDelete && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(f.id)} title="Supprimer">🗑️</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <Pagination page={pagination.currentPage} totalPages={pagination.totalPages} total={pagination.totalRecords} limit={pagination.recordsPerPage} onPage={p => setPage(p)} />
        </div>
      </div>

      {/* ── Import result modal ── */}
      {importModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,.45)' }}
          onClick={() => setImportModal(null)}>
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,.25)', padding: '28px 32px', minWidth: 380, maxWidth: 520 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Résultat de l&apos;import
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, textAlign: 'center', background: '#f0fdf4', borderRadius: 10, padding: '12px 8px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{importModal.imported}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Importées</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', background: '#fffbeb', borderRadius: 10, padding: '12px 8px', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#d97706' }}>{importModal.skipped}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Ignorées</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', background: '#fef2f2', borderRadius: 10, padding: '12px 8px', border: '1px solid #fecaca' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>{importModal.errors?.length ?? 0}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Erreurs</div>
              </div>
            </div>
            {importModal.errors?.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', maxHeight: 160, overflowY: 'auto', marginBottom: 16 }}>
                {importModal.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#dc2626', marginBottom: 3 }}>{e}</div>
                ))}
              </div>
            )}
            <button onClick={() => setImportModal(null)}
              style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#15803d,#14532d)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,.15)', background: toast.startsWith('✓') ? '#059669' : '#c92a2a', color: '#fff' }}>
          {toast}
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .tri-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 500px) {
          .tri-stat-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  )
}
