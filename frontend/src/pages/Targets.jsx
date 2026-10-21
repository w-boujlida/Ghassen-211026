import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { targetsApi } from '../api/targets.api.js'
import { projectsApi } from '../api/projects.api.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import Modal, { ModalBtn, ModalField } from '../components/Modal.jsx'

const SHIFT_SLOTS = {
  MATIN: [
    '06:00-07:00', '07:00-08:00', '08:00-09:00', '09:00-10:00',
    '10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00-14:00',
  ],
  APRES_MIDI: [
    '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00',
    '18:00-19:00', '19:00-20:00', '20:00-21:00', '21:00-22:00',
  ],
}

const SHIFT_LABELS = {
  MATIN: 'Matin (06h-14h)',
  APRES_MIDI: 'Après-midi (14h-22h)',
}

// ── RowQuickFill — applique une valeur à toutes les heures d'une ligne ─────
function RowQuickFill({ onApply }) {
  const [val, setVal] = useState('')

  const apply = () => {
    if (val === '') return
    onApply(val)
  }

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 5 }}>
      <input
        type="number"
        step="any"
        placeholder="Val. rapide"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply() } }}
        style={{ width: 74, fontSize: 11, padding: '3px 6px', border: '1.5px solid #e2e8f0', borderRadius: 6 }}
      />
      <button
        type="button"
        onClick={apply}
        title="Appliquer cette valeur à toute la ligne"
        style={{
          width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', borderRadius: 6, background: '#15803d', color: '#fff', cursor: 'pointer',
          fontSize: 12, flexShrink: 0, lineHeight: 1,
        }}
      >
        ✓
      </button>
    </div>
  )
}

