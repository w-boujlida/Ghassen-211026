import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { projectsApi } from '../api/projects.api.js'
import VersionPhoto from './VersionPhoto.jsx'

const text = value => String(value ?? '').trim()

export default function DeliberaScanSetup({ current, onConfirm, onClose }) {
  const [projects, setProjects] = useState([])
  const [projet, setProjet] = useState(current?.projet || '')
  const [ligne, setLigne] = useState(current?.ligne ?? null)
  const [version, setVersion] = useState(current?.version ?? null)
  const [refs, setRefs] = useState([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [refsLoading, setRefsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState('')
  const [refsError, setRefsError] = useState('')
  const [retry, setRetry] = useState(0)
  const dialogRef = useRef(null)

  useEffect(() => {
    let active = true
    setProjectsError('')
    setProjectsLoading(true)
    projectsApi.getProjects().then(data => {
      if (active) setProjects([...new Set(data.projects.map(p => text(p.name || p)))].sort())
    }).catch(e => {
      if (active) setProjectsError(e.response?.data?.error || e.message)
    }).finally(() => { if (active) setProjectsLoading(false) })
    return () => { active = false }
  }, [retry])

  useEffect(() => {
    if (!projet) { setRefsLoading(false); setRefsError(''); return }
    let active = true
    setRefs([])
    setRefsLoading(true)
    setRefsError('')
    const load = async () => {
      const first = await projectsApi.getRefs(encodeURIComponent(projet), 1, 500)
      const all = [...first.refs]
      for (let page = 2; page <= first.pagination.pages; page++) {
        if (!active) return
        const next = await projectsApi.getRefs(encodeURIComponent(projet), page, 500)
        all.push(...next.refs)
      }
      if (active) setRefs(all)
    }
    load().catch(e => {
      if (active) setRefsError(e.response?.data?.error || e.message)
    }).finally(() => { if (active) setRefsLoading(false) })
    return () => { active = false }
  }, [projet, retry])

  useEffect(() => {
    const previous = document.activeElement
    dialogRef.current?.querySelector('button')?.focus()
    return () => previous?.focus()
  }, [])

  useEffect(() => {
    if (!projectsLoading) dialogRef.current?.querySelector('select:not([disabled])')?.focus()
  }, [projectsLoading])

  const lignes = [...new Set(refs.map(r => text(r.LIGNE)))].sort()
  const versions = [...new Set(refs.filter(r => text(r.LIGNE) === ligne)
    .map(r => text(r.VERSION)))].sort()
  const loading = projectsLoading || refsLoading
  const error = projectsError || refsError
  const valid = !loading && !error && projects.includes(projet)
    && lignes.includes(ligne) && versions.includes(version)

  const handleKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    if (event.key !== 'Tab') return
    const elements = dialogRef.current.querySelectorAll('button:not([disabled]),select:not([disabled])')
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  return createPortal(
    <div className="delibera-setup-overlay">
      <form ref={dialogRef} className="delibera-setup" role="dialog" aria-modal="true"
        aria-labelledby="delibera-setup-title" onKeyDown={handleKeyDown}
        onSubmit={event => {
          event.preventDefault()
          if (valid) onConfirm({ projet, ligne, version })
        }}>
        <header>
          <div>
            <span>PRÉPARATION DU SCAN</span>
            <h3 id="delibera-setup-title">Quel type de pièce contrôlez-vous ?</h3>
            <p>Choisissez le projet, la ligne et la version avant de scanner.</p>
          </div>
          <button type="button" aria-label="Fermer la préparation" onClick={onClose}>×</button>
        </header>
        <div className="delibera-setup__fields" aria-busy={loading}>
          <label htmlFor="delibera-setup-project">1. Projet</label>
          <select id="delibera-setup-project" value={projet}
            disabled={projectsLoading || Boolean(projectsError)}
            onChange={e => { setProjet(e.target.value); setLigne(null); setVersion(null); setRefs([]) }}>
            <option value="">Choisir un projet</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <label htmlFor="delibera-setup-ligne">2. Ligne</label>
          <select id="delibera-setup-ligne" value={ligne === null ? '' : JSON.stringify(ligne)}
            disabled={!projet || loading || Boolean(error)} onChange={e => {
              setLigne(e.target.value ? JSON.parse(e.target.value) : null); setVersion(null)
            }}>
            <option value="">Choisir une ligne</option>
            {lignes.map(l => <option key={l} value={JSON.stringify(l)}>{l || 'Sans ligne'}</option>)}
          </select>
          <label htmlFor="delibera-setup-version">3. Version</label>
          <select id="delibera-setup-version" value={version === null ? '' : JSON.stringify(version)}
            disabled={ligne === null || loading || Boolean(error)}
            onChange={e => setVersion(e.target.value ? JSON.parse(e.target.value) : null)}>
            <option value="">Choisir une version</option>
            {versions.map(v => <option key={v} value={JSON.stringify(v)}>{v || 'Sans version'}</option>)}
          </select>
          {loading && <p role="status">Chargement des choix…</p>}
          {error && <div role="alert">{error} <button type="button" onClick={() => setRetry(r => r + 1)}>Réessayer</button></div>}
          {!loading && !error && projet && refs.length === 0 && <p role="status">Aucune référence disponible pour ce projet.</p>}
          {!loading && !error && projects.length === 0 && <p role="status">Aucun projet disponible.</p>}
          {valid && <p className="delibera-setup__recap">
            {projet} / {ligne || 'Sans ligne'} / {version || 'Sans version'}
          </p>}
          {valid && <VersionPhoto project={projet} line={ligne} version={version} />}
        </div>
        <footer>
          <button type="button" onClick={onClose}>Annuler</button>
          <button type="submit" disabled={!valid}>Valider et commencer le scan</button>
        </footer>
      </form>
    </div>, document.body
  )
}
