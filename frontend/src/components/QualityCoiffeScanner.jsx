import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { lookupApi } from '../api/lookup.api.js'
import './QualityCoiffeScanner.css'

const EMPTY_RECORDS = { ok: [], nok: [] }

function ScanRecordsTable({ records, status, loading }) {
  const isOk = status === 'OK'
  return (
    <section className={`quality-coiffe-records quality-coiffe-records--${isOk ? 'ok' : 'nok'}`}>
      <header>
        <h3>{isOk ? 'Dernières coiffes OK' : 'Dernières coiffes NOK'}</h3>
        <span>{records.length} pièce(s)</span>
      </header>
      {loading ? (
        <p className="quality-coiffe-records__empty">Chargement des scans…</p>
      ) : records.length === 0 ? (
        <p className="quality-coiffe-records__empty">Aucune pièce enregistrée pour le moment.</p>
      ) : (
        <div className="quality-coiffe-records__scroll">
          <table>
            <thead>
              <tr><th>Date / heure</th><th>Code-barres</th><th>Référence</th><th>Défaut(s)</th></tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr key={record.id || `${record.barCode}-${index}`}>
                  <td>{String(record.date || '').replace('T', ' ').slice(0, 16) || '—'}</td>
                  <td><code>{record.barCode || '—'}</code></td>
                  <td>{record.ref || record.defDetail || '—'}</td>
                  <td>
                    {isOk ? <span className="quality-coiffe-records__badge">OK</span> : (
                      <div className="quality-coiffe-records__defects">
                        {(record.defects || []).map((defect, defectIndex) => (
                          <span key={`${defect.codeDef || defect.descDef}-${defectIndex}`}>
                            {defect.codeDef || defect.descDef || 'Défaut'}
                            {defect.descDef && defect.codeDef ? ` — ${defect.descDef}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function DefectPicker({ piece, defects, loading, submitting, inputRef, error, onScan, onSelect, onCancel }) {
  const [search, setSearch] = useState('')
  const [scannedCode, setScannedCode] = useState('')
  const query = search.trim().toLocaleLowerCase()
  const filtered = defects.filter(defect =>
    String(defect.cod || '').toLocaleLowerCase().includes(query) ||
    String(defect.description || '').toLocaleLowerCase().includes(query))

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 100)
    return () => window.clearTimeout(timer)
  }, [inputRef])

  const submitScan = event => {
    event.preventDefault()
    const value = scannedCode.trim()
    if (!value || submitting) return
    setScannedCode('')
    onScan(value)
  }

  return (
    <div className="quality-coiffe-overlay" role="presentation">
      <section className="quality-coiffe-defect-modal" role="dialog" aria-modal="true" aria-labelledby="quality-coiffe-defect-title">
        <header>
          <div>
            <span>Enregistrement NOK</span>
            <h3 id="quality-coiffe-defect-title">Choisir le défaut</h3>
            <p>Pièce : <strong>{piece.barcode}</strong></p>
          </div>
          <button type="button" onClick={onCancel} disabled={submitting} aria-label="Annuler">×</button>
        </header>
        <form className="quality-coiffe-defect-modal__scan" onSubmit={submitScan}>
          <label htmlFor="quality-coiffe-defect-code">Scanner l’étiquette défaut</label>
          <div>
            <input
              id="quality-coiffe-defect-code"
              ref={inputRef}
              value={scannedCode}
              onChange={event => setScannedCode(event.target.value)}
              placeholder="Scanner le code défaut"
              autoComplete="off"
              disabled={submitting}
            />
            <button type="submit" disabled={submitting || !scannedCode.trim()}>
              {submitting ? 'Enregistrement…' : 'Scanner'}
            </button>
          </div>
        </form>
        {error && <p className="quality-coiffe-defect-modal__error" role="alert">{error}</p>}
        <div className="quality-coiffe-defect-modal__list-heading">
          <h4>Liste des défauts</h4><span>{filtered.length} défaut(s)</span>
        </div>
        <input
          className="quality-coiffe-defect-modal__search"
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Rechercher par code ou description…"
        />
        <div className="quality-coiffe-defect-modal__list">
          {loading ? <p className="quality-coiffe-defect-modal__empty">Chargement des défauts…</p>
            : filtered.length === 0 ? <p className="quality-coiffe-defect-modal__empty">{defects.length ? 'Aucun défaut ne correspond à la recherche.' : 'Aucun défaut disponible.'}</p>
              : filtered.map(defect => (
                <button key={defect.cod} type="button" onClick={() => onSelect(defect)} disabled={submitting}>
                  <code>{defect.cod}</code><span>{defect.description || 'Sans description'}</span><strong>›</strong>
                </button>
              ))}
        </div>
        <footer>
          <span>Le défaut sélectionné sera enregistré automatiquement.</span>
          <button type="button" onClick={onCancel} disabled={submitting}>Annuler</button>
        </footer>
      </section>
    </div>
  )
}

export default function QualityCoiffeScanner({ module, source, api, user, canWrite }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('ok')
  const [barcode, setBarcode] = useState('')
  const [records, setRecords] = useState(EMPTY_RECORDS)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordsError, setRecordsError] = useState('')
  const [defects, setDefects] = useState([])
  const [defectsLoading, setDefectsLoading] = useState(false)
  const [pendingPiece, setPendingPiece] = useState(null)
  const [defectError, setDefectError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState(null)
  const barcodeRef = useRef(null)
  const defectBarcodeRef = useRef(null)
  const scanningRef = useRef(false)
  const modulePrefix = module === 'firewall' ? 'FIREWALL_' : 'CSL_'
  const project = String(source || '').replace(new RegExp(`^${modulePrefix}`, 'i'), '').toUpperCase()
  const moduleLabel = module === 'firewall' ? 'Firewall' : 'CSL'

  const loadRecords = useCallback(async () => {
    if (!source) return
    setRecordsLoading(true)
    setRecordsError('')
    try {
      const [okResult, nokResult] = await Promise.all([
        api.getAll({ source, page: 1, limit: 10, recordStatus: 'OK' }),
        api.getAll({ source, page: 1, limit: 10, recordStatus: 'NOT_OK' }),
      ])
      setRecords({ ok: okResult.records || [], nok: nokResult.records || [] })
    } catch (error) {
      setRecordsError(error.message || 'Impossible de charger les pièces enregistrées.')
    } finally {
      setRecordsLoading(false)
    }
  }, [api, source])

  useEffect(() => {
    if (!open) return
    loadRecords()
  }, [open, loadRecords])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      if (pendingPiece) defectBarcodeRef.current?.focus()
      else barcodeRef.current?.focus()
    }, 100)
    return () => window.clearTimeout(timer)
  }, [open, pendingPiece])

  useEffect(() => {
    if (!open || mode !== 'nok' || defects.length) return
    setDefectsLoading(true)
    lookupApi.defCodesList()
      .then(data => {
        const raw = Array.isArray(data) ? data : (data?.defCodes || data?.codes || [])
        const unique = new Set()
        setDefects(raw.filter(defect => {
          const key = String(defect.cod || '').toUpperCase()
          if (!key || unique.has(key)) return false
          unique.add(key)
          return true
        }))
      })
      .catch(error => setDefectError(error.message || 'Impossible de charger la liste des défauts.'))
      .finally(() => setDefectsLoading(false))
  }, [open, mode, defects.length])

  const resolveScannedDefect = scannedValue => {
    const normalize = value => String(value ?? '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    const normalized = normalize(scannedValue)
    const defect = defects.find(item => normalize(item.cod) === normalized)
    if (!defect) {
      setDefectError(`Code défaut « ${scannedValue} » introuvable. Choisissez un défaut valide dans la liste.`)
      window.setTimeout(() => defectBarcodeRef.current?.focus(), 100)
      return
    }
    setDefectError('')
    saveScan(pendingPiece, 'NOK', defect)
  }

  const saveScan = async (piece, status, defect) => {
    if (!piece || scanningRef.current) return
    scanningRef.current = true
    setScanning(true)
    setDefectError('')
    try {
      const matching = await api.getAll({
        source,
        page: 1,
        limit: 100,
        barcodeFilter: piece.barcode,
      })
      const existing = (matching.records || []).find(record =>
        String(record.barCode || '').trim().toUpperCase() === piece.barcode.toUpperCase())
      if (existing) {
        const alreadyOk = String(existing.recordStatus || '').toUpperCase() === 'OK'
        throw new Error(alreadyOk
          ? 'Cette pièce est déjà enregistrée comme OK.'
          : 'Cette pièce possède déjà un enregistrement. Vérifiez son statut dans l’historique.')
      }
      await api.create([{
        barCode: piece.barcode,
        dateFw: '',
        cqFw: module === 'firewall' ? 'NA' : undefined,
        cqCsl: module === 'csl' ? 'NA' : undefined,
        cqDelibera: 'NA',
        ref: piece.refDetail || piece.ref || '',
        version: piece.version || '',
        poste: 'NA',
        remarque: status === 'OK' ? 'Coiffe OK' : `Coiffe NOK — ${defect.description || defect.cod}`,
        reprise: status === 'OK' ? 'Returned' : 'Not Returned',
        codeDef: status === 'OK' ? 'COK' : defect.cod,
        descDef: status === 'OK' ? 'Coiffe OK' : (defect.description || ''),
        qty: 1,
        demirite: status === 'OK' ? 0 : (defect.demerite || 0),
        defstatus: status === 'OK' ? 'FIXED' : 'NOT FIXED',
        source,
        recordStatus: status === 'OK' ? 'OK' : 'Open',
        matricule: user?.matricule || '',
        nomComplet: user?.fullName || '',
      }])
      setPendingPiece(null)
      setBarcode('')
      setMessage({ type: 'success', text: status === 'OK' ? 'Pièce OK enregistrée.' : `Pièce NOK enregistrée — défaut ${defect.cod}.` })
      await loadRecords()
    } catch (error) {
      const text = error.response?.data?.error || error.response?.data?.message || error.message
      setMessage({ type: 'error', text })
      setDefectError(status === 'NOK' ? text : '')
    } finally {
      scanningRef.current = false
      setScanning(false)
      window.setTimeout(() => {
        if (pendingPiece && status === 'NOK') defectBarcodeRef.current?.focus()
        else barcodeRef.current?.focus()
      }, 100)
    }
  }

  const scanPiece = async () => {
    const scanned = barcode.trim()
    if (!scanned || scanningRef.current || pendingPiece) return
    scanningRef.current = true
    setScanning(true)
    setBarcode('')
    setMessage(null)
    try {
      const data = await lookupApi.barcode(scanned)
      const detectedProject = String(data.tableName || '').toUpperCase()
      if (!data.tableName || detectedProject !== project) {
        throw new Error(data.tableName
          ? `Cette pièce appartient au projet ${detectedProject}, pas au projet sélectionné ${project}.`
          : 'Code-barres non référencé.')
      }
      const piece = { barcode: scanned, ...data }
      if (mode === 'ok') {
        scanningRef.current = false
        setScanning(false)
        await saveScan(piece, 'OK')
      } else {
        setPendingPiece(piece)
        setMessage({ type: 'info', text: 'Pièce reconnue. Choisissez un défaut ou scannez son étiquette.' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || error.response?.data?.message || error.message })
    } finally {
      scanningRef.current = false
      setScanning(false)
      window.setTimeout(() => {
        if (pendingPiece) defectBarcodeRef.current?.focus()
        else barcodeRef.current?.focus()
      }, 100)
    }
  }

  const close = () => {
    if (scanning) return
    setOpen(false)
    setPendingPiece(null)
    setBarcode('')
    setMessage(null)
  }

  return (
    <>
      <button type="button" className="quality-coiffe-open-button" onClick={() => setOpen(true)}>
        <span aria-hidden="true">▥</span> Scan coiffes OK / NOK
      </button>
      {open && createPortal(
        <div className="quality-coiffe-overlay" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) close()
        }}>
          <section className="quality-coiffe-workspace" role="dialog" aria-modal="true" aria-labelledby="quality-coiffe-title">
            <header className="quality-coiffe-workspace__header">
              <div>
                <span>{moduleLabel} · {project || 'Aucun projet'}</span>
                <h2 id="quality-coiffe-title">Scan des coiffes</h2>
              </div>
              <button type="button" onClick={close} aria-label="Fermer">×</button>
            </header>
            <nav className="quality-coiffe-workspace__tabs" aria-label="Type de scan">
              <button type="button" className={mode === 'ok' ? 'active ok' : ''} onClick={() => {
                setMode('ok'); setPendingPiece(null); setMessage(null); setDefectError(''); setBarcode('')
              }}>✓ Coiffe OK</button>
              <button type="button" className={mode === 'nok' ? 'active nok' : ''} onClick={() => {
                setMode('nok'); setMessage(null); setDefectError(''); setBarcode('')
              }}>! Coiffe NOK</button>
            </nav>
            {!source ? (
              <p className="quality-coiffe-workspace__notice error">Sélectionnez un projet avant de scanner une pièce.</p>
            ) : (
              <>
                <section className={`quality-coiffe-fast-scan ${mode}`}>
                  <div>
                    <h3>{mode === 'ok' ? 'Coiffe OK' : pendingPiece ? 'Choisir un défaut' : 'Coiffe NOK'}</h3>
                    <p>{mode === 'ok'
                      ? 'Scannez une pièce conforme pour l’enregistrer automatiquement.'
                      : pendingPiece
                        ? `Pièce ${pendingPiece.barcode} reconnue. Sélectionnez son défaut.`
                        : 'Scannez la pièce non conforme; sélectionnez ensuite son défaut.'}</p>
                  </div>
                  <div className="quality-coiffe-fast-scan__input">
                    <input
                      ref={barcodeRef}
                      value={barcode}
                      onChange={event => setBarcode(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') { event.preventDefault(); scanPiece() }
                      }}
                      placeholder="Scanner le code-barres de la pièce"
                      aria-label="Scanner le code-barres de la pièce"
                      autoComplete="off"
                      disabled={!canWrite || scanning || Boolean(pendingPiece)}
                    />
                    <button type="button" onClick={scanPiece} disabled={!canWrite || scanning || !barcode.trim() || Boolean(pendingPiece)}>
                      {scanning ? 'Recherche…' : 'Valider'}
                    </button>
                    <span aria-live="polite">{scanning ? 'Traitement…' : 'Prêt à scanner'}</span>
                  </div>
                </section>
                {!canWrite && <p className="quality-coiffe-workspace__notice">Votre profil ne permet pas d’enregistrer des scans.</p>}
                {message && <p className={`quality-coiffe-workspace__notice ${message.type}`} role="status">{message.text}</p>}
                {recordsError && <p className="quality-coiffe-workspace__notice error">{recordsError}</p>}
                <ScanRecordsTable
                  records={mode === 'ok' ? records.ok : records.nok}
                  status={mode === 'ok' ? 'OK' : 'NOK'}
                  loading={recordsLoading}
                />
              </>
            )}
            {pendingPiece && (
              <DefectPicker
                piece={pendingPiece}
                defects={defects}
                loading={defectsLoading}
                submitting={scanning}
                inputRef={defectBarcodeRef}
                error={defectError}
                onScan={resolveScannedDefect}
                onSelect={defect => saveScan(pendingPiece, 'NOK', defect)}
                onCancel={() => {
                  setPendingPiece(null)
                  setBarcode('')
                  setMessage(null)
                  window.setTimeout(() => barcodeRef.current?.focus(), 100)
                }}
              />
            )}
          </section>
        </div>,
        document.body
      )}
    </>
  )
}
