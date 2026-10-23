import { useEffect, useState } from 'react'
import { projectsApi } from '../api/projects.api.js'
import './VersionPhoto.css'

export default function VersionPhoto({ project, line, version, revision = 0 }) {
  const [state, setState] = useState(null)
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify([project, line, version, revision, retry])
  useEffect(() => {
    let active = true
    projectsApi.getVersionPhoto(project, line, version).then(data => {
      if (active) setState({ key, data })
    }).catch(error => {
      if (active) setState({ key, error: error.response?.data?.error || error.message })
    })
    return () => { active = false }
  }, [project, line, version, key])
  const current = state?.key === key ? state : null
  return <figure className="version-photo" aria-label="Photo de la version">
    <figcaption>{project} / {line || 'Sans ligne'} / {version || 'Sans version'}</figcaption>
    {!current && <p role="status">Chargement de la photo…</p>}
    {current?.error && <div role="alert">{current.error} <button type="button" onClick={() => setRetry(r => r + 1)}>Réessayer</button></div>}
    {current?.data?.available === false && <p>Photo non disponible pour cette version.</p>}
    {current?.data?.available && <img src={current.data.dataUrl}
      alt={`Pièce ${project} — ${line || 'Sans ligne'} — ${version || 'Sans version'}`}
      onError={() => setState({ key, error: 'Impossible d’afficher la photo de cette version.' })} />}
  </figure>
}
