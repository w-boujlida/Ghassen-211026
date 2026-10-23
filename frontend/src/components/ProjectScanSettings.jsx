import { useEffect, useState } from 'react'
import Modal, { ModalBtn, ModalField } from './Modal.jsx'
import ScanRulesEditor, { validScanRules } from './ScanRulesEditor.jsx'
import { projectsApi } from '../api/projects.api.js'

export default function ProjectScanSettings({ project, onClose, onSaved }) {
  const [length, setLength] = useState('')
  const [refs, setRefs] = useState([])
  const [pdef, setPdef] = useState(null)
  const text = value => String(value ?? '').trim()
  const pdefs = [...new Set(refs.map(r => text(r.PDEF)))].filter(Boolean).sort()
  const versions = [...new Set(refs.filter(r => text(r.PDEF) === pdef).map(r => text(r.VERSION)))].sort()
  const [version, setVersion] = useState(null)
  const [refsLoading, setRefsLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setRefsLoading(true); setError('')
    const load = async () => {
      const first = await projectsApi.getRefs(encodeURIComponent(project), 1, 500)
      const refs = [...first.refs]
      for (let page = 2; page <= first.pagination.pages; page++) {
        const next = await projectsApi.getRefs(encodeURIComponent(project), page, 500)
        refs.push(...next.refs)
      }
      if (active) setRefs(refs)
    }
    load().catch(e => { if (active) setError(e.response?.data?.error || e.message) })
      .finally(() => { if (active) setRefsLoading(false) })
    return () => { active = false }
  }, [project, retry])
  useEffect(() => {
    if (pdef === null || version === null) return
    let active = true
    setLoading(true); setError('')
    setRules([])
    projectsApi.getReferenceScanSettings(project, pdef, version).then(data => {
      if (active) { setRules(data.rules); setLength(data.barcodeLength ?? ''); setConfigured(data.configured) }
    })
      .catch(e => { if (active) setError(e.response?.data?.error || e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [project, pdef, version, retry])
  const save = async () => {
    const parsed = length === '' ? null : Number(length)
    if (!validScanRules(rules) || (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 100))) {
      setError('Les longueurs doivent être des entiers de 1 à 100, ou rester vides.'); return
    }
    setSaving(true); setError('')
    try {
      await projectsApi.setReferenceScanSettings(project, pdef, version, parsed, rules)
      onSaved()
    } catch (e) { setError(e.response?.data?.error || e.message) }
    finally { setSaving(false) }
  }
  return <Modal title={`Conditions de scan — ${project}`} maxWidth={680}
    onClose={() => { if (!saving) onClose() }}
    footer={<ModalBtn onClick={save} disabled={pdef === null || version === null || refsLoading || loading || saving || rules.length === 0}>
      {saving ? 'Enregistrement...' : 'Enregistrer'}</ModalBtn>}>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    <ModalField label="PDEF">
      <select className="form-input" aria-label="PDEF des conditions de scan" disabled={saving || refsLoading}
        value={pdef ?? ''}
        onChange={e => { setPdef(e.target.value || null); setVersion(null); setRules([]); setLoading(true); setError('') }}>
        <option value="">Choisir un PDEF</option>
        {pdefs.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    </ModalField>
    <ModalField label="Version du projet">
      <select className="form-input" aria-label="Version des conditions de scan" disabled={pdef === null || saving || refsLoading}
        value={version === null ? '' : JSON.stringify(version)}
        onChange={e => { setVersion(e.target.value ? JSON.parse(e.target.value) : null); setRules([]); setLoading(true) }}>
        <option value="">Choisir une version</option>
        {versions.map(v => <option key={v} value={JSON.stringify(v)}>{v || 'Sans version'}</option>)}
      </select>
    </ModalField>
    {refsLoading && <p role="status">Chargement des versions…</p>}
    {!refsLoading && pdefs.length === 0 && <p>Ajoutez les références du projet pour définir ses PDEF et versions.</p>}
    {error && <button type="button" onClick={() => setRetry(r => r + 1)}>Réessayer</button>}
    {version !== null && <>
    {loading && <p role="status">Chargement des conditions…</p>}
    {!loading && rules.length > 0 && <p>{configured ? 'Paramètres propres à ce PDEF et cette version.' : 'Valeurs héritées du projet ou de la version. Enregistrer crée des paramètres pour ce PDEF et cette version uniquement.'}</p>}
    <ModalField label="Longueur Firewall / CSL (indépendante des conditions Délibéra)">
      <input className="form-input" aria-label="Longueur Firewall CSL" type="number" min="1" max="100"
        value={length} disabled={saving || loading} onChange={e => setLength(e.target.value)} />
    </ModalField>
    {rules.length > 0 && <ScanRulesEditor rules={rules} onChange={setRules} disabled={loading || saving} />}
    </>}
  </Modal>
}