// ── TargetGrid — tableau ligne de projet × heure, lecture ou édition ──────
function TargetGrid({ lignes, slots, values, onCellChange, editable = false }) {
  const [bulkVal, setBulkVal] = useState('')

  const applyToRow = (ligne, val) => {
    slots.forEach(heure => onCellChange(ligne, heure, val))
  }

  const applyToAll = () => {
    if (bulkVal === '') return
    lignes.forEach(ligne => slots.forEach(heure => onCellChange(ligne, heure, bulkVal)))
  }

  return (
    <div>
      {editable && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Appliquer à toutes les lignes
          </span>
          <input
            type="number"
            step="any"
            placeholder="Valeur"
            value={bulkVal}
            onChange={e => setBulkVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyToAll() } }}
            style={{ width: 90, fontSize: 12, padding: '5px 8px', border: '1.5px solid #e2e8f0', borderRadius: 7 }}
          />
          <ModalBtn variant="secondary" onClick={applyToAll} style={{ padding: '5px 12px', fontSize: 12 }}>
            Appliquer
          </ModalBtn>
        </div>
      )}
      <div style={{ overflowX: 'auto', border: '1.5px solid #e2e8f0', borderRadius: 10 }}>
        <table className="data-table" style={{ minWidth: 260 + slots.length * 100 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1 }}>Ligne de projet</th>
              {slots.map(h => <th key={h} style={{ whiteSpace: 'nowrap' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {lignes.map(ligne => (
              <tr key={ligne}>
                <td style={{ position: 'sticky', left: 0, background: '#fff', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 600 }}>{ligne}</div>
                  {editable && <RowQuickFill onApply={v => applyToRow(ligne, v)} />}
                </td>
                {slots.map(heure => (
                  <td key={heure} style={editable ? undefined : { textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                    {editable ? (
                      <input
                        type="number"
                        step="any"
                        className="form-input"
                        style={{ width: 80, textAlign: 'center' }}
                        value={values[`${ligne}|${heure}`] ?? ''}
                        onChange={e => onCellChange(ligne, heure, e.target.value)}
                      />
                    ) : (
                      values[`${ligne}|${heure}`] ?? 0
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── AddTargetModal ────────────────────────────────────────────────────────
function AddTargetModal({ onClose, onSaved }) {
  const [projects, setProjects] = useState([])
  const [projet, setProjet]     = useState('')
  const [shift, setShift]       = useState('')
  const [lignes, setLignes]     = useState([])
  const [lignesLoading, setLignesLoading] = useState(false)
  const [values, setValues]     = useState({})
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    projectsApi.getProjects()
      .then(d => setProjects(d?.projects || []))
      .catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    if (!projet) { setLignes([]); return }
    setLignesLoading(true)
    projectsApi.getLignesProjet(projet)
      .then(d => setLignes(d?.lignes || []))
      .catch(() => setLignes([]))
      .finally(() => setLignesLoading(false))
  }, [projet])

  const slots = shift ? SHIFT_SLOTS[shift] : []
  const setCell = (ligne, heure, v) => setValues(p => ({ ...p, [`${ligne}|${heure}`]: v }))

  const handleSave = async () => {
    if (!projet || !shift) { setError('Projet et shift requis'); return }
    if (lignes.length === 0) { setError('Aucune ligne de projet (LIGNE) pour ce projet'); return }
    setSaving(true); setError('')
    try {
      const cells = lignes.flatMap(ligne =>
        slots.map(heure => ({ ligneProjet: ligne, heure, valeur: values[`${ligne}|${heure}`] ?? 0 }))
      )
      await targetsApi.create({ projet, shift, cells })
      onSaved()
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Ajouter un target"
      onClose={onClose}
      maxWidth={Math.min(1100, 260 + slots.length * 100)}
      footer={
        <>
          <ModalBtn variant="secondary" onClick={onClose}>Annuler</ModalBtn>
          <ModalBtn onClick={handleSave} disabled={saving || !projet || !shift || lignes.length === 0}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </ModalBtn>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ flex: '1 1 220px', minWidth: 200 }}>
          <ModalField label="Projet" required>
            <select className="form-input" value={projet} onChange={e => setProjet(e.target.value)}>
              <option value="">Sélectionner…</option>
              {projects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </ModalField>
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 200 }}>
          <ModalField label="Shift" required>
            <select className="form-input" value={shift} onChange={e => setShift(e.target.value)}>
              <option value="">Sélectionner…</option>
              {Object.keys(SHIFT_SLOTS).map(s => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
            </select>
          </ModalField>
        </div>
      </div>

      {projet && shift && (
        <div>
          {lignesLoading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : lignes.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94a3b8', padding: '12px 0' }}>
              Aucune ligne de projet (LIGNE) trouvée pour {projet}.
            </div>
          ) : (
            <TargetGrid lignes={lignes} slots={slots} values={values} onCellChange={setCell} editable />
          )}
        </div>
      )}
    </Modal>
  )
}

// ── ListView ──────────────────────────────────────────────────────────────
function ListView() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [targets, setTargets] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    targetsApi.list()
      .then(d => setTargets(d?.targets || []))
      .catch(() => setTargets([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (t) => {
    if (!confirm(`Supprimer le target "${t.PROJET}" (${SHIFT_LABELS[t.SHIFT] || t.SHIFT}) ?`)) return
    try {
      await targetsApi.remove(t.ID)
      load()
    } catch (e) {
      alert(e.response?.data?.error || e.response?.data?.message || e.message)
    }
  }

  return (
    <>
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar" />
          <div className="header-title-group">
            <h2>Target</h2>
            <span className="header-subtitle">Objectifs de production par projet, shift et heure</span>
          </div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Targets <span className="badge-count" style={{ marginLeft: 8 }}>{targets.length}</span></h3>
          {isAdmin && (
            <div className="table-controls">
              <button className="add-btn" onClick={() => setModalOpen(true)}>
                <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Ajouter un target
              </button>
            </div>
          )}
        </div>

        <div className="table-wrapper">
          {loading ? <div className="loading"><div className="spinner" /></div> : (
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>Projet</th><th>Shift</th><th>Lignes</th><th>Créé par</th><th>Créé le</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {targets.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Aucun target trouvé</td></tr>
                )}
                {targets.map((t, idx) => (
                  <tr key={t.ID}>
                    <td style={{ color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                    <td><strong>{t.PROJET}</strong></td>
                    <td>{SHIFT_LABELS[t.SHIFT] || t.SHIFT}</td>
                    <td>{t.NB_LIGNES}</td>
                    <td>{t.CREATED_BY}</td>
                    <td style={{ fontSize: 12 }}>{t.CREATED_AT}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-icon btn-edit" onClick={() => navigate(`/targets/${t.ID}`)}>
                        Détails
                      </button>
                      {isAdmin && (
                        <button className="btn-icon btn-delete" onClick={() => handleDelete(t)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalOpen && (
        <AddTargetModal
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }}
        />
      )}
    </>
  )
}

// ── DetailView ────────────────────────────────────────────────────────────
function DetailView({ id }) {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [target, setTarget] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [editValues, setEditValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    targetsApi.getOne(id)
      .then(setTarget)
      .catch(() => setTarget(null))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="loading"><div className="spinner" /></div>
  if (!target) return <div style={{ padding: 24, color: '#94a3b8' }}>Target introuvable</div>

  const details = target.details || []
  const lignes  = [...new Set(details.map(d => d.LIGNE_PROJET))].sort()
  const slots   = SHIFT_SLOTS[target.SHIFT] || []
  const valeurMap = {}
  details.forEach(d => { valeurMap[`${d.LIGNE_PROJET}|${d.HEURE}`] = d.VALEUR })

  const startEdit = () => {
    setEditValues({ ...valeurMap })
    setError('')
    setEditMode(true)
  }

  const cancelEdit = () => {
    setEditMode(false)
    setEditValues({})
    setError('')
  }

  const setEditCell = (ligne, heure, v) => setEditValues(p => ({ ...p, [`${ligne}|${heure}`]: v }))

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const cells = lignes.flatMap(ligne =>
        slots.map(heure => ({ ligneProjet: ligne, heure, valeur: editValues[`${ligne}|${heure}`] ?? 0 }))
      )
      await targetsApi.update(id, { cells })
      setEditMode(false)
      load()
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Supprimer le target "${target.PROJET}" (${SHIFT_LABELS[target.SHIFT] || target.SHIFT}) ?`)) return
    try {
      await targetsApi.remove(id)
      navigate('/targets')
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || e.message)
    }
  }

  return (
    <>
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/targets')}
              style={{ background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRadius: 9, padding: '6px 13px', cursor: 'pointer', fontSize: 12, color: '#475569', fontWeight: 600 }}>
              ← Retour
            </button>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Target — {target.PROJET}</h2>
              <span className="header-subtitle">{SHIFT_LABELS[target.SHIFT] || target.SHIFT} · Créé par {target.CREATED_BY} le {target.CREATED_AT}</span>
            </div>
          </div>
        </div>
        {isAdmin && !editMode && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="add-btn" onClick={startEdit}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              Modifier
            </button>
            <button className="btn-icon btn-delete" onClick={handleDelete}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
              Supprimer
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: '24px 28px' }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
        <TargetGrid
          lignes={lignes}
          slots={slots}
          values={editMode ? editValues : valeurMap}
          onCellChange={editMode ? setEditCell : undefined}
          editable={editMode}
        />
        {editMode && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
            <ModalBtn variant="secondary" onClick={cancelEdit} disabled={saving}>Annuler</ModalBtn>
            <ModalBtn onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </ModalBtn>
          </div>
        )}
      </div>
    </>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────
export default function Targets() {
  const { id } = useParams()
  return id ? <DetailView id={id} /> : <ListView />
}
