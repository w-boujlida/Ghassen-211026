import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './BarcodeErrorDialog.css'

export default function BarcodeErrorDialog() {
  const [error, setError] = useState(null)
  const dialog = useRef(null)
  const previousFocus = useRef(null)
  const scannedWhileOpen = useRef('')
  useEffect(() => {
    const show = event => setError(event.detail)
    window.addEventListener('barcode-error', show)
    return () => window.removeEventListener('barcode-error', show)
  }, [])
  useEffect(() => {
    if (!error) return
    previousFocus.current = document.activeElement
    scannedWhileOpen.current = ''
    dialog.current.showModal()
    return () => previousFocus.current?.focus()
  }, [error])
  if (!error) return null

  /* Poste sans clavier ni souris : un scan pendant que la popup est ouverte
     la ferme (Entrée de la douchette) et le code capturé est réinjecté dans
     le champ de scan actif, puis validé automatiquement — rien n'est perdu. */
  const dismissByScan = event => {
    if (event.key === 'Enter') {
      event.preventDefault()
      const code = scannedWhileOpen.current
      scannedWhileOpen.current = ''
      dialog.current.close()
      setError(null)
      const target = previousFocus.current
      if (code && target instanceof HTMLInputElement && !target.disabled) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(target, code)
        target.dispatchEvent(new Event('input', { bubbles: true }))
        window.setTimeout(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })), 50)
      }
    } else if (event.key.length === 1) {
      scannedWhileOpen.current = (scannedWhileOpen.current + event.key).slice(-100)
    }
  }

  return createPortal(
    <dialog ref={dialog} className="barcode-error-dialog" aria-labelledby="barcode-error-title"
      onKeyDown={dismissByScan}
      onCancel={() => setError(null)} onClose={() => setError(null)}>
      <svg role="img" aria-label="Code-barres incorrect" viewBox="0 0 240 120">
        <rect x="15" y="10" width="210" height="100" rx="10" fill="#fff1f2" />
        <path d="M35 30v60m10-60v60m15-60v60m7-60v60m18-60v60m10-60v60m17-60v60m8-60v60m18-60v60m12-60v60m7-60v60m18-60v60m10-60v60m15-60v60" stroke="#7f1d1d" strokeWidth="5" />
        <circle cx="185" cy="85" r="28" fill="#dc2626" stroke="white" strokeWidth="4" />
        <path d="m175 75 20 20m0-20-20 20" stroke="white" strokeWidth="5" />
      </svg>
      <h2 id="barcode-error-title">{error.title || 'Code-barres incorrect'}</h2>
      <p className="barcode-error-reason">{error.message}</p>
      <dl><dt>Code scanné</dt><dd>{error.barcode || '(vide)'}</dd>
        <dt>Caractères reçus</dt><dd>{Array.from(error.barcode || '').length}</dd></dl>
      <p>{error.hint || 'Enregistrement bloqué. Rescannez l’étiquette complète ou réimprimez-la.'}</p>
      <p>Sans clavier : scannez la pièce suivante — la popup se ferme toute seule et le scan continue.</p>
      <button autoFocus onClick={() => { dialog.current.close(); setError(null) }}>Compris — rescanner</button>
    </dialog>, document.body)
}
