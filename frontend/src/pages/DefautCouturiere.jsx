import { useCallback, useEffect, useState } from 'react'
import { defautCouturiereApi } from '../api/defautCouturiere.api.js'
import { projectsApi } from '../api/projects.api.js'
import Modal from '../components/Modal.jsx'

const SHIFT_LABELS = { MATIN: 'Matin (06h-14h)', APRES_MIDI: 'Après-midi (14h-22h)' }
const emptyStyle = { textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }

function fmtToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DefautCouturiere() {
  const today = fmtToday()
  const monthAgo = (() => {
    const d = new Date(Date.now() - 29 * 86400000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const [projects, setProjects] = useState([])
  const [projet, setProjet] = useState('')
  const [lignesProjet, setLignesProjet] = useState([])
  const [ligne, setLigne] = useState('')
  const [shift, setShift] = useState('')
  const [date, setDate] = useState(today)
  const [tab, setTab] = useState('tableau')

  const [tableau, setTableau] = useState(null)
  const [alertes, setAlertes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [detailMatricule, setDetailMatricule] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const [dateDebut, setDateDebut] = useState(monthAgo)
  const [dateFin, setDateFin] = useState(today)
  const [rapport, setRapport] = useState(null)
  const [rapportLoading, setRapportLoading] = useState(false)
  const [rapportError, setRapportError] = useState('')
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

  // ── Tableau + alertes : un seul fetch centralisé, déclenché sur TOUT changement de filtre ──
  const loadTableau = useCallback(() => {
    if (!projet) { setTableau(null); setAlertes([]); return }
    setLoading(true); setError('')
    Promise.all([
      defautCouturiereApi.getTableau({ projet, ligne: ligne || undefined, shift: shift || undefined, date }),
      defautCouturiereApi.getAlertes({ projet, ligne: ligne || undefined, date }),
    ]).then(([t, a]) => { setTableau(t); setAlertes(a || []) })
      .catch(e => {
        setTableau(null); setAlertes([])
        setError(e.response?.data?.error || e.response?.data?.message || e.message)
      })
      .finally(() => setLoading(false))
  }, [projet, ligne, shift, date])

  useEffect(() => { loadTableau() }, [loadTableau])

  // ── Rapport : fetch centralisé, déclenché sur tout changement de filtre du rapport ──
  const loadRapport = useCallback(() => {
    if (!projet) { setRapport(null); return }
    setRapportLoading(true); setRapportError('')
    defautCouturiereApi.getRapport({ projet, ligne: ligne || undefined, dateDebut, dateFin })
      .then(setRapport)
      .catch(e => {
        setRapport(null)
        setRapportError(e.response?.data?.error || e.response?.data?.message || e.message)
      })
      .finally(() => setRapportLoading(false))
  }, [projet, ligne, dateDebut, dateFin])

  useEffect(() => { if (tab === 'rapport') loadRapport() }, [tab, loadRapport])

  const openDetail = (matricule) => {
    setDetailMatricule(matricule); setDetail(null); setDetailError(''); setDetailLoading(true)
    defautCouturiereApi.getDetail({ matricule, projet, ligne: ligne || undefined, shift: shift || undefined, date })
      .then(setDetail)
      .catch(e => setDetailError(e.response?.data?.error || e.response?.data?.message || e.message))
      .finally(() => setDetailLoading(false))
  }

  const handleExport = async (kind) => {
    if (!projet) return
    const setter = kind === 'xlsx' ? setExportingXlsx : setExportingPdf
    setter(true)
    try {
      const resp = kind === 'xlsx'
        ? await defautCouturiereApi.exportExcel({ projet, ligne: ligne || undefined, dateDebut, dateFin })
        : await defautCouturiereApi.exportPdf({ projet, ligne: ligne || undefined, dateDebut, dateFin })
      const mime = kind === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'
      const url = URL.createObjectURL(new Blob([resp.data], { type: mime }))
      const a = document.createElement('a')
      a.href = url
      a.download = `rapport_defauts_couturiere_${projet}_${dateDebut}_${dateFin}.${kind}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { alert('Erreur export: ' + e.message) }
    finally { setter(false) }
  }

  const lignesRows = tableau?.lignes || []
  const postes = tableau?.postes || []
  const kpis = rapport?.kpis
  const synthese = rapport?.synthese || []
  const rapportAlertes = rapport?.alertes || []

  const TABS = [
    { id: 'tableau', label: 'Tableau' },
    { id: 'rapport', label: 'Rapport', disabled: !projet },
  ]

  return (
    <>
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar" />
          <div className="header-title-group">
            <h2>Suivi des Défauts par Couturière</h2>
            <span className="header-subtitle">Codes défauts par couturière et par poste, alertes 3 défauts/heure, rapport exportable</span>
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
        {tab === 'tableau' && (
          <>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Shift</label>
              <select className="form-input" style={{ minWidth: 170 }} value={shift} onChange={e => setShift(e.target.value)}>
                <option value="">Toute la journée</option>
                {Object.keys(SHIFT_LABELS).map(s => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Date</label>
              <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </>
        )}
        {tab === 'rapport' && (
          <>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Du</label>
              <input type="date" className="form-input" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Au</label>
              <input type="date" className="form-input" value={dateFin} onChange={e => setDateFin(e.target.value)} />
            </div>
          </>
        )}
        <button className="add-btn" onClick={tab === 'tableau' ? loadTableau : loadRapport} disabled={!projet || loading || rapportLoading} style={{ marginLeft: 'auto' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.92"/></svg>
          {(loading || rapportLoading) ? 'Actualisation…' : 'Actualiser'}
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
        {tab === 'tableau' && (
          <>
            {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

            {!projet && !error && (
              <div style={emptyStyle}>Sélectionnez un projet pour afficher le suivi des défauts par couturière.</div>
            )}

            {projet && alertes.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', marginBottom: 16,
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#b91c1c', fontSize: 13,
              }}>
                <span style={{ fontSize: 18 }}>⚠</span>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    {alertes.length} alerte{alertes.length > 1 ? 's' : ''} — 3 codes défauts atteints dans une même heure calendaire
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {alertes.map(a => (
                      <span key={a.id} style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 8, padding: '4px 10px', fontWeight: 600 }}>
                        {a.nom} ({a.matricule}) — {a.heureDebut?.slice(11, 16)} — {a.nbDefauts} défauts
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {projet && tableau && (
              <div className="table-container">
                <div className="table-header">
                  <h3 className="table-title">
                    {tableau.projet}
                    <span className="badge-count" style={{ marginLeft: 8 }}>{lignesRows.length} couturière{lignesRows.length > 1 ? 's' : ''}</span>
                  </h3>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {tableau.ligne || 'Toutes les lignes'} · {tableau.shift ? SHIFT_LABELS[tableau.shift] : 'Toute la journée'} · {tableau.date}
                  </div>
                </div>
                <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Couturière</th>
                        {postes.map(p => <th key={p} style={{ textAlign: 'right' }}>{p}</th>)}
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignesRows.length === 0 && (
                        <tr><td colSpan={2 + postes.length} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                          {loading ? 'Chargement…' : 'Aucun défaut sur la période sélectionnée'}
                        </td></tr>
                      )}
                      {lignesRows.map(l => (
                        <tr key={l.couturiereId}
                            onClick={() => openDetail(l.matricule)}
                            style={{ cursor: 'pointer', background: l.enAlerte ? '#fef2f2' : undefined }}>
                          <td>
                            <div style={{ fontWeight: 700, color: l.enAlerte ? '#b91c1c' : '#0f172a' }}>{l.nom}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{l.matricule}{l.enAlerte ? ' · en alerte' : ''}</div>
                          </td>
                          {postes.map(p => (
                            <td key={p} style={{ textAlign: 'right' }}>{l.parPoste?.[p] ?? 0}</td>
                          ))}
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{l.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {projet && loading && !tableau && (
              <div className="loading"><div className="spinner" /></div>
            )}
          </>
        )}

        {tab === 'rapport' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {rapportError && <div className="alert alert-error">{rapportError}</div>}

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

            {!kpis && !rapportLoading && <div style={emptyStyle}>Aucune donnée sur la période sélectionnée</div>}

            {kpis && (
              <div className="rp-kpi-grid">
                <div className="rp-kpi-card fw">
                  <div className="rp-kpi-top"><div className="rp-kpi-label">Total codes défauts</div></div>
                  <div className="rp-kpi-value">{kpis.totalDefauts.toLocaleString('fr-FR')}</div>
                </div>
                <div className="rp-kpi-card csl">
                  <div className="rp-kpi-top"><div className="rp-kpi-label">Couturière la + en défaut</div></div>
                  <div className="rp-kpi-value" style={{ fontSize: 16 }}>{kpis.couturierePlusDefauts || '—'}</div>
                  <div className="rp-kpi-period">{kpis.couturierePlusDefauts ? `${kpis.couturierePlusDefautsTotal} codes défauts` : ''}</div>
                </div>
                <div className="rp-kpi-card nret">
                  <div className="rp-kpi-top"><div className="rp-kpi-label">Poste le + problématique</div></div>
                  <div className="rp-kpi-value" style={{ fontSize: 16 }}>{kpis.posteProblematique || '—'}</div>
                  <div className="rp-kpi-period">{kpis.posteProblematique ? `${kpis.posteProblematiqueTotal} codes défauts` : ''}</div>
                </div>
                <div className="rp-kpi-card ret">
                  <div className="rp-kpi-top"><div className="rp-kpi-label">Nombre d'alertes</div></div>
                  <div className="rp-kpi-value">{kpis.nbAlertes.toLocaleString('fr-FR')}</div>
                </div>
              </div>
            )}

            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">Synthèse par couturière<span className="badge-count" style={{ marginLeft: 8 }}>{synthese.length}</span></h3>
              </div>
              <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Matricule</th><th>Nom</th><th style={{ textAlign: 'right' }}>Total codes défauts</th></tr></thead>
                  <tbody>
                    {synthese.length === 0 && (
                      <tr><td colSpan={3} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                        {rapportLoading ? 'Chargement…' : 'Aucune donnée sur la période'}
                      </td></tr>
                    )}
                    {synthese.map(s => (
                      <tr key={s.couturiereId}>
                        <td>{s.matricule}</td>
                        <td style={{ fontWeight: 700 }}>{s.nom}</td>
                        <td style={{ textAlign: 'right' }}>{s.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">Alertes — 3 codes défauts / heure calendaire<span className="badge-count" style={{ marginLeft: 8 }}>{rapportAlertes.length}</span></h3>
                <div style={{ fontSize: 12, color: '#64748b' }}>Triées par criticité (nombre de défauts décroissant)</div>
              </div>
              <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Matricule</th><th>Nom</th><th>Ligne</th><th>Shift</th><th>Heure</th><th style={{ textAlign: 'right' }}>Nb défauts</th></tr></thead>
                  <tbody>
                    {rapportAlertes.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                        {rapportLoading ? 'Chargement…' : 'Aucune alerte détectée sur la période'}
                      </td></tr>
                    )}
                    {rapportAlertes.map(a => (
                      <tr key={a.id}>
                        <td>{a.matricule}</td>
                        <td style={{ fontWeight: 700 }}>{a.nom}</td>
                        <td>{a.ligne}</td>
                        <td>{a.shift ? SHIFT_LABELS[a.shift] || a.shift : '—'}</td>
                        <td>{a.heureDebut}</td>
                        <td style={{ textAlign: 'right', color: '#b91c1c', fontWeight: 700 }}>{a.nbDefauts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Détail couturière ─────────────────────────────────────────────── */}
      {detailMatricule && (
        <Modal title={detail ? `${detail.nom} (${detail.matricule})` : 'Détail couturière'} onClose={() => setDetailMatricule(null)} maxWidth={640}>
          {detailError && <div className="alert alert-error">{detailError}</div>}
          {detailLoading && <div className="loading"><div className="spinner" /></div>}
          {detail && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {detail.projet} · {detail.ligne || 'Toutes les lignes'} · {detail.shift ? SHIFT_LABELS[detail.shift] : 'Toute la journée'} · {detail.date}
                <span style={{ marginLeft: 10, fontWeight: 700, color: '#0f172a' }}>Total: {detail.total}</span>
              </div>
              {detail.postes.length === 0 && <div style={emptyStyle}>Aucun défaut sur la période sélectionnée</div>}
              {detail.postes.map(p => (
                <div key={p.posteNom} style={{ border: '1px solid #e8ecf5', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: '#f8fafc', padding: '8px 14px', fontWeight: 700, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{p.posteNom}</span>
                    <span style={{ color: '#64748b' }}>{p.total} défaut{p.total > 1 ? 's' : ''}</span>
                  </div>
                  <table className="data-table" style={{ margin: 0 }}>
                    <thead><tr><th>Heure</th><th>Code</th><th>Description</th><th>Vérifié</th></tr></thead>
                    <tbody>
                      {p.defauts.map(d => (
                        <tr key={d.defautId}>
                          <td>{d.heure?.slice(11, 19)}</td>
                          <td style={{ fontWeight: 700 }}>{d.codeDefaut}</td>
                          <td>{d.descDefaut}</td>
                          <td>{d.verifie ? '✓' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      <style>{`
        .rp-tabs{display:flex;border-bottom:2px solid #e8ecf5;gap:2px}
        .rp-tab{display:inline-flex;align-items:center;gap:7px;padding:12px 20px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#64748b;border-bottom:2.5px solid transparent;margin-bottom:-2px;transition:color .15s,border-color .15s,background .15s;border-radius:10px 10px 0 0}
        .rp-tab:hover:not(:disabled){color:#15803d;background:rgba(21,128,61,.04)}
        .rp-tab.active{color:#15803d;border-bottom-color:#15803d;background:rgba(21,128,61,.05)}
        .rp-tab:disabled{opacity:.4;cursor:not-allowed}

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
