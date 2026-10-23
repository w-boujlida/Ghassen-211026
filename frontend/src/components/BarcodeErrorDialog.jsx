import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './BarcodeErrorDialog.css'

export default function BarcodeErrorDialog() {
  const [error, setError] = useState(null)
  const dialog = useRef(null)
  useEffect(() => {
    const show = event => setError(event.detail)
    window.addEventListener('barcode-error', show)
    return () => window.removeEventListener('barcode-error', show)
  }, [])
  useEffect(() => {
    if (!error) return
    const previous = document.activeElement
    dialog.current.showModal()
    return () => previous?.focus()
  }, [error])
  if (!error) return null
  return createPortal(
    <dialog ref={dialog} className="barcode-error-dialog" aria-labelledby="barcode-error-title"
      onCancel={() => setError(null)} onClose={() => setError(null)}>
      <svg role="img" aria-label="Code-barres incorrect" viewBox="0 0 240 120">
        <rect x="15" y="10" width="210" height="100" rx="10" fill="#fff1f2" />
        <path d="M35 30v60m10-60v60m15-60v60m7-60v60m18-60v60m10-60v60m17-60v60m8-60v60m18-60v60m12-60v60m7-60v60m18-60v60m10-60v60m15-60v60" stroke="#7f1d1d" strokeWidth="5" />
        <circle cx="185" cy="85" r="28" fill="#dc2626" stroke="white" strokeWidth="4" />
        <path d="m175 75 20 20m0-20-20 20" stroke="white" strokeWidth="5" />
      </svg>
      <h2 id="barcode-error-title">Code-barres incorrect</h2>
      <p className="barcode-error-reason">{error.message}</p>
      <dl><dt>Code scanné</dt><dd>{error.barcode || '(vide)'}</dd>
        <dt>Caractères reçus</dt><dd>{Array.from(error.barcode || '').length}</dd></dl>
      <p>Enregistrement bloqué. Rescannez l’étiquette complète ou réimprimez-la.</p>
      <button autoFocus onClick={() => { dialog.current.close(); setError(null) }}>Compris — rescanner</button>
    </dialog>, document.body)
}
