import { useEffect, useState } from 'react'
import Modal, { ModalBtn } from './Modal.jsx'
import { projectsApi } from '../api/projects.api.js'
import VersionPhoto from './VersionPhoto.jsx'

const text = value => String(value ?? '').trim()

export default function VersionPhotoManager({ project, onClose }) {
  const [refs, setRefs] = useState([])
  const [line, setLine] = useState(null)
  const [version, setVersion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const [retry, setRetry] = useState(0)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    const load = async () => {
      const first = await projectsApi.getRefs(encodeURIComponent(project), 1, 500)
      const all = [...first.refs]
      for (let page = 2; page <= first.pagination.pages; page++) {
        if (!active) return
        const next = await projectsApi.getRefs(encodeURIComponent(project), page, 500)
        all.push(...next.refs)
      }
      if (active) setRefs(all)
    }
    load().catch(e => { if (active) setError(e.response?.data?.error || e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [project, retry])
  const lines = [...new Set(refs.map(r => text(r.LIGNE)))].sort()
  const versions = [...new Set(refs.filter(r => text(r.LIGNE) === line).map(r => text(r.VERSION)))].sort()
  const valid = !loading && lines.includes(line) && versions.includes(version)
  const mutate = async action => {
    setSaving(true); setError(''); setNotice('')
    try {
      await action()
      setRevision(r => r + 1); setNotice('Photo mise à jour.')
    } catch (e) { setError(e.response?.data?.error || e.message) }
    finally { setSaving(false) }
  }
  const upload = event => {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file || !valid || saving) return
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Utilisez une photo JPEG ou PNG de 2 Mo maximum.'); return
    }
    mutate(async () => {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Impossible de lire le fichier sélectionné.'))
        reader.onabort = () => reject(new Error('Lecture du fichier annulée.'))
        reader.readAsDataURL(file)
      })
      await projectsApi.setVersionPhoto(project, line, version, dataUrl)
    })
  }
  return <Modal title={`Photos des versions — ${project}`} maxWidth={640}
    onClose={() => { if (!saving) onClose() }}
    footer={<ModalBtn disabled={saving} onClick={onClose}>Fermer</ModalBtn>}>
    <div className="version-photo-manager">
      <p>Une photo par ligne et version. Elle sera visible uniquement pendant la préparation du scan Délibéra.</p>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {loading && <p role="status">Chargement des références…</p>}
      {!loading && refs.length === 0 && <p>Ajoutez des références au projet pour définir ses lignes et versions.</p>}
      <button type="button" className="btn-icon" disabled={saving || loading}
        onClick={() => { setRefs([]); setLine(null); setVersion(null); setRetry(r => r + 1) }}>Recharger les références</button>
      <label>Ligne
        <select className="form-input" aria-label="Ligne de la photo" disabled={loading || saving}
          value={line === null ? '' : JSON.stringify(line)}
          onChange={e => { setLine(e.target.value ? JSON.parse(e.target.value) : null); setVersion(null); setNotice('') }}>
          <option value="">Choisir une ligne</option>
          {lines.map(l => <option key={l} value={JSON.stringify(l)}>{l || 'Sans ligne'}</option>)}
        </select>
      </label>
      <label>Version
        <select className="form-input" aria-label="Version de la photo" disabled={loading || saving || line === null}
          value={version === null ? '' : JSON.stringify(version)}
          onChange={e => { setVersion(e.target.value ? JSON.parse(e.target.value) : null); setNotice('') }}>
          <option value="">Choisir une version</option>
          {versions.map(v => <option key={v} value={JSON.stringify(v)}>{v || 'Sans version'}</option>)}
        </select>
      </label>
      {valid && <>
        <VersionPhoto project={project} line={line} version={version} revision={revision} />
        <label>Ajouter ou remplacer la photo
          <input type="file" aria-label="Photo de la version" accept="image/jpeg,image/png" disabled={saving} onChange={upload} />
          <span className="photo-help">JPEG ou PNG · 2 Mo maximum. L’image est enregistrée dès sa sélection.</span>
        </label>
        <button type="button" className="btn-icon btn-delete" disabled={saving}
          onClick={() => { if (window.confirm('Supprimer la photo de cette ligne et version ?')) mutate(() => projectsApi.deleteVersionPhoto(project, line, version)) }}>
          Supprimer la photo
        </button>
      </>}
      {saving && <p role="status">Enregistrement de la photo…</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  </Modal>
}
