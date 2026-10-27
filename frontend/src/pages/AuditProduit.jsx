import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { auditProduitApi } from '../api/auditProduit.api.js'
import { postesApi }       from '../api/postes.api.js'
import { useAuth }         from '../contexts/AuthContext.jsx'
import Pagination          from '../components/Pagination.jsx'
import * as XLSX           from 'xlsx'
import { reportClientExport } from '../utils/businessActivity.js'

// ─── Control points template ──────────────────────────────────────────────────

const BASE_POINTS = [
  { n: 1,  probleme: 'Mélange de références dans le carton', desc: "Vérifier la correspondance entre l'étiquette de traçabilité produit et l'étiquette Galia", hasMinMax: false },
  { n: 2,  probleme: null, desc: "Vérifier la correspondance entre le produit et l'étiquette d'identification", hasMinMax: false },
  { n: 3,  probleme: 'Emballage', desc: "Vérifier si le conditionnement des coiffes est conforme à l'instruction d'emballage", hasMinMax: false },
  { n: 4,  probleme: 'Produits finis', desc: 'Talon de couture (assemblage) : 10+/-1,5mm', min: 8.5, max: 11.5 },
  { n: 5,  probleme: null, desc: 'Talon de couture (surpiqûre double) : 8+/-0,5mm', min: 7.5, max: 8.5 },
  { n: 6,  probleme: null, desc: 'Talon de couture (surpiqûre simple) : 4+/-0,5mm', min: 3.5, max: 4.5 },
  { n: 7,  probleme: null, desc: 'DAV : Talon de couture (tie down) : 8mm (+/-1)', min: 7, max: 9 },
  { n: 8,  probleme: null, desc: 'Décalage Cran (mm)', max: 3 },
  { n: 9,  probleme: null, desc: 'Bord à bord (mm)', max: 2 },
  { n: 10, probleme: null, desc: 'Alignement (mm)', max: 2 },
  { n: 11, probleme: null, desc: 'Mesurer longueur de 10 points (assemblage) : 4mm (-1;+0,5)', min: 3, max: 4.5 },
  { n: 12, probleme: null, desc: 'Mesurer longueur de 10 points (Tie down) : 4mm (-1;+0,5)', min: 3, max: 4.5 },
  { n: 13, probleme: null, desc: 'Mesurer longueur de 10 points (surpiqûre) : 4mm (-1;+0,5)', min: 3, max: 4.5 },
  { n: 14, probleme: null, desc: "Vérifier la présence, l'orientation et la position de tous les composants (Profil, BA2, SRS AIRBAG, …)", hasMinMax: false },
  { n: 15, probleme: null, desc: 'Aspect général de la coiffe (Fil apparent, coins de la coiffe...)', hasMinMax: false },
  { n: 16, probleme: null, desc: 'Vérifier la présence et la conformité des formes intérieur', hasMinMax: false },
  { n: 17, probleme: null, desc: 'Vérifier la conformité et la symétrie des motifs plateau', hasMinMax: false },
  { n: 18, probleme: null, desc: "Longueur de fil à l'endroit : 0 mm", max: 0 },
  { n: 19, probleme: null, desc: "Longueur de fil à l'envers : 1 cm", max: 1 },
  { n: 20, probleme: null, desc: "Vérifier l'absence de cassure sur la coiffe dans l'aspect", hasMinMax: false },
  { n: 21, probleme: null, desc: "Vérifier l'absence des fronces et des points sautés", hasMinMax: false },
  { n: 22, probleme: null, desc: "DAV : Vérifier la correspondance entre l'étiquette de traçabilité de la coiffe et l'étiquette de l'airbag", hasMinMax: false },
  { n: 23, probleme: null, desc: 'DAV : Vérifier que le Talon de couture (assemblage airbag) : 10mm (+/-1,5)', min: 8.5, max: 11.5 },
  { n: 24, probleme: null, desc: 'DAV : Mesurer longueur de 10 points (assemblage airbag) : 5mm (+/-0,5)', min: 4.5, max: 5.5 },
  { n: 25, probleme: null, desc: 'DAV OPTION : Vérifier que le Talon de couture (assemblage profil) : 10mm (+/-1,5)', min: 8.5, max: 10.5 },
  { n: 26, probleme: null, desc: 'DAV YOU/PLUS/MAX : Vérifier que le Talon de couture (zip invisible) : 8mm (+/-1,5)', min: 6.5, max: 9.5 },
  { n: 27, probleme: null, desc: 'DAV YOU/PLUS/MAX : Vérifier que le Talon de couture (assemblage profil) : 5mm (+/-1)', min: 4, max: 6 },
  { n: 28, probleme: null, desc: 'DAV YOU/PLUS/MAX : Vérifier que le Talon de couture (assemblage profil sur mouquette) : 5mm (+/-1,5)', min: 3.5, max: 6.5 },
  { n: 29, probleme: null, desc: 'DAV : Mesurer longueur de 10 points (assemblage profil) : 4mm (+1; -0,5)', min: 3, max: 4.5 },
  { n: 30, probleme: null, desc: 'DAV : Vérifier que le Talon de couture (assemblage fermeture) : 8mm (+/-1)', min: 7, max: 9 },
  { n: 31, probleme: null, desc: 'DAV : longueur de 10 points (assemblage fermeture) : 4mm (+1; -0,5)', min: 3, max: 4.5 },
  { n: 32, probleme: null, desc: 'DAV : Vérifier que le Talon de couture (fermeture poche ARB) : 12-20mm (+/-1.5)', min: '10.5-18.5', max: '13.5-21.5', isRange: true },
  { n: 33, probleme: null, desc: 'DAV : longueur de 10 points (fermeture poche ARB) : 4mm (+1; -0,5)', min: 3, max: 4.5 },
  { n: 34, probleme: null, desc: 'DAV : Contrôler le glaçage de poche AIRABG (début de couture à 3 cm environ la poche et fin de couture à la fin de pièce)', hasMinMax: false },
  { n: 35, probleme: null, desc: 'CAV : Vérifier que le Talon de couture (assemblage profil 6w + profil sur fleece 8w) : 10mm (+/-1,5)', min: 8.5, max: 11.5 },
  { n: 36, probleme: null, desc: 'CAV : Vérifier que le Talon de couture profil 8w + mouquette : 5mm (+/-1)', min: 4, max: 6 },
  { n: 37, probleme: null, desc: 'CAV : longueur de 10 points (ASS profil) : 4mm (+1; -0,5)', min: 3, max: 4.5 },
  { n: 38, probleme: null, desc: 'CAV : Vérifier que le Talon de couture (fermeture polybonde) : 8±1,5', min: 6.5, max: 11.5 },
  { n: 39, probleme: null, desc: 'CAV 8W : Vérifier que le Talon de couture (Assemblage élastique) : 10mm (+/-1,5)', min: 8.5, max: 11.5 },
  { n: 40, probleme: null, desc: 'CAV : Mesurer longueur de 10 points (fermeture polybonde/ASS élastique) : 4mm (+1; -0,5)', min: 3, max: 4.5 },
  { n: 41, probleme: 'Pts relatif à la dernière réclamation (2 derniers mois)', desc: '', hasMinMax: false },
  { n: 42, probleme: null, desc: '', hasMinMax: false },
  { n: 43, probleme: null, desc: '', hasMinMax: false },
  { n: 44, probleme: null, desc: '', hasMinMax: false },
]

