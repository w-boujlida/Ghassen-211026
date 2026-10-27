import { useEffect, useRef, useState } from 'react'
import { deliberaApi } from '../api/delibera.api.js'
import { scanRuleError } from '../utils/scanRules.js'
import './DeliberaMultiScanner.css'

export default function DeliberaMultiScanner({ project, version, mode, disabled, onComplete, firstInputRef }) {
  const [rules, setRules] = useState(null)
  const [codes, setCodes] = useState([])
  const [confirmed, setConfirmed] = useState([])
  const [error, setError] = useState('')
  const [pdef, setPdef] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [focusSignal, setFocusSignal] = useState(0)
  const inputs = useRef([])
  const busy = useRef(false)
  const nextFocus = useRef(0)
  const generation = useRef(0)
  useEffect(() => {
    setRules([{ length: null, prefix: '', suffix: '' }]); setError(''); setCodes(['']); setConfirmed([false]); setPdef('')
    nextFocus.current = 0
    return () => { generation.current++ }
  }, [project, version])
  useEffect(() => {
    if (rules && !disabled && !submitting) inputs.current[nextFocus.current]?.focus()
  }, [rules, disabled, submitting, focusSignal])
  const submit = async index => {
    if (busy.current || disabled || !rules) return
    busy.current = true; setSubmitting(true)
    const current = generation.current
    try {
      const code = codes[index].trim()
      let effectiveRules = rules
      if (index === 0) {
        const data = await deliberaApi.resolveScanSettings(project, version ?? '', code)
        if (current !== generation.current) return
        if (!Array.isArray(data.rules) || data.rules.length < 1 || data.rules.length > 3)
          throw new Error('Configuration de scan invalide. Vérifiez les conditions du PDEF.')
        if (data.wasReturnedBefore) {
          const message = 'Cette pièce existe déjà : elle a déjà été scannée et enregistrée. Vérifiez-la dans l’historique.'
          setRules([{ length: null, prefix: '', suffix: '' }])
          setCodes(['']); setConfirmed([false]); setPdef(''); nextFocus.current = 0
          setFocusSignal(tick => tick + 1)
          setError(message)
          window.dispatchEvent(new CustomEvent('barcode-error', { detail: {
            title: 'Pièce déjà scannée', message, barcode: code,
            hint: 'Enregistrement bloqué. Rescannez une autre pièce.' } }))
          return
        }
        effectiveRules = data.rules
        setRules(effectiveRules); setPdef(String(data.pdef ?? ''))
      } else {
        const codesToCheck = codes.map((value, codeIndex) => codeIndex === index ? code : value)
        await deliberaApi.validateUniqueScanCode(project, code, codes[0], index + 1, codesToCheck)
        if (current !== generation.current) return
      }
      const values = effectiveRules.map((_, i) => i === index ? code : index === 0 ? '' : codes[i] || '')
      const checked = effectiveRules.map((_, i) => i === index ? false : index === 0 ? false : confirmed[i])
      setCodes(values); setConfirmed(checked)
      const message = scanRuleError(project, index, effectiveRules[index], code)
      if (message) {
        nextFocus.current = index
        setFocusSignal(tick => tick + 1)
        setError(message)
        window.dispatchEvent(new CustomEvent('barcode-error', { detail: { message, barcode: code } }))
        return
      }
      checked[index] = true
      setConfirmed([...checked]); setError('')
      const missing = checked.findIndex(value => !value)
      if (missing !== -1) { nextFocus.current = missing; setFocusSignal(tick => tick + 1); return }
      await onComplete(values)
      if (current !== generation.current) return
      setRules([{ length: null, prefix: '', suffix: '' }])
      setCodes(['']); setConfirmed([false]); setPdef(''); nextFocus.current = 0
      setFocusSignal(tick => tick + 1)
    } catch (e) {
      if (current === generation.current) setError(e.response?.data?.error || e.message)
    } finally {
      busy.current = false
      if (current === generation.current) setSubmitting(false)
    }
  }
  if (!project) return <p>Validez le projet, la ligne et la version avant de scanner.</p>
  return <div className="delibera-multi-scanner">
    {!pdef && <p>Scannez le code principal : ses conditions seront chargées selon le PDEF et la version reconnus.</p>}
    {pdef && <p>PDEF : <strong>{pdef}</strong> · Version : {version || 'Sans version'}</p>}
    {error && <div role="alert" className="alert alert-error">{error}
    </div>}
    {rules?.map((rule, i) => <div className={`delibera-scan-field ${confirmed[i] ? 'is-confirmed' : ''}`} key={i}>
      <label htmlFor={`delibera-${mode}-code-${i}`}>Code {i + 1}{i === 0 ? ' — pièce principale' : ' — complémentaire'}
        {confirmed[i] && <span> ✓ Validé</span>}
      </label>
      <div className="delibera-fast-scan__input-wrap">
        <input id={`delibera-${mode}-code-${i}`} ref={element => {
          inputs.current[i] = element
          if (i === 0 && firstInputRef) firstInputRef.current = element
        }} type="text" autoComplete="off" spellCheck={false}
          aria-label={i === 0 ? (mode === 'ok' ? 'Scanner une coiffe OK' : 'Scanner une pièce NOK') : `Scanner le code ${i + 1}`}
          placeholder={`Scanner le code ${i + 1}, puis Entrée`}
          value={codes[i] || ''} disabled={disabled || submitting || (i > 0 && !confirmed[0])}
          onChange={event => {
            setCodes(values => values.map((value, n) => n === i ? event.target.value : value))
            setConfirmed(values => values.map((value, n) => i === 0 || n === i ? false : value))
            if (i === 0) setPdef('')
          }}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit(i) } }} />
        <button type="button" disabled={disabled || submitting || (i > 0 && !confirmed[0])} onClick={() => submit(i)}>Valider</button>
      </div>
      <small>{i === 0 && !pdef ? 'Conditions déterminées après reconnaissance du PDEF' :
        rule.length == null ? 'Longueur libre' : `${rule.length} caractères`}
        {rule.prefix && ` · Début : ${rule.prefix}`}{rule.suffix && ` · Fin : ${rule.suffix}`}</small>
    </div>)}
    {rules && <p role="status">{submitting ? 'Vérification et enregistrement…' : !pdef ? 'En attente du code principal.' :
      `${confirmed.filter(Boolean).length} / ${rules.length} code(s) validé(s) — tous les champs sont obligatoires.`}</p>}
  </div>
}
