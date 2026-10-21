import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { deliberaApi } from '../api/delibera.api.js'
import { projectsApi } from '../api/projects.api.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import './DeliberaDashboard.css'

function localDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function localHour() {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Tunis', hour: '2-digit', hourCycle: 'h23',
  }).format(new Date()))
}

function formatHour(hour) {
  return `${String(Number(hour)).padStart(2, '0')}:00`
}

export default function DeliberaDashboard() {
  const { can } = useAuth()
  const canWrite = can('delibera', 'write')
  const [date, setDate] = useState(localDate)
  const [rows, setRows] = useState([])
  const [projects, setProjects] = useState([])
  const [project, setProject] = useState('')
  const [line, setLine] = useState('')
  const [hour, setHour] = useState(String(localHour()))
  const [target, setTarget] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [fullScreen, setFullScreen] = useState(Boolean(document.fullscreenElement))

  const loadRows = useCallback(async () => {
    try {
      const result = await deliberaApi.getHourlyDashboard(date)
      setRows(result?.rows || [])
      setError('')
      setUpdatedAt(new Date())
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Impossible de charger le tableau horaire')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    setLoading(true)
    loadRows()
    const timer = window.setInterval(loadRows, 30000)
    return () => window.clearInterval(timer)
  }, [loadRows])

  useEffect(() => {
    projectsApi.getProjects()
      .then(result => setProjects(result?.projects || []))
      .catch(err => setError(err?.response?.data?.error || err.message || 'Impossible de charger les projets'))
  }, [])

  useEffect(() => {
    const updateFullScreen = () => setFullScreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', updateFullScreen)
    return () => document.removeEventListener('fullscreenchange', updateFullScreen)
  }, [])

  const sortedRows = useMemo(() => [...rows].sort((a, b) =>
    String(a.PROJET).localeCompare(String(b.PROJET)) ||
    String(a.LIGNE).localeCompare(String(b.LIGNE)) ||
    Number(a.HEURE) - Number(b.HEURE)), [rows])
  const totals = useMemo(() => rows.reduce((result, row) => ({
    ok: result.ok + (Number(row.OK) || 0),
    nok: result.nok + (Number(row.NOK) || 0),
    target: result.target + (Number(row.TARGET) || 0),
  }), { ok: 0, nok: 0, target: 0 }), [rows])

  const saveTarget = async (event) => {
    event.preventDefault()
    if (!project.trim() || !line.trim() || target === '') {
      setError('Projet, ligne et target sont obligatoires.')
      return
    }
    const quantity = Number(target)
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError('Le target doit être un nombre entier positif ou nul.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await deliberaApi.saveHourlyTarget({
        date,
        projet: project.trim(),
        ligne: line.trim(),
        heure: Number(hour),
        target: quantity,
      })
      setTarget('')
      await loadRows()
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Impossible d’enregistrer le target')
    } finally {
      setSaving(false)
    }
  }

  const toggleFullScreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.querySelector('.delibera-tv').requestFullscreen()
    } catch (err) {
      setError(err.message || 'Le mode plein écran n’est pas disponible sur cet appareil.')
    }
  }

  return (
    <main className="delibera-tv">
      <header className="delibera-tv__header">
        <div>
          <p className="delibera-tv__eyebrow">PRODUCTION EN DIRECT</p>
          <h1>Délibéra — suivi horaire</h1>
          <p className="delibera-tv__updated">
            Actualisation automatique toutes les 30 secondes
            {updatedAt && ` · Mis à jour à ${updatedAt.toLocaleTimeString('fr-FR')}`}
          </p>
        </div>
        <div className="delibera-tv__toolbar">
          <label>
            Date
            <input type="date" value={date} onChange={event => setDate(event.target.value)} />
          </label>
          <button type="button" className="delibera-tv__button delibera-tv__button--secondary" onClick={loadRows}>
            Actualiser
          </button>
          <button type="button" className="delibera-tv__button" onClick={toggleFullScreen}>
            {fullScreen ? 'Quitter plein écran' : 'Plein écran'}
          </button>
        </div>
      </header>

      {error && <div className="delibera-tv__error" role="alert">{error}</div>}

      <div className="delibera-tv__layout">
        <section className="delibera-tv__table-wrap" aria-label="Production Délibéra par heure">
          <table className="delibera-tv__table">
            <thead>
              <tr>
                <th>Heure</th>
                <th>Projet</th>
                <th>Ligne</th>
                <th>Target</th>
                <th>OK</th>
                <th>NOK</th>
              </tr>
            </thead>
            <tbody>
              {loading && sortedRows.length === 0 ? (
                <tr><td colSpan="6" className="delibera-tv__empty">Chargement des données…</td></tr>
              ) : sortedRows.length === 0 ? (
                <tr><td colSpan="6" className="delibera-tv__empty">Aucune production ni target pour cette date.</td></tr>
              ) : sortedRows.map(row => (
                <tr key={`${row.PROJET}-${row.LIGNE}-${row.HEURE}`}>
                  <td className="delibera-tv__hour">{formatHour(row.HEURE)}</td>
                  <td>{row.PROJET}</td>
                  <td>{row.LIGNE}</td>
                  <td className="delibera-tv__number delibera-tv__target">{Number(row.TARGET) || 0}</td>
                  <td className="delibera-tv__number delibera-tv__ok">{Number(row.OK) || 0}</td>
                  <td className="delibera-tv__number delibera-tv__nok">{Number(row.NOK) || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="delibera-tv__summary">
          <div className="delibera-tv__summary-heading">
            <span>RÉSUMÉ DU JOUR</span>
            <strong>Délibéra</strong>
          </div>
          <div className="delibera-tv__metrics">
            <article className="delibera-tv__metric delibera-tv__metric--target">
              <span>TARGET</span>
              <strong>{totals.target}</strong>
            </article>
            <article className="delibera-tv__metric delibera-tv__metric--ok">
              <span>OK</span>
              <strong>{totals.ok}</strong>
            </article>
            <article className="delibera-tv__metric delibera-tv__metric--nok">
              <span>NOK</span>
              <strong>{totals.nok}</strong>
            </article>
          </div>

          {canWrite && (
            <form className="delibera-tv__target-form" onSubmit={saveTarget}>
              <strong>Ajouter un target</strong>
              <label>
                Projet
                <input
                  list="delibera-tv-projects"
                  value={project}
                  onChange={event => setProject(event.target.value)}
                  placeholder="Choisir ou saisir"
                  required
                />
                <datalist id="delibera-tv-projects">
                  {projects.map(item => {
                    const name = typeof item === 'string' ? item : item.name || item.nom || item.projet
                    return name ? <option key={name} value={name} /> : null
                  })}
                </datalist>
              </label>
              <label>
                Ligne
                <input value={line} onChange={event => setLine(event.target.value)} placeholder="Ex. LIGNE 1" required />
              </label>
              <div className="delibera-tv__form-row">
                <label>
                  Heure
                  <select value={hour} onChange={event => setHour(event.target.value)}>
                    {Array.from({ length: 24 }, (_, index) => (
                      <option key={index} value={index}>{formatHour(index)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Target
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={target}
                    onChange={event => setTarget(event.target.value)}
                    placeholder="Quantité"
                    required
                  />
                </label>
              </div>
              <button className="delibera-tv__button" type="submit" disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </form>
          )}
        </aside>
      </div>
    </main>
  )
}