function initPoints() {
  return BASE_POINTS.map(p => ({ ...p, values: ['', '', '', '', ''], resultat: null }))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function evalPoint(point, values) {
  const { min, max, hasMinMax, isRange } = point
  if (hasMinMax === false && min == null && max == null) {
    const filled = values.filter(v => v && v.trim() !== '')
    if (filled.length === 0) return null
    return filled.every(v => /^ok$/i.test(v.trim())) ? 'OK' : 'NOK'
  }
  if (isRange) return null
  const nums = values.map(v => parseFloat(v)).filter(v => !isNaN(v))
  if (nums.length === 0) return null
  const inRange = nums.every(v => {
    if (min != null && max != null) return v >= min && v <= max
    if (max != null) return v <= max
    if (min != null) return v >= min
    return true
  })
  return inRange ? 'OK' : 'NOK'
}

function calcGlobal(points) {
  const evaluated = points.filter(p => p.resultat !== null)
  if (evaluated.length === 0) return null
  return evaluated.some(p => p.resultat === 'NOK') ? 'NOK' : 'OK'
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 9999, minWidth: 300,
      padding: '13px 18px', borderRadius: 12, fontSize: 13, fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,.15)',
      ...(type === 'success'
        ? { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }
        : { background: '#fff5f5', color: '#991b1b', border: '1px solid #fecaca' })
    }}>
      <span>{type === 'success' ? '✓' : '✕'}</span>
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
    </div>
  )
}

