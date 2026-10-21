import { useCallback, useEffect, useMemo, useState } from 'react'
import { erpApi } from '../api/erp.api.js'

const REFRESH_INTERVAL = 30_000

function todayString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Tunis',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`
}

export default function ProductionTempsReel() {
  const [report, setReport] = useState(null)
  const [project, setProject] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const data = await erpApi.getHourlyQualityProduction(todayString())
      setReport(data)
      setError('')
      setUpdatedAt(new Date())
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Impossible de charger les données.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, REFRESH_INTERVAL)
    return () => window.clearInterval(timer)
  }, [refresh])

  const projects = useMemo(
    () => [...new Set((report?.lignes || []).map(row => row.projet))].sort(),
    [report],
  )
  const rows = useMemo(
    () => (report?.lignes || []).filter(row => !project || row.projet === project),
    [project, report],
  )

  const number = value => Number(value || 0).toLocaleString('fr-FR')

  return (
    <section className="dash-content" aria-label="Production horaire en temps réel">
      <style>{`
        .production-live-card { background:#fff; border:1px solid #e8edf5; border-radius:14px; padding:20px 22px; box-shadow:0 1px 3px rgba(0,0,0,.04); }
        .production-live-title { font-size:13.5px; font-weight:700; color:#1e293b; margin-bottom:2px; }
        .production-live-sub { font-size:11px; color:#94a3b8; font-weight:500; }
        .production-live-select { min-width:160px; padding:8px 12px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; color:#334155; font:inherit; }
        .production-live-refresh { padding:8px 14px; border:0; border-radius:8px; background:#166534; color:#fff; font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
        .production-live-refresh:disabled { opacity:.6; cursor:wait; }
        .production-live-table { width:100%; border-collapse:collapse; font-size:13px; }
        .production-live-table th { padding:11px 12px; background:#f8fafc; color:#64748b; text-align:left; white-space:nowrap; border-bottom:1px solid #e8edf5; }
        .production-live-table td { padding:10px 12px; border-bottom:1px solid #f1f5f9; white-space:nowrap; }
        .production-live-table tbody tr:hover { background:#f8fafc; }
        @media(max-width:700px) { .production-live-card { padding:15px 12px; } }
      `}</style>
      <div className="production-live-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="production-live-title">Production horaire en temps réel</div>
            <div className="production-live-sub">
              {report?.date || todayString()} · Production conforme ERP, objectifs et contrôles qualité · Actualisation toutes les 30 secondes
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label htmlFor="production-project" className="dash-filter-label">Projet</label>
            <select
              id="production-project"
              className="production-live-select"
              value={project}
              onChange={event => setProject(event.target.value)}
            >
              <option value="">Tous les projets</option>
              {projects.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <button type="button" className="production-live-refresh" onClick={refresh} disabled={loading}>
              {loading ? 'Chargement…' : 'Actualiser'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: error ? '#b91c1c' : '#64748b' }} role={error ? 'alert' : undefined}>
          {error || (updatedAt
            ? `Dernière actualisation : ${updatedAt.toLocaleTimeString('fr-FR')}`
            : loading ? 'Chargement des données…' : '')}
        </div>

        {error && !report ? null : (
          <div style={{ overflowX: 'auto', marginTop: 16, border: '1px solid #e8edf5', borderRadius: 10 }}>
            <table className="production-live-table" style={{ minWidth: 940 }}>
              <thead>
                <tr>
                  <th>Projet</th>
                  <th>Ligne</th>
                  <th>Heure</th>
                  <th style={{ textAlign: 'right' }}>Target</th>
                  <th style={{ textAlign: 'right' }}>Produit conforme (ERP)</th>
                  <th style={{ textAlign: 'right' }}>Firewall</th>
                  <th style={{ textAlign: 'right' }}>CSL</th>
                  <th style={{ textAlign: 'right' }}>Délibéra</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={`${row.projet}|${row.ligne}|${row.heure}`}>
                    <td>{row.projet}</td>
                    <td>{row.ligne}</td>
                    <td>{formatHour(row.heure)}</td>
                    <td style={{ textAlign: 'right' }}>{number(row.target)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{number(row.produitConforme)}</td>
                    <td style={{ textAlign: 'right' }}>{number(row.firewall)}</td>
                    <td style={{ textAlign: 'right' }}>{number(row.csl)}</td>
                    <td style={{ textAlign: 'right' }}>{number(row.delibera)}</td>
                  </tr>
                ))}
                {!loading && !error && rows.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 28, color: '#94a3b8' }}>Aucune donnée pour aujourd’hui.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
