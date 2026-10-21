import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { deliberaApi } from '../api/delibera.api.js'

export default function DeliberaReturnModal({ record, onClose, onDone }) {
  const [justification, setJustification] = useState('')
  const [resolved, setResolved] = useState(() => (record.defauts || []).filter(d => d.verifie).map(d => d.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const savingRef = useRef(false)
  const dialogRef = useRef(null)
  const defects = record.defauts || []
  const allResolved = defects.length > 0 && defects.every(d => resolved.includes(d.id))
  const valid = justification.trim().length > 0 || allResolved

  useEffect(() => {
    const previous = document.activeElement
    dialogRef.current?.querySelector('textarea')?.focus()
    return () => previous?.focus()
  }, [])

  const close = () => { if (!savingRef.current) onClose() }
  const submit = async event => {
    event.preventDefault()
    if (!valid || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      await deliberaApi.returnToOk(record.ID ?? record.id, {
        justification: justification.trim(), resolvedDefectIds: resolved,
      })
      onDone()
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return createPortal(
    <div className="delibera-setup-overlay">
      <form ref={dialogRef} className="delibera-setup" role="dialog" aria-modal="true"
        aria-labelledby="delibera-return-title" onSubmit={submit} onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); close() }
          if (event.key !== 'Tab') return
          const elements = dialogRef.current.querySelectorAll('button:not([disabled]),textarea:not([disabled]),input:not([disabled])')
          const first = elements[0]
          const last = elements[elements.length - 1]
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }}>
        <header>
          <div>
            <span>COIFFE DÉJÀ ENREGISTRÉE NOK</span>
            <h3 id="delibera-return-title">Passer cette coiffe de NOK à OK ?</h3>
            <p>{record.BARCODE || record.barcode}</p>
          </div>
          <button type="button" onClick={close} disabled={saving} aria-label="Annuler le retour">×</button>
        </header>
        <div className="delibera-setup__fields">
          <p>Ajoutez un justificatif ou confirmez que tous les codes défauts sont résolus. Aucun nouvel enregistrement ne sera créé.</p>
          <label htmlFor="delibera-return-justification">Justificatif du retour NOK → OK</label>
          <textarea id="delibera-return-justification" rows={4} maxLength={2000} value={justification}
            disabled={saving} onChange={event => setJustification(event.target.value)}
            placeholder="Expliquez la correction ou la raison du retour…" />
          <fieldset disabled={saving}>
            <legend>Codes défauts résolus</legend>
            {defects.length === 0 ? <p>Aucun code défaut enregistré : un justificatif est obligatoire.</p>
              : defects.map(d => <label key={d.id} className="delibera-return-defect">
                <input type="checkbox" checked={resolved.includes(d.id)}
                  disabled={d.verifie} onChange={event => setResolved(current => event.target.checked
                    ? [...current, d.id] : current.filter(id => id !== d.id))} />
                <span><strong>{d.codeDefaut}</strong> — {d.descDefaut || 'Défaut'}
                  {d.verifie ? ' (déjà résolu)' : ''}</span>
              </label>)}
          </fieldset>
          <p role="status">{resolved.length} / {defects.length} défaut(s) résolu(s)</p>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
        </div>
        <footer>
          <button type="button" onClick={close} disabled={saving}>Annuler</button>
          <button type="submit" disabled={!valid || saving}>{saving ? 'Enregistrement…' : 'Confirmer NOK → OK'}</button>
        </footer>
      </form>
    </div>, document.body
  )
}