// ─── Poste autocomplete ───────────────────────────────────────────────────────

function PosteAutocomplete({ postes, value, onChange }) {
  const [q, setQ]       = useState(value || '')
  const [open, setOpen] = useState(false)

  const filtered = q.length > 0
    ? postes.filter(p => {
        const code = (p.CODE || p.code || '').toLowerCase()
        const nom  = (p.NOM  || p.nom  || '').toLowerCase()
        const qLow = q.toLowerCase()
        return code.includes(qLow) || nom.includes(qLow)
      })
    : postes

  const select = (p) => {
    const label = (p.CODE || p.code) ? `${p.CODE || p.code} - ${p.NOM || p.nom}` : (p.NOM || p.nom)
    setQ(label); onChange(label); setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={q}
        className="form-input"
        onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Code ou nom du poste…"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.10)', maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.slice(0, 20).map((p, i) => {
            const code = p.CODE || p.code
            const nom  = p.NOM  || p.nom
            return (
              <div key={i} onMouseDown={() => select(p)} style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                display: 'flex', gap: 8, alignItems: 'center',
                borderBottom: '1px solid #f8fafc',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                {code && (
                  <span style={{
                    background: '#f0fdf4', color: '#166534', borderRadius: 5,
                    padding: '1px 7px', fontWeight: 700,
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 11, flexShrink: 0,
                  }}>{code}</span>
                )}
                <span>{nom}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Form component ───────────────────────────────────────────────────────────

function AuditForm({ audit, postes, projects, onSave, onCancel }) {
  const todayStr = new Date().toISOString().slice(0, 10)

  const [header, setHeader] = useState({
    projet:        audit?.PROJET        || '',
    semaine:       audit?.SEMAINE       || '',
    dateAudit:     audit?.DATE_AUDIT    || todayStr,
    auditeur:      audit?.AUDITEUR      || '',
    pn:            audit?.PN            || '',
    dr:            audit?.DR            || '',
    produitAudite: audit?.PRODUIT_AUDITE || '',
    objet:         audit?.OBJET         || 'audit_planifie',
  })

  const [points, setPoints] = useState(() => {
    if (audit?.FORM_DATA) {
      try { return JSON.parse(audit.FORM_DATA) } catch { return initPoints() }
    }
    return initPoints()
  })

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const setVal = (idx, coiffeIdx, val) => {
    setPoints(pts => pts.map((p, i) => {
      if (i !== idx) return p
      const newVals = [...p.values]
      newVals[coiffeIdx] = val
      return { ...p, values: newVals, resultat: evalPoint(p, newVals) }
    }))
  }

  const setPointResultat = (idx, res) => {
    setPoints(pts => pts.map((p, i) => i === idx ? { ...p, resultat: res } : p))
  }

  const global = calcGlobal(points)

  const handleSave = async () => {
    if (!header.projet)    { setError('Le projet est requis'); return }
    if (!header.dateAudit) { setError('La date est requise'); return }
    setSaving(true); setError('')
    try {
      await onSave({ ...header, formData: JSON.stringify(points), resultat: global || 'EN_COURS' })
    } catch (e) {
      setError(e?.message || "Erreur lors de l'enregistrement")
    } finally { setSaving(false) }
  }

  const nokPoints = points.filter(p => p.resultat === 'NOK')
  const okCount   = points.filter(p => p.resultat === 'OK').length
  const totalEval = points.filter(p => p.resultat !== null).length

  const resultStyle = global === 'OK'
    ? { background: '#ecfdf5', color: '#059669', border: '1.5px solid #a7f3d0' }
    : global === 'NOK'
      ? { background: '#fee2e2', color: '#c92a2a', border: '1.5px solid #fca5a5' }
      : { background: '#f8fafc', color: '#64748b', border: '1.5px solid #e2e8f0' }

  const cellInput = {
    width: 56, padding: '3px 5px', borderRadius: 6,
    border: '1px solid #e2e8f0', fontSize: 11,
    fontFamily: 'JetBrains Mono, monospace',
    textAlign: 'center', background: '#f8fafc', outline: 'none',
  }
  const cellSelect = {
    width: 62, padding: '3px 4px', borderRadius: 6,
    border: '1px solid #e2e8f0', fontSize: 11,
    background: '#f8fafc', outline: 'none',
  }

  return (
    <div style={{ paddingBottom: 48 }}>

      {/* ── Header info card ── */}
      <div className="table-container" style={{ marginBottom: 20 }}>
        <div className="table-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>📋</span>
            <div>
              <div className="table-title">Informations générales</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>En-tête du formulaire d'audit</div>
            </div>
          </div>
          <div style={{
            ...resultStyle,
            padding: '8px 20px', borderRadius: 9,
            fontWeight: 700, fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <span style={{ fontSize: 16 }}>{global === 'OK' ? '✓' : global === 'NOK' ? '✕' : '—'}</span>
            Résultat global : {global || 'En cours'}
          </div>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div className="form-grid">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label label-required">Projet</label>
              <select className="form-input" value={header.projet} onChange={e => setHeader(h => ({ ...h, projet: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {projects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Semaine</label>
              <input className="form-input" value={header.semaine} onChange={e => setHeader(h => ({ ...h, semaine: e.target.value }))} placeholder="Ex: S15" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label label-required">Date d'audit</label>
              <input type="date" className="form-input" value={header.dateAudit} onChange={e => setHeader(h => ({ ...h, dateAudit: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Auditeur(s)</label>
              <input className="form-input" value={header.auditeur} onChange={e => setHeader(h => ({ ...h, auditeur: e.target.value }))} placeholder="Nom(s) de l'auditeur" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">PN</label>
              <input className="form-input" value={header.pn} onChange={e => setHeader(h => ({ ...h, pn: e.target.value }))} placeholder="Part Number" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">DR</label>
              <input className="form-input" value={header.dr} onChange={e => setHeader(h => ({ ...h, dr: e.target.value }))} placeholder="DR number" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Produit audité</label>
              <input className="form-input" value={header.produitAudite} onChange={e => setHeader(h => ({ ...h, produitAudite: e.target.value }))} placeholder="Description du produit" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Objet de l'audit</label>
              <select className="form-input" value={header.objet} onChange={e => setHeader(h => ({ ...h, objet: e.target.value }))}>
                <option value="reclamation_client">Réclamation client</option>
                <option value="audit_planifie">Audit planifié</option>
                <option value="nouvelle_modif">Nouvelle modification produit/Process</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI mini stats ── */}
      {totalEval > 0 && (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
          <div className="stat-card stat-total">
            <div className="stat-header"><div className="stat-title">Points évalués</div></div>
            <div className="stat-value" style={{ fontSize: 30, letterSpacing: -1 }}>{totalEval}</div>
          </div>
          <div className="stat-card stat-returned">
            <div className="stat-header"><div className="stat-title">Points OK</div></div>
            <div className="stat-value" style={{ fontSize: 30, letterSpacing: -1 }}>{okCount}</div>
          </div>
          <div className="stat-card stat-not-returned">
            <div className="stat-header"><div className="stat-title">Points NOK</div></div>
            <div className="stat-value" style={{ fontSize: 30, letterSpacing: -1 }}>{nokPoints.length}</div>
          </div>
          <div className="stat-card stat-defects">
            <div className="stat-header"><div className="stat-title">Conformité</div></div>
            <div className="stat-value" style={{ fontSize: 30, letterSpacing: -1 }}>
              {totalEval > 0 ? Math.round(okCount / totalEval * 100) : 0}%
            </div>
          </div>
        </div>
      )}

      {/* ── Control points table ── */}
      <div className="table-container" style={{ marginBottom: 20 }}>
        <div className="table-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🔍</span>
            <div>
              <div className="table-title">Points de contrôle</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{points.length} points — SAGE-FOR-QUA-25</div>
            </div>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: 90 }}>Poste</th>
                <th style={{ width: 36 }}>N°</th>
                <th style={{ minWidth: 250, textAlign: 'left' }}>Points à vérifier</th>
                <th style={{ width: 50 }}>Min</th>
                <th style={{ width: 50 }}>Max</th>
                <th style={{ width: 66 }}>Coiffe 1</th>
                <th style={{ width: 66 }}>Coiffe 2</th>
                <th style={{ width: 66 }}>Coiffe 3</th>
                <th style={{ width: 66 }}>Coiffe 4</th>
                <th style={{ width: 66 }}>Coiffe 5</th>
                <th style={{ width: 76 }}>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, idx) => {
                const isNok    = p.resultat === 'NOK'
                const isOk     = p.resultat === 'OK'
                const isManual = p.hasMinMax === false && p.min == null && p.max == null
                return (
                  <tr key={idx} style={isNok ? { background: '#fff5f5' } : isOk ? { background: '#f0fdf4' } : {}}>
                    <td style={{ textAlign: 'left', color: '#166534', fontWeight: 600, fontSize: 10.5, lineHeight: 1.4, whiteSpace: 'normal' }}>
                      {p.probleme}
                    </td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#94a3b8', fontSize: 11 }}>{p.n}</td>
                    <td style={{ textAlign: 'left', lineHeight: 1.5, color: '#0f172a', whiteSpace: 'normal', fontSize: 11.5 }}>{p.desc}</td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#64748b' }}>
                      {p.isRange ? p.min : (p.min != null ? p.min : '')}
                    </td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#64748b' }}>
                      {p.isRange ? p.max : (p.max != null ? p.max : '')}
                    </td>
                    {[0, 1, 2, 3, 4].map(ci => (
                      <td key={ci}>
                        {isManual ? (
                          <select
                            value={p.values[ci]}
                            onChange={e => setVal(idx, ci, e.target.value)}
                            style={{
                              ...cellSelect,
                              background: p.values[ci] === 'OK' ? '#ecfdf5' : p.values[ci] === 'NOK' ? '#fee2e2' : '#f8fafc',
                            }}
                          >
                            <option value="">—</option>
                            <option value="OK">OK</option>
                            <option value="NOK">NOK</option>
                            <option value="NA">N/A</option>
                          </select>
                        ) : (
                          <input
                            type="number" step="0.1"
                            value={p.values[ci]}
                            onChange={e => setVal(idx, ci, e.target.value)}
                            style={cellInput}
                            placeholder="—"
                          />
                        )}
                      </td>
                    ))}
                    <td>
                      {p.isRange ? (
                        <select
                          value={p.resultat || ''}
                          onChange={e => setPointResultat(idx, e.target.value || null)}
                          style={{
                            ...cellSelect, width: 68, fontWeight: 700,
                            background: p.resultat === 'OK' ? '#ecfdf5' : p.resultat === 'NOK' ? '#fee2e2' : '#f8fafc',
                            color: p.resultat === 'OK' ? '#059669' : p.resultat === 'NOK' ? '#c92a2a' : 'inherit',
                          }}
                        >
                          <option value="">—</option>
                          <option value="OK">OK</option>
                          <option value="NOK">NOK</option>
                        </select>
                      ) : (
                        <span
                          className={`status-badge ${isOk ? 'status-returned' : isNok ? 'status-not-returned' : ''}`}
                          style={!isOk && !isNok ? { background: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0' } : {}}
                        >
                          {p.resultat || '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── NOK actions table ── */}
      {nokPoints.length > 0 && (
        <div className="table-container" style={{ marginBottom: 20, border: '1.5px solid #fca5a5' }}>
          <div className="table-header" style={{ background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
              <span style={{ fontSize: 18 }}>⚠</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Points NOK — Actions correctives</div>
                <div style={{ fontSize: 11, opacity: .8, marginTop: 2 }}>{nokPoints.length} point{nokPoints.length > 1 ? 's' : ''} à corriger</div>
              </div>
            </div>
            <span style={{ background: 'rgba(255,255,255,.2)', color: '#fff', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
              {nokPoints.length}
            </span>
          </div>
          <div className="table-wrapper">
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', minWidth: 200 }}>N° Point NOK</th>
                  <th style={{ textAlign: 'left', minWidth: 220 }}>Action corrective</th>
                  <th style={{ width: 120 }}>Responsable</th>
                  <th style={{ width: 140 }}>Délai</th>
                  <th style={{ width: 120 }}>Vérification</th>
                </tr>
              </thead>
              <tbody>
                {nokPoints.map(p => (
                  <tr key={p.n} style={{ background: '#fff8f8' }}>
                    <td style={{ textAlign: 'left' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#c92a2a', fontSize: 12 }}>#{p.n}</span>
                      {' '}
                      <span style={{ color: '#64748b', fontSize: 11 }}>{p.desc.slice(0, 50)}{p.desc.length > 50 ? '…' : ''}</span>
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <input className="form-input" style={{ padding: '5px 8px', fontSize: 12, border: '1px solid #fca5a5' }} placeholder="Action corrective…" />
                    </td>
                    <td>
                      <input className="form-input" style={{ padding: '5px 8px', fontSize: 12, border: '1px solid #fca5a5' }} placeholder="Resp." />
                    </td>
                    <td>
                      <input type="date" className="form-input" style={{ padding: '5px 8px', fontSize: 12, border: '1px solid #fca5a5' }} />
                    </td>
                    <td>
                      <input className="form-input" style={{ padding: '5px 8px', fontSize: 12, border: '1px solid #fca5a5' }} placeholder="Vérif." />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⚠</span> {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving
            ? <><span className="loading-spinner" /> Enregistrement…</>
            : <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Enregistrer & Soumettre
              </>
          }
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  )
}

// ─── Export to Excel ──────────────────────────────────────────────────────────

function exportAuditExcel(audit, points) {
  const wb = XLSX.utils.book_new()
  const headerRows = [
    ['Check List Audit Produit', '', '', '', '', '', '', '', '', '', 'SAGE-FOR-QUA-25'],
    ["Projet :", audit.PROJET || '', '', '', 'Semaine :', audit.SEMAINE || '', '', "Date d'audit :", audit.DATE_AUDIT || '', '', ''],
    ['Produit audité :', audit.PRODUIT_AUDITE || '', '', '', '', '', '', 'Auditeur(s) :', audit.AUDITEUR || '', '', ''],
    ['PN :', audit.PN || '', '', '', '', '', '', '', 'Objet :', audit.OBJET || '', '', ''],
    ['DR :', audit.DR || '', '', '', '', '', '', '', '', '', '', ''],
    [],
    ['Poste', 'N°', 'Points à vérifier', 'Min', 'Max', 'Coiffe 1', 'Coiffe 2', 'Coiffe 3', 'Coiffe 4', 'Coiffe 5', 'Résultat'],
  ]
  const dataRows = points.map(p => [
    p.probleme || '', p.n, p.desc,
    p.min != null ? p.min : '', p.max != null ? p.max : '',
    p.values[0], p.values[1], p.values[2], p.values[3], p.values[4],
    p.resultat || '',
  ])
  const allRows = [
    ...headerRows, ...dataRows,
    [], ['', '', '', '', '', '', '', '', '', '', `Résultat global : ${calcGlobal(points) || '—'}`],
  ]
  const ws = XLSX.utils.aoa_to_sheet(allRows)
  XLSX.utils.book_append_sheet(wb, ws, 'Audit Produit')
  XLSX.writeFile(wb, `Audit_Produit_${audit.PROJET || 'export'}_${audit.DATE_AUDIT || new Date().toISOString().slice(0, 10)}.xlsx`)
  reportClientExport('audit-produit')
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AuditProduit() {
  const { id: urlId } = useParams()
  const navigate = useNavigate()
  const { user, can } = useAuth()

  const [view, setView]             = useState(urlId ? 'form' : 'list')
  const [editingId, setEditingId]   = useState(urlId ? Number(urlId) : null)
  const [editingAudit, setEditingAudit] = useState(null)

  const [audits, setAudits]         = useState([])
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, totalRecords: 0 })
  const [loading, setLoading]       = useState(false)
  const [projects, setProjects]     = useState([])
  const [postes, setPostes]         = useState([])
  const [filters, setFilters]       = useState({ projet: '', dateFrom: '', dateTo: '', resultat: '', status: '' })
  const [toast, setToast]           = useState(null)

  const showToast = (msg, type = 'success') => setToast({ msg, type })

  const canWrite  = can('audit_produit', 'write')
  const canVerify = user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'superviseur'

  useEffect(() => {
    auditProduitApi.projets().then(d => setProjects(Array.isArray(d) ? d : []))
    postesApi.getAll().then(d => setPostes(Array.isArray(d) ? d : []))
  }, [])

  const loadAudits = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const data = await auditProduitApi.list({ ...filters, page, limit: 10 })
      setAudits(Array.isArray(data?.audits) ? data.audits : [])
      if (data?.pagination) setPagination(data.pagination)
    } catch { setAudits([]) }
    finally { setLoading(false) }
  }, [filters])

  useEffect(() => { if (view === 'list') loadAudits() }, [loadAudits, view])

  useEffect(() => {
    if (urlId) {
      auditProduitApi.getOne(urlId).then(data => { setEditingAudit(data); setView('form') }).catch(() => {})
    }
  }, [urlId])

  const openNew  = () => { setEditingId(null); setEditingAudit(null); setView('form') }
  const openEdit = async (row) => {
    try {
      const data = await auditProduitApi.getOne(row.ID)
      setEditingAudit(data); setEditingId(row.ID); setView('form')
    } catch { showToast("Impossible de charger l'audit", 'error') }
  }
  const handleBack = () => { setView('list'); setEditingId(null); setEditingAudit(null); navigate('/audit-produit') }

  const handleSave = async (body) => {
    if (editingId) {
      await auditProduitApi.update(editingId, body)
      showToast('Audit mis à jour et resoumis')
    } else {
      await auditProduitApi.create(body)
      showToast('Audit créé et notifications envoyées')
    }
    handleBack()
  }

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cet audit ?')) return
    try { await auditProduitApi.remove(id); loadAudits(); showToast('Audit supprimé') }
    catch { showToast('Erreur lors de la suppression', 'error') }
  }

  const handleVerify = async (id, status) => {
    const comment = status === 'REJECTED' ? prompt('Motif du rejet :') : ''
    if (status === 'REJECTED' && comment === null) return
    try {
      await auditProduitApi.verify(id, { status, comment: comment || '' })
      showToast(status === 'VALIDATED' ? 'Audit validé ✓' : 'Audit rejeté')
      loadAudits()
    } catch { showToast('Erreur', 'error') }
  }

  const handleExport = async (row) => {
    try {
      const data = await auditProduitApi.getOne(row.ID)
      let pts = initPoints()
      if (data.FORM_DATA) { try { pts = JSON.parse(data.FORM_DATA) } catch {} }
      exportAuditExcel(data, pts)
    } catch { showToast("Erreur lors de l'export", 'error') }
  }

  const statusBadge = (s) => {
    if (s === 'VALIDATED') return { cls: 'status-returned',     label: 'Validé' }
    if (s === 'REJECTED')  return { cls: 'status-not-returned', label: 'Rejeté' }
    return { cls: 'status-scrap', label: 'En attente' }
  }
  const resultatBadgeClass = (r) => {
    if (r === 'OK')  return 'status-returned'
    if (r === 'NOK') return 'status-not-returned'
    return ''
  }

  // ── Form view ──────────────────────────────────────────────────────────────

  if (view === 'form') {
    return (
      <div className="content">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <button
              onClick={handleBack}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10, padding: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              Retour à la liste
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="header-accent-bar" />
              <div className="header-title-group">
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {editingId ? "Modifier l'audit produit" : "Nouveau formulaire d'audit"}
                </h2>
                <span className="header-subtitle">Check List Audit Produit — SAGE-FOR-QUA-25</span>
              </div>
            </div>
          </div>
        </div>

        <AuditForm
          audit={editingAudit}
          postes={postes}
          projects={projects}
          onSave={handleSave}
          onCancel={handleBack}
        />
        {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────

  return (
    <div className="content">

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="header-accent-bar" />
          <div className="header-title-group">
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>Audits produit</h2>
            <span className="header-subtitle">Check List Audit Produit — SAGE-FOR-QUA-25</span>
          </div>
        </div>
        {canWrite && (
          <button className="add-btn" onClick={openNew}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nouveau formulaire
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="table-container" style={{ marginBottom: 16 }}>
        <div className="table-header" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="filters" style={{ flex: 1, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.8px', whiteSpace: 'nowrap' }}>
              Filtres
            </span>
            <select className="filter-select" style={{ width: 150 }} value={filters.projet} onChange={e => setFilters(f => ({ ...f, projet: e.target.value }))}>
              <option value="">Tous les projets</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input type="date" className="filter-select" style={{ width: 150 }} value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
            <input type="date" className="filter-select" style={{ width: 150 }} value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
            <select className="filter-select" style={{ width: 130 }} value={filters.resultat} onChange={e => setFilters(f => ({ ...f, resultat: e.target.value }))}>
              <option value="">Résultat</option>
              <option value="OK">✓ OK</option>
              <option value="NOK">✕ NOK</option>
            </select>
            <select className="filter-select" style={{ width: 150 }} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">Tous les statuts</option>
              <option value="PENDING">En attente</option>
              <option value="VALIDATED">Validé</option>
              <option value="REJECTED">Rejeté</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="add-btn" style={{ padding: '7px 14px' }} onClick={() => loadAudits()}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Filtrer
            </button>
            <button className="toggle-btn" onClick={() => { setFilters({ projet: '', dateFrom: '', dateTo: '', resultat: '', status: '' }); setTimeout(() => loadAudits(), 0) }}>
              Réinitialiser
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>ID</th>
                    <th style={{ textAlign: 'left' }}>Projet</th>
                    <th>Date audit</th>
                    <th>Auditeur(s)</th>
                    <th style={{ textAlign: 'left' }}>Produit audité</th>
                    <th>Résultat</th>
                    <th>Statut</th>
                    <th style={{ textAlign: 'right', paddingRight: 20 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 0, border: 'none' }}>
                        <div className="empty-state">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                          <p>Aucun audit trouvé</p>
                        </div>
                      </td>
                    </tr>
                  ) : audits.map(row => {
                    const sb = statusBadge(row.STATUS)
                    return (
                      <tr key={row.ID}>
                        <td>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>
                            #{row.ID}
                          </span>
                        </td>
                        <td style={{ textAlign: 'left', fontWeight: 700, color: 'var(--accent)' }}>{row.PROJET}</td>
                        <td style={{ color: '#475569' }}>{row.DATE_AUDIT}</td>
                        <td style={{ color: '#475569' }}>{row.AUDITEUR || '—'}</td>
                        <td style={{ textAlign: 'left', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569' }}>
                          {row.PRODUIT_AUDITE || '—'}
                        </td>
                        <td>
                          <span
                            className={`status-badge ${resultatBadgeClass(row.RESULTAT)}`}
                            style={!row.RESULTAT ? { background: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0' } : {}}
                          >
                            {row.RESULTAT || '—'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${sb.cls}`}>{sb.label}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {canVerify && row.STATUS === 'PENDING' && (
                              <>
                                <button className="action-btn save-btn" onClick={() => handleVerify(row.ID, 'VALIDATED')} title="Valider">✓</button>
                                <button className="action-btn delete-btn" onClick={() => handleVerify(row.ID, 'REJECTED')} title="Rejeter">✕</button>
                              </>
                            )}
                            <button className="action-btn edit-btn" onClick={() => openEdit(row)} title="Modifier">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button
                              className="action-btn"
                              style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}
                              onClick={() => handleExport(row)}
                              title="Exporter Excel"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            </button>
                            {canWrite && (
                              <button className="action-btn delete-btn" onClick={() => handleDelete(row.ID)} title="Supprimer">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
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
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              onPageChange={p => loadAudits(p)}
            />
          </>
        )}
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}