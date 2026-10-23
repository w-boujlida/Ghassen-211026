import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { projectsApi } from '../api/projects.api.js'
import { lookupApi } from '../api/lookup.api.js'
import { postesApi } from '../api/postes.api.js'
import Pagination from '../components/Pagination.jsx'
import BulkActionBar from '../components/BulkActionBar.jsx'
import { useBulkSelection } from '../hooks/useBulkSelection.js'
import { parseExcelFile, exportToExcel } from '../utils/helpers.js'
import * as XLSX from 'xlsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import Modal, { ModalBtn, ModalField } from '../components/Modal.jsx'
import './Projects.css'
import VersionPhotoManager from '../components/VersionPhotoManager.jsx'
import ProjectScanSettings from '../components/ProjectScanSettings.jsx'
import ScanRulesEditor, { emptyScanRule, validScanRules } from '../components/ScanRulesEditor.jsx'

const EMPTY_REF = { pdef: '', fas: '', designation: '', version: '', refDetail: '', ligne: '' }
const REF_HEADERS = ['PDEF', 'FAS', 'DESIGNATION', 'VERSION', 'REF_DETAIL', 'LIGNE']

function BarcodeLengthField({ value, onChange, disabled }) {
  const number = value === '' ? null : Number(value)
  return <div>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <button type="button" className="btn-icon" aria-label="Diminuer la longueur" disabled={disabled || number === 1}
        onClick={() => onChange(Math.max(1, (number ?? 26) - 1))}>−</button>
      <input type="number" className="form-input" aria-label="Nombre de caractères à scanner"
        min="1" max="100" value={value} disabled={disabled}
        onChange={e => onChange(e.target.value)} />
      <button type="button" className="btn-icon" aria-label="Augmenter la longueur" disabled={disabled || number === 100}
        onClick={() => onChange(Math.min(100, (number ?? 26) + 1))}>+</button>
    </div>
    <p className="project-help">Tous les caractères sont acceptés. Champ vide : contrôle de longueur désactivé. Exemple : 26.</p>
  </div>
}

function ProjectSteps({ step }) {
  return (
    <ol className="project-steps" aria-label="Création du projet">
      {['Nouveau projet', 'Ajouter ou importer les références'].map((label, index) => (
        <li key={label} className={step === index + 1 ? 'active' : ''}
          aria-current={step === index + 1 ? 'step' : undefined}>
          <span>{index + 1}</span><strong>{label}</strong>
        </li>
      ))}
    </ol>
  )
}

export default function Projects() {
  const { isAdmin, canModifyProjects, canCreateProjects } = useAuth()
  const [tab, setTab]                 = useState('projects')
  const [metadataMessages, setMetadataMessages] = useState([])
  const [metadataCheckpoints, setMetadataCheckpoints] = useState([])
  const [metadataLoading, setMetadataLoading] = useState(false)
  const [metadataError, setMetadataError] = useState('')
  const [metadataSearch, setMetadataSearch] = useState('')
  const metadataImportFileRef = useRef(null)

  // ── Projects state ──
  const [projects, setProjects]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  // ── Refs state ──
  const [refs, setRefs]               = useState([])
  const [refsPag, setRefsPag]         = useState({ total: 0, page: 1, limit: 50, pages: 1 })
  const [refsProject, setRefsProject] = useState(null)
  const [refsLoading, setRefsLoading] = useState(false)
  const [refsError, setRefsError]     = useState('')
  const [refsSearch, setRefsSearch]   = useState('')

  // ── Defect codes state ──
  const [defCodes, setDefCodes]       = useState([])
  const [defLoading, setDefLoading]   = useState(false)
  const [defSearch, setDefSearch]     = useState('')

  // ── Saving state ──
  const [saving, setSaving]           = useState(false)
  const [formError, setFormError]     = useState('')

  // ── Add project modal ──
  const [addModal, setAddModal]       = useState(false)
  const [newName, setNewName]         = useState('')
  const [photoProject, setPhotoProject] = useState(null)
  const [newBarcodeLength, setNewBarcodeLength] = useState('')
  const [newScanRules, setNewScanRules] = useState([emptyScanRule()])
  const [lengthProject, setLengthProject] = useState(null)
  const [barcodeLength, setBarcodeLength] = useState('')
  const [creatingRefs, setCreatingRefs] = useState(false)
  const createPendingRef = useRef(false)

  // ── Rename modal ──
  const [renameModal, setRenameModal] = useState(false)
  const [renameProject, setRenameProject] = useState(null)
  const [renameName, setRenameName]   = useState('')

  // ── Refs modal ──
  const [refsModal, setRefsModal]     = useState(false)
  const [refSubModal, setRefSubModal] = useState(null)  // null | 'add' | 'edit' | 'import'
  const [editingRef, setEditingRef]   = useState(null)
  const [refForm, setRefForm]         = useState(EMPTY_REF)
  const [refsExcelRows, setRefsExcelRows] = useState(null)
  const [refsExcelFile, setRefsExcelFile] = useState(null)
  const refsFileRef = useRef()
  const refsSavingRef = useRef(false)

  // ── Verification messages state ──
  const [refMessages, setRefMessages]               = useState([])
  const [refMessagesLoading, setRefMessagesLoading] = useState(false)

  // ── Checkpoints state ──
  const [refCheckpoints, setRefCheckpoints]               = useState([])
  const [refCheckpointsLoading, setRefCheckpointsLoading] = useState(false)
  const [refMetadataError, setRefMetadataError] = useState('')
  const refMetadataVersion = useRef(0)

  // ── Export refs state ──
  const [exportingRefs, setExportingRefs] = useState(false)

  // ── Bulk selection for refs ──
  const { selected: selectedRefs, isSelected: isRefSelected, toggle: toggleRef,
          toggleAll: toggleAllRefs, clear: clearRefSelection,
          allSelected: allRefsSelected, someSelected: someRefsSelected } = useBulkSelection(refs, r => r.ROW_ID)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // ── Postes state ──
  const [postes, setPostes]               = useState([])
  const [postesLoading, setPostesLoading] = useState(false)
  const [postesSearch, setPostesSearch]   = useState('')
  const [posteModal, setPosteModal]       = useState(false)
  const [editingPoste, setEditingPoste]   = useState(null)
  const [posteForm, setPosteForm]         = useState({ nom: '', code: '' })
  const [posteImportModal, setPosteImportModal] = useState(false)
  const [posteImportFile, setPosteImportFile]   = useState(null)
  const [posteImportRows, setPosteImportRows]   = useState(null)
  const [posteImportErrors, setPosteImportErrors] = useState([])
  const [posteImporting, setPosteImporting] = useState(false)
  const posteImportFileRef = useRef()

  // ── Toast ──
  const [toast, setToast]   = useState(null)
  const toastTimerRef       = useRef(null)
  const showToast = (msg, type = 'success') => {
    clearTimeout(toastTimerRef.current)
    setToast({ msg, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }

  // ── Defect code modal ──
  const [defModal, setDefModal]       = useState(false)
  const [defEditCod, setDefEditCod]   = useState(null)
  const [defForm, setDefForm]         = useState({ cod: '', description: '', demerite: 0, delai: '' })
  const [defImportModal, setDefImportModal] = useState(false)
  const [defImportRows, setDefImportRows] = useState(null)
  const [defImportFile, setDefImportFile] = useState(null)
  const defImportFileRef = useRef()

  // ── Load projects ──
  const loadProjects = useCallback(() => {
    setLoading(true)
    setError('')
    projectsApi.getProjects()
      .then(d => {
        const raw = d?.projects || []
        const seen = new Set()
        setProjects(raw.filter(p => {
          const k = (p.name || '').toUpperCase()
          if (seen.has(k)) return false
          seen.add(k)
          return true
        }))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // ── Load defect codes ──
  const loadDefCodes = useCallback(() => {
    setDefLoading(true)
    lookupApi.defCodesList()
      .then(d => {
        const raw = Array.isArray(d) ? d : (d?.defCodes || [])
        const seen = new Set()
        setDefCodes(raw.filter(item => {
          if (seen.has(item.cod)) return false
          seen.add(item.cod)
          return true
        }))
      })
      .catch(() => setDefCodes([]))
      .finally(() => setDefLoading(false))
  }, [])

  // ── Load postes ──
  const loadPostes = useCallback(() => {
    setPostesLoading(true)
    postesApi.getAll()
      .then(d => setPostes(Array.isArray(d) ? d : []))
      .catch(() => setPostes([]))
      .finally(() => setPostesLoading(false))
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])

  useEffect(() => {
    if (tab === 'defcodes' && defCodes.length === 0) loadDefCodes()
    if (tab === 'postes') loadPostes()
    if (tab === 'messages' || tab === 'checkpoints') {
      setMetadataLoading(true)
      setMetadataError('')
      const loadMetadata = tab === 'messages'
        ? projectsApi.getAllRefMessages().then(d => setMetadataMessages(d?.messages || []))
        : projectsApi.getAllRefCheckpoints().then(d => setMetadataCheckpoints(d?.checkpoints || []))
      loadMetadata
        .catch(e => setMetadataError(apiErr(e)))
        .finally(() => setMetadataLoading(false))
    }
  }, [tab]) // eslint-disable-line

  const loadRefs = (name, page = 1) => {
    setRefsLoading(true)
    setRefsError('')
    projectsApi.getRefs(name, page, 50)
      .then(d => { setRefs(d?.refs || []); setRefsPag(d?.pagination || {}) })
      .catch(e => { setRefs([]); setRefsError(apiErr(e)) })
      .finally(() => setRefsLoading(false))
  }

  const apiErr = (e) => e.response?.data?.error || e.response?.data?.message || e.message

  const loadMetadataRows = async (type) => {
    if (type === 'messages') {
      const data = await projectsApi.getAllRefMessages()
      setMetadataMessages(data?.messages || [])
    } else {
      const data = await projectsApi.getAllRefCheckpoints()
      setMetadataCheckpoints(data?.checkpoints || [])
    }
  }

  const handleMetadataExcel = async (event, type) => {
    const file = event.target.files?.[0]
    if (!file || !type) return
    event.target.value = ''
    setSaving(true)
    setMetadataError('')
    try {
      const rows = await parseExcelFile(file)
      const normalize = value => String(value ?? '').toUpperCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '')
      const valueKey = type === 'messages' ? 'MESSAGE' : 'CHECKPOINT'
      const mapped = rows.map((row, index) => {
        const columns = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalize(key), value]))
        const get = (...keys) => {
          for (const key of keys) {
            const value = columns[normalize(key)]
            if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
          }
          return ''
        }
        return {
          project: get('PROJECT_NAME', 'PROJECT', 'PROJET').toUpperCase(),
          pdef: get('PDEF'),
          value: get(valueKey, type === 'messages' ? 'MESSAGE DE VERIFICATION' : 'POINT DE CONTROLE'),
          rowNumber: index + 2,
        }
      })
      const valid = mapped.filter(row => row.project && row.pdef && row.value)
      if (!valid.length) {
        throw new Error(`Aucune ligne valide. Colonnes requises : PROJECT_NAME, PDEF, ${valueKey}.`)
      }

      const groups = new Map()
      for (const row of valid) {
        const key = JSON.stringify([row.project, row.pdef])
        if (!groups.has(key)) groups.set(key, { project: row.project, pdef: row.pdef, values: [] })
        groups.get(key).values.push(row.value)
      }

      let added = 0
      const errors = mapped.filter(row => !row.project || !row.pdef || !row.value)
        .map(row => `Ligne ${row.rowNumber} : projet, PDEF ou ${valueKey} manquant`)
      for (const group of groups.values()) {
        try {
          const existing = type === 'messages'
            ? (await projectsApi.getRefMessages(group.project, group.pdef))?.messages || []
            : (await projectsApi.getRefCheckpoints(group.project, group.pdef))?.checkpoints || []
          const merged = [...existing]
          const known = new Set(existing.map(value => String(value).trim()))
          let groupAdded = 0
          for (const value of group.values) {
            if (!known.has(value)) {
              merged.push(value)
              known.add(value)
              groupAdded++
            }
          }
          if (merged.length !== existing.length) {
            if (type === 'messages') await projectsApi.setRefMessages(group.project, group.pdef, merged)
            else await projectsApi.setRefCheckpoints(group.project, group.pdef, merged)
            added += groupAdded
          }
        } catch (error) {
          errors.push(`${group.project} / ${group.pdef} : ${apiErr(error)}`)
        }
      }

      await loadMetadataRows(type)
      setMetadataError(errors.length ? errors.join(' · ') : '')
      showToast(`${added} élément(s) ajouté(s)${errors.length ? `, ${errors.length} erreur(s)` : ''}`, errors.length ? 'error' : 'success')
    } catch (error) {
      setMetadataError(apiErr(error))
      showToast(apiErr(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const exportMetadataExcel = (type, template = false) => {
    const isMessages = type === 'messages'
    const valueKey = isMessages ? 'MESSAGE' : 'CHECKPOINT'
    const filenamePrefix = isMessages ? 'messages_verification' : 'checkpoints'
    if (template) {
      exportToExcel([{ PROJECT_NAME: '', PDEF: '', [valueKey]: '' }],
        `modele_ajout_${filenamePrefix}.xlsx`, 'Ajout')
      return
    }
    const rows = (isMessages ? metadataMessages : metadataCheckpoints).map(row => ({
      PROJECT_NAME: row.PROJECT_NAME,
      PDEF: row.PDEF,
      [valueKey]: row[valueKey],
    }))
    if (!rows.length) {
      showToast('Aucune donnée à exporter.', 'error')
      return
    }
    exportToExcel(rows, `${filenamePrefix}.xlsx`, isMessages ? 'Messages' : 'Checkpoints')
  }

  const openRefs = (name, isNew = false) => {
    setRefsProject(name); setCreatingRefs(isNew); setRefSubModal(null)
    setRefs([]); setRefsPag({ total: 0, page: 1, limit: 50, pages: 1 })
    setRefsExcelRows(null); setRefsExcelFile(null); setFormError('')
    setRefsSearch(''); clearRefSelection()
    loadRefs(name, 1); setRefsModal(true)
  }

  const closeRefs = () => {
    if (saving || exportingRefs || bulkDeleting) return
    setRefsModal(false); setRefSubModal(null); setCreatingRefs(false)
    loadProjects()
  }

  // ── Project CRUD ──
  const handleCreate = async () => {
    if (createPendingRef.current) return
    const name = newName.trim()
    if (!name) { setFormError('Nom requis'); return }
    if (!/^[A-Z][A-Z0-9_]{0,19}$/.test(name)) {
      setFormError('Nom invalide : doit commencer par une lettre, utiliser lettres majuscules / chiffres / _ uniquement')
      return
    }
    createPendingRef.current = true
    setSaving(true); setFormError('')
    try {
      const length = newBarcodeLength === '' ? null : Number(newBarcodeLength)
      if (length !== null && (!Number.isInteger(length) || length < 1 || length > 100))
        throw new Error('La longueur doit être un entier entre 1 et 100.')
      if (!validScanRules(newScanRules)) throw new Error('Vérifiez les conditions de scan Délibéra.')
      await projectsApi.create(name, length, newScanRules)
      setAddModal(false); setNewName('')
      openRefs(name, true)
      loadProjects()
    } catch (e) { setFormError(apiErr(e)) }
    finally { createPendingRef.current = false; setSaving(false) }
  }

  const handleRename = async () => {
    const name = renameName.trim()
    if (!name) { setFormError('Nouveau nom requis'); return }
    if (!/^[A-Z][A-Z0-9_]{0,19}$/.test(name)) {
      setFormError('Nom invalide : doit commencer par une lettre, lettres majuscules / chiffres / _ uniquement')
      return
    }
    setSaving(true); setFormError('')
    try {
      await projectsApi.rename(renameProject, name)
      setRenameModal(false); loadProjects()
    } catch (e) { setFormError(apiErr(e)) }
    finally { setSaving(false) }
  }

  const handleDelete = async (name) => {
    if (!confirm(`Supprimer le projet ${name} ?`)) return
    try { await projectsApi.delete(name); loadProjects() }
    catch (e) { alert(apiErr(e)) }
  }

  // ── Excel row mapper ──
  const mapRefRow = (r) => {
    const normalize = (s) => s
      .toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]/g, '')
    const n = {}
    for (const k of Object.keys(r)) n[normalize(k)] = r[k]
    const col = (...keys) => {
      for (const k of keys) {
        if (r[k] !== undefined && r[k] !== null && r[k] !== '') return String(r[k])
        const nk = n[normalize(k)]
        if (nk !== undefined && nk !== null && nk !== '') return String(nk)
      }
      return ''
    }
    const pdef = col('PDEF', 'sap nr.', 'SAP NR', 'SAPNR', 'Sap Nr', 'sap_nr')
    return {
      FAS_ADIENT_PART_NUMBER: col('FAS_ADIENT_PART_NUMBER', 'FAS', 'sap nr.', 'SAP NR', 'FASSAPNR') || pdef,
      PDEF:        pdef,
      DESIGNATION: col('DESIGNATION', 'oem', 'OEM', 'Oem', 'designation', 'Designation', 'description'),
      VERSION:     col('VERSION', 'Version', 'version'),
      REF_DETAIL:  col('REF_DETAIL', 'Coiffe', 'COIFFE', 'coiffe', 'REF DETAIL', 'Ref Detail', 'REF', 'REFDETAIL'),
      LIGNE:       col('LIGNE', 'Ligne', 'ligne'),
    }
  }

  const handleRefsExcel = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setRefsExcelRows(null); setRefsExcelFile(null); setFormError('')
    try {
      const rows = await parseExcelFile(file)
      const mapped = rows.filter(row => Object.values(row).some(value => String(value ?? '').trim())).map(mapRefRow)
      if (mapped.length === 0) throw new Error('Aucune référence trouvée. Utilisez le modèle Excel avec une colonne PDEF.')
      if (mapped.some(r => !r.PDEF.trim())) throw new Error('Chaque référence doit avoir un PDEF. Corrigez le fichier avant de l’importer.')
      setRefsExcelRows(mapped); setRefsExcelFile(file)
    } catch (e) { setFormError(`Lecture du fichier impossible : ${apiErr(e)}`) }
    e.target.value = ''
  }

  const handleImportRefs = async () => {
    if (refsSavingRef.current || !refsExcelRows || refsExcelRows.length === 0) return
    refsSavingRef.current = true
    setSaving(true); setFormError('')
    try {
      const r = await projectsApi.upsertRefs(refsProject, refsExcelRows)
      if (r.errors > 0) {
        setFormError(`Import partiel : ${r.inserted} ajouté(s), ${r.updated} mis à jour, ${r.errors} erreur(s). Vérifiez le fichier avant de réessayer.`)
        loadRefs(refsProject, 1)
        return
      }
      showToast(`Import terminé : ${r.inserted} ajouté(s), ${r.updated} mis à jour`)
      setRefSubModal(null); setRefsExcelRows(null); setRefsExcelFile(null)
      loadRefs(refsProject, 1)
    } catch (e) { setFormError(apiErr(e)) }
    finally { refsSavingRef.current = false; setSaving(false) }
  }

  const handleExportRefs = async () => {
    setExportingRefs(true)
    try {
      const d = await projectsApi.getRefs(refsProject, 1, 1000)
      const allRefs = [...d.refs]
      for (let page = 2; page <= d.pagination.pages; page++) {
        const next = await projectsApi.getRefs(refsProject, page, 1000)
        allRefs.push(...next.refs)
      }
      // Option A — convertir toutes les valeurs en string avant SheetJS
      const rows = allRefs.map(r => ({
        'PDEF':        String(r.PDEF        ?? ''),
        'FAS':         String(r.FAS_ADIENT_PART_NUMBER ?? ''),
        'DESIGNATION': String(r.DESIGNATION ?? ''),
        'VERSION':     String(r.VERSION     ?? ''),
        'REF_DETAIL':  String(r.REF_DETAIL  ?? ''),
        'LIGNE':       String(r.LIGNE       ?? ''),
      }))
      const ws = XLSX.utils.json_to_sheet(rows, { header: REF_HEADERS })
      // Option B — forcer chaque cellule en type 's' pour éviter l'arrondi Excel
      Object.keys(ws).forEach(addr => {
        if (addr.startsWith('!')) return
        const cell = ws[addr]
        if (cell && cell.v !== undefined) {
          cell.t = 's'
          cell.v = String(cell.v)
          delete cell.w
        }
      })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, refsProject)
      const today = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `Refs_${refsProject}_${today}.xlsx`)
      showToast('Export Excel généré avec succès')
    } catch (e) {
      showToast(`Erreur lors de l'export : ${apiErr(e)}`, 'error')
    } finally {
      setExportingRefs(false)
    }
  }

  const handleRefTemplate = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([REF_HEADERS]), 'References')
    XLSX.writeFile(wb, 'Modele_references.xlsx')
  }

  // ── Ref CRUD ──
  const openAddRef = () => {
    refMetadataVersion.current++
    setRefMetadataError('')
    setRefMessagesLoading(false)
    setRefCheckpointsLoading(false)
    setRefForm(EMPTY_REF); setFormError(''); setEditingRef(null); setRefSubModal('add')
    setRefMessages([])
    setRefCheckpoints([])
  }

  const openEditRef = (ref) => {
    const version = ++refMetadataVersion.current
    setRefMetadataError('')
    setRefForm({
      pdef: String(ref.PDEF ?? ''),
      fas: ref.FAS_ADIENT_PART_NUMBER || '',
      designation: ref.DESIGNATION || '',
      version: ref.VERSION || '',
      refDetail: ref.REF_DETAIL || '',
      ligne: ref.LIGNE || '',
    })
    setEditingRef(ref)
    setFormError('')
    setRefSubModal('edit')
    setRefMessages([])
    setRefMessagesLoading(true)
    projectsApi.getRefMessages(refsProject, ref.PDEF)
      .then(d => { if (version === refMetadataVersion.current) setRefMessages(d?.messages || []) })
      .catch(e => { if (version === refMetadataVersion.current) setRefMetadataError('Chargement des messages impossible : ' + apiErr(e)) })
      .finally(() => { if (version === refMetadataVersion.current) setRefMessagesLoading(false) })
    setRefCheckpoints([])
    setRefCheckpointsLoading(true)
    projectsApi.getRefCheckpoints(refsProject, ref.PDEF)
      .then(d => { if (version === refMetadataVersion.current) setRefCheckpoints(d?.checkpoints || []) })
      .catch(e => { if (version === refMetadataVersion.current) setRefMetadataError('Chargement des checkpoints impossible : ' + apiErr(e)) })
      .finally(() => { if (version === refMetadataVersion.current) setRefCheckpointsLoading(false) })
  }

  const handleSaveRef = async () => {
    if (refsSavingRef.current) return
    if (refMessagesLoading || refCheckpointsLoading || refMetadataError) return
    const pdef = String(refForm.pdef ?? '').trim()
    if (!pdef) { setFormError('PDEF est obligatoire'); return }
    refsSavingRef.current = true
    setSaving(true); setFormError('')
    try {
      const payload = {
        PDEF: pdef,
        FAS_ADIENT_PART_NUMBER: refForm.fas,
        DESIGNATION: refForm.designation,
        VERSION: refForm.version,
        REF_DETAIL: refForm.refDetail,
        LIGNE: refForm.ligne,
      }
      if (refSubModal === 'add') {
        await projectsApi.addRef(refsProject, payload)
      } else {
        await projectsApi.updateRef(refsProject, editingRef.ROW_ID, payload)
      }
      const validMessages = refMessages.filter(m => String(m ?? '').trim())
      await projectsApi.setRefMessages(refsProject, pdef, validMessages)
      const validCheckpoints = refCheckpoints.filter(c => String(c ?? '').trim())
      await projectsApi.setRefCheckpoints(refsProject, pdef, validCheckpoints)
      setRefSubModal(null); loadRefs(refsProject, refSubModal === 'add' ? 1 : refsPag.page || 1)
      showToast(refSubModal === 'add' ? 'Référence ajoutée' : 'Référence modifiée')
    } catch (e) { setFormError(apiErr(e)) }
    finally { refsSavingRef.current = false; setSaving(false) }
  }

  const handleDeleteRef = async (ref) => {
    if (!confirm(`Supprimer la référence PDEF "${ref.PDEF}" ?`)) return
    try {
      await projectsApi.deleteRef(refsProject, ref.ROW_ID)
      loadRefs(refsProject, refsPag.page || 1)
    } catch (e) { alert(apiErr(e)) }
  }

  const handleBulkDeleteRefs = async () => {
    if (selectedRefs.size === 0) return
    if (!confirm(`Supprimer ${selectedRefs.size} référence(s) sélectionnée(s) ?`)) return
    setBulkDeleting(true)
    try {
      await projectsApi.bulkDeleteRefs(refsProject, [...selectedRefs])
      clearRefSelection()
      loadRefs(refsProject, refsPag.page || 1)
    } catch (e) { alert(apiErr(e)) }
    finally { setBulkDeleting(false) }
  }

  // ── Poste CRUD ──
  const openAddPoste = () => {
    setEditingPoste(null); setPosteForm({ nom: '', code: '' }); setFormError(''); setPosteModal(true)
  }
  const openEditPoste = (p) => {
    setEditingPoste(p)
    setPosteForm({ nom: p.NOM || p.nom || '', code: p.CODE || p.code || '' })
    setFormError(''); setPosteModal(true)
  }
  const handleSavePoste = async () => {
    if (!posteForm.nom.trim()) { setFormError('Nom requis'); return }
    setSaving(true); setFormError('')
    try {
      if (!editingPoste) await postesApi.create(posteForm.nom, posteForm.code || null)
      else await postesApi.update(editingPoste.ID || editingPoste.id, posteForm.nom, posteForm.code || null)
      setPosteModal(false); loadPostes()
    } catch (e) { setFormError(apiErr(e)) }
    finally { setSaving(false) }
  }
  const handleDeletePoste = async (p) => {
    if (!confirm(`Supprimer le poste "${p.NOM || p.nom}" ?`)) return
    try { await postesApi.delete(p.ID || p.id); loadPostes() }
    catch (e) { alert(apiErr(e)) }
  }

  const handlePosteExcel = async (e) => {
    const file = e.target.files[0]; if (!file) return
    try {
      const rows = await parseExcelFile(file)
      const normalize = value => String(value ?? '').toUpperCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '')
      const mapped = rows.map((row, index) => {
        const columns = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalize(key), value]))
        const get = (...keys) => {
          for (const key of keys) {
            const value = columns[normalize(key)]
            if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
          }
          return ''
        }
        const nom = get('NOM', 'NOM POSTE', 'POSTE', 'NAME') ||
          Object.values(row).map(value => String(value).trim()).find(Boolean) || ''
        return {
          nom,
          code: get('CODE', 'CODE POSTE'),
          rowNumber: index + 2,
        }
      }).filter(row => row.nom)
      if (mapped.length === 0) {
        showToast('Aucune ligne valide. Vérifiez la colonne NOM ou POSTE.', 'error')
        return
      }
      setPosteImportRows(mapped)
      setPosteImportFile(file)
      setPosteImportErrors([])
    } catch (error) {
      showToast(`Erreur lecture fichier Excel : ${error.message}`, 'error')
    } finally {
      e.target.value = ''
    }
  }

  const handleImportPostes = async () => {
    if (!posteImportRows?.length || posteImporting) return
    setPosteImporting(true)
    setPosteImportErrors([])
    let imported = 0
    const errors = []
    const failedRows = []
    try {
      for (const row of posteImportRows) {
        try {
          await postesApi.create(row.nom, row.code || null)
          imported++
        } catch (error) {
          errors.push(`Ligne ${row.rowNumber} (${row.nom}) : ${apiErr(error)}`)
          failedRows.push(row)
        }
      }
      setPosteImportErrors(errors)
      if (errors.length > 0) setPosteImportRows(failedRows)
      loadPostes()
      showToast(`${imported} poste(s) importé(s), ${errors.length} erreur(s)`, errors.length ? 'error' : 'success')
      if (errors.length === 0) {
        setPosteImportModal(false)
        setPosteImportFile(null)
        setPosteImportRows(null)
      }
    } finally {
      setPosteImporting(false)
    }
  }

  const handleExportPostes = () => {
    if (postes.length === 0) {
      showToast('Aucun poste à exporter.', 'error')
      return
    }
    exportToExcel(postes.map(poste => ({
      CODE: String(poste.CODE || poste.code || ''),
      NOM: String(poste.NOM || poste.nom || ''),
    })), 'postes.xlsx', 'Postes')
  }

  // ── Defect code CRUD ──
  const openAddDef = () => {
    setDefEditCod(null); setDefForm({ cod: '', description: '', demerite: 0, delai: '' })
    setFormError(''); setDefModal(true)
  }
  const openEditDef = (d) => {
    setDefEditCod(d.cod); setDefForm({ cod: d.cod, description: d.description || d.description_defaut || '', demerite: d.demerite || 0, delai: d.delaiEcheanceHeures != null ? String(d.delaiEcheanceHeures) : '' })
    setFormError(''); setDefModal(true)
  }
  const handleSaveDef = async () => {
    if (!defForm.cod.trim()) { setFormError('Code requis'); return }
    setSaving(true); setFormError('')
    try {
      const delaiVal = defForm.delai !== '' ? parseInt(defForm.delai) || null : null
      if (!defEditCod) await lookupApi.addDefCode(defForm.cod, defForm.description, defForm.demerite, delaiVal)
      else             await lookupApi.updateDefCode(defForm.cod, defForm.description, defForm.demerite, delaiVal)
      setDefModal(false); loadDefCodes()
    } catch (e) { setFormError(apiErr(e)) }
    finally { setSaving(false) }
  }
  const handleDeleteDef = async (cod) => {
    if (!confirm(`Supprimer le code défaut "${cod}" ?`)) return
    try { await lookupApi.deleteDefCode(cod); loadDefCodes() }
    catch (e) { alert(apiErr(e)) }
  }

  const handleDefCodesExcel = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    try {
      const rows = await parseExcelFile(file)
      const normalize = value => String(value ?? '').toUpperCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '')
      const mapped = rows.map(row => {
        const columns = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalize(key), value]))
        const get = (...names) => {
          for (const name of names) {
            const value = columns[normalize(name)]
            if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
          }
          return ''
        }
        return {
          cod: get('COD', 'CODE', 'CODE DEFAUT', 'DEFECT CODE').toUpperCase(),
          description: get('DESCRIPTION', 'DESCRIPTION DEFAUT', 'DESC'),
          demerite: get('DEMERITE', 'DEMERIT'),
          delaiEcheanceHeures: get('DELAI ECHEANCE HEURES', 'DELAI', 'DELAI HEURES'),
        }
      }).filter(row => row.cod)

      if (mapped.length === 0) {
        showToast('Aucun code valide trouvé. Vérifiez la colonne COD ou CODE.', 'error')
        return
      }
      setDefImportRows(mapped)
      setDefImportFile(file)
      setDefImportModal(true)
    } catch (error) {
      showToast(`Erreur lecture fichier Excel : ${error.message}`, 'error')
    } finally {
      event.target.value = ''
    }
  }

  const handleImportDefCodes = async () => {
    if (!defImportRows?.length) return
    setSaving(true)
    try {
      const result = await lookupApi.importDefCodes(defImportRows)
      const inserted = result?.inserted || 0
      const updated = result?.updated || 0
      const errors = result?.errors || 0
      showToast(`Import terminé : ${inserted} ajouté(s), ${updated} mis à jour, ${errors} erreur(s)`, errors ? 'error' : 'success')
      setDefImportModal(false)
      setDefImportFile(null)
      setDefImportRows(null)
      loadDefCodes()
    } catch (error) {
      showToast(apiErr(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleExportDefCodes = () => {
    if (defCodes.length === 0) {
      showToast('Aucun code défaut à exporter.', 'error')
      return
    }
    const rows = defCodes.map(defect => ({
      COD: String(defect.cod ?? ''),
      DESCRIPTION: String(defect.description || defect.description_defaut || ''),
      DEMERITE: Number(defect.demerite) || 0,
      DELAI_ECHEANCE_HEURES: defect.delaiEcheanceHeures ?? '',
    }))
    exportToExcel(rows, 'codes_defauts.xlsx', 'Codes défauts')
  }

  const rf = (key) => ({ value: refForm[key] || '', onChange: e => setRefForm(f => ({ ...f, [key]: e.target.value })) })

  const filteredRefs = (() => {
    const q = refsSearch.trim().toLowerCase()
    if (!q) return refs
    return refs.filter(r =>
      String(r.PDEF ?? '').toLowerCase().includes(q) ||
      String(r.FAS_ADIENT_PART_NUMBER ?? '').toLowerCase().includes(q) ||
      String(r.DESIGNATION ?? '').toLowerCase().includes(q)
    )
  })()

  return (
    <>
      {/* ── Header ── */}
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar"></div>
          <div className="header-title-group">
            <h2>Projets &amp; Qualité</h2>
            <span className="header-subtitle">Gestion des projets · Codes défauts</span>
          </div>
        </div>
        <div className="header-right">
          <div className="hbadge hbadge-clock">
            <span className="hbadge-clock-dot"></span>
            <span>{new Date().toLocaleTimeString('fr-FR')}</span>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="proj-tabs">
        <button className={`proj-tab${tab === 'projects' ? ' active' : ''}`} onClick={() => setTab('projects')}>
          <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          Projets
        </button>
        <button className={`proj-tab${tab === 'defcodes' ? ' active' : ''}`} onClick={() => setTab('defcodes')}>
          <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Codes Défauts
        </button>
        <button className={`proj-tab${tab === 'postes' ? ' active' : ''}`} onClick={() => setTab('postes')}>
          <svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
          Postes
        </button>
        <button className={`proj-tab${tab === 'checkpoints' ? ' active' : ''}`} onClick={() => setTab('checkpoints')}>
          <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Checkpoints
        </button>
        <button className={`proj-tab${tab === 'messages' ? ' active' : ''}`} onClick={() => setTab('messages')}>
          <svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>
          Messages de vérification
        </button>
      </div>

      {/* ══ PROJECTS PANEL ══ */}
      {tab === 'projects' && (
        <div className="proj-panel">
          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
          <div className="project-guide">
            <ProjectSteps step={1} />
            <p>Créez votre projet, puis ajoutez ses références une par une ou depuis Excel.
              Pour un projet existant, ouvrez ses références pour les gérer ou les exporter.</p>
          </div>
          <div className="table-container">
            <div className="table-header">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <h3 className="table-title">Projets actifs</h3>
                <span className="badge-count">{projects.length}</span>
              </div>
              {canCreateProjects && (
                <div className="table-controls">
                  <button className="add-btn" style={{ background: '#15803d' }} onClick={() => { setNewName(''); setNewBarcodeLength(''); setNewScanRules([emptyScanRule()]); setFormError(''); setAddModal(true) }}>
                    <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Nouveau Projet
                  </button>
                </div>
              )}
            </div>
            <div className="table-wrapper">
              {loading ? <div className="loading"><div className="spinner" /></div> : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 52 }}>#</th>
                      <th>Projet</th>
                      <th>Paramètres projet</th>
                      <th style={{ width: 280, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>Aucun projet</td></tr>
                    )}
                    {projects.map((p, idx) => (
                      <tr key={p.name}>
                        <td style={{ color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                        <td>
                          <div className="project-name-cell">
                            <div className="project-avatar">{p.name.slice(0, 3).toUpperCase()}</div>
                            <span className="project-name-label">{p.name}</span>
                            {p.locked && (
                              <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, marginLeft: 6 }}>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                              </svg>
                            )}
                          </div>
                        </td>
                        <td>
                          <span>{p.barcode_length == null ? 'Défaut non configuré' : `Défaut : ${p.barcode_length} caractères`}</span>
                          {canModifyProjects && <button className="btn-icon" style={{ marginLeft: 10 }}
                            onClick={() => { setLengthProject(p.name); setBarcodeLength(p.barcode_length ?? ''); setFormError('') }}>
                            Régler − / +
                          </button>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            {canModifyProjects && <button className="btn-icon" onClick={() => setPhotoProject(p.name)}>
                              Photos des versions
                            </button>}
                            <button className="btn-icon btn-refs" onClick={() => openRefs(p.name)}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
                              Références
                            </button>
                            {canModifyProjects && !p.locked && (
                              <>
                                <button className="btn-icon btn-edit"
                                  onClick={() => { setRenameProject(p.name); setRenameName(p.name); setFormError(''); setRenameModal(true) }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  Renommer
                                </button>
                                <button className="btn-icon btn-delete" onClick={() => handleDelete(p.name)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                                  Supprimer
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ DEFECT CODES PANEL ══ */}
      {tab === 'defcodes' && (
        <div className="proj-panel">
          <div className="table-container">
            <div className="table-header">
              <h3 className="table-title">
                Codes Défauts
                <span className="badge-count">{defCodes.length}</span>
              </h3>
              {canCreateProjects && (
                <div className="table-controls">
                  <input
                    ref={defImportFileRef}
                    type="file"
                    accept=".xls,.xlsx,.csv"
                    hidden
                    onChange={handleDefCodesExcel}
                  />
                  <button className="add-btn" style={{ background: '#059669' }}
                    onClick={() => defImportFileRef.current?.click()} disabled={saving}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Importer Excel
                  </button>
                  <button className="add-btn" style={{ background: defCodes.length ? '#0f766e' : '#94a3b8' }}
                    onClick={handleExportDefCodes} disabled={defCodes.length === 0}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Exporter Excel
                  </button>
                  <button className="add-btn" style={{ background: '#15803d' }} onClick={openAddDef}>
                    <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Nouveau Code
                  </button>
                </div>
              )}
            </div>
            <div style={{ padding: '8px 16px 0' }}>
              <div className="search-container" style={{ maxWidth: 400 }}>
                <span className="search-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
                <input type="text" className="search-input" placeholder="Rechercher un code ou description…"
                  value={defSearch} onChange={e => setDefSearch(e.target.value)} />
              </div>
            </div>
            <div className="table-wrapper">
              {defLoading ? <div className="loading"><div className="spinner" /></div> : (() => {
                const q = defSearch.trim().toLowerCase()
                const filtered = q ? defCodes.filter(d =>
                  (d.cod || '').toLowerCase().includes(q) ||
                  (d.description || d.description_defaut || '').toLowerCase().includes(q)
                ) : defCodes
                return (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 52 }}>#</th>
                        <th>Code</th>
                        <th>Description</th>
                        <th style={{ width: 100, textAlign: 'right' }}>Démérite</th>
                        <th style={{ width: 80, textAlign: 'center' }}>Délai</th>
                        <th style={{ width: 160, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 && (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>{defCodes.length === 0 ? 'Aucun code défaut' : 'Aucun résultat trouvé'}</td></tr>
                      )}
                      {filtered.map((d, idx) => (
                        <tr key={d.cod}>
                          <td style={{ color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                          <td><strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{d.cod}</strong></td>
                          <td>{d.description || d.description_defaut}</td>
                          <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{d.demerite}</td>
                          <td style={{ textAlign: 'center' }}>
                            {d.delaiEcheanceHeures != null
                              ? <span style={{ fontSize: 11, fontWeight: 700, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 99, padding: '2px 8px' }}>{d.delaiEcheanceHeures}h</span>
                              : <span style={{ color: '#cbd5e1' }}>—</span>
                            }
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {canCreateProjects && (
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button className="btn-icon btn-edit" onClick={() => openEditDef(d)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  Modifier
                                </button>
                                <button className="btn-icon btn-delete" onClick={() => handleDeleteDef(d.cod)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                                  Supprimer
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ══ POSTES PANEL ══ */}
      {tab === 'postes' && (
        <div className="proj-panel">
          <div className="table-container">
            <div className="table-header">
              <h3 className="table-title">
                Postes
                <span className="badge-count">{postes.length}</span>
              </h3>
              <div className="table-controls">
                <button className="add-btn" style={{ background: postes.length ? '#0f766e' : '#94a3b8' }}
                  onClick={handleExportPostes} disabled={postes.length === 0}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Exporter Excel
                </button>
                {canCreateProjects && <>
                  <button className="add-btn" style={{ background: '#059669' }} onClick={() => { setPosteImportFile(null); setPosteImportRows(null); setPosteImportModal(true) }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Importer Excel
                  </button>
                  <button className="add-btn" style={{ background: '#15803d' }} onClick={openAddPoste}>
                    <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Nouveau Poste
                  </button>
                </>}
              </div>
            </div>
            <div style={{ padding: '8px 16px 0' }}>
              <div className="search-container" style={{ maxWidth: 400 }}>
                <span className="search-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
                <input type="text" className="search-input" placeholder="Rechercher un poste…"
                  value={postesSearch} onChange={e => setPostesSearch(e.target.value)} />
              </div>
            </div>
            <div className="table-wrapper">
              {postesLoading ? <div className="loading"><div className="spinner" /></div> : (() => {
                const q = postesSearch.trim().toLowerCase()
                const filtered = q ? postes.filter(p =>
                  (p.NOM || p.nom || '').toLowerCase().includes(q) ||
                  (p.CODE || p.code || '').toLowerCase().includes(q)
                ) : postes
                return (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 52 }}>#</th>
                        <th style={{ width: 120 }}>Code</th>
                        <th>Nom du poste</th>
                        <th style={{ width: 160, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 && (
                        <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>{postes.length === 0 ? 'Aucun poste' : 'Aucun résultat'}</td></tr>
                      )}
                      {filtered.map((p, idx) => (
                        <tr key={p.ID || p.id || idx}>
                          <td style={{ color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                          <td>
                            {(p.CODE || p.code)
                              ? <span style={{ background:'#f0fdf4', color:'#14532d', borderRadius:5, padding:'2px 8px', fontWeight:700, fontFamily:'monospace', fontSize:12 }}>{p.CODE || p.code}</span>
                              : <span style={{ color:'#94a3b8', fontSize:12 }}>—</span>
                            }
                          </td>
                          <td>{p.NOM || p.nom}</td>
                          <td style={{ textAlign: 'right' }}>
                            {canCreateProjects && (
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button className="btn-icon btn-edit" onClick={() => openEditPoste(p)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  Modifier
                                </button>
                                <button className="btn-icon btn-delete" onClick={() => handleDeletePoste(p)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                                  Supprimer
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {(tab === 'checkpoints' || tab === 'messages') && (() => {
        const isCheckpoints = tab === 'checkpoints'
        const rows = isCheckpoints ? metadataCheckpoints : metadataMessages
        const valueKey = isCheckpoints ? 'CHECKPOINT' : 'MESSAGE'
        const query = metadataSearch.trim().toLowerCase()
        const filtered = rows.filter(row =>
          [row.PROJECT_NAME, row.PDEF, row[valueKey]]
            .some(value => String(value ?? '').toLowerCase().includes(query))
        )
        return (
          <div className="proj-panel">
            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">
                  {isCheckpoints ? 'Checkpoints par référence' : 'Messages de vérification par référence'}
                  <span className="badge-count">{rows.length}</span>
                </h3>
                <div className="table-controls">
                  <input
                    ref={metadataImportFileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    hidden
                    onChange={event => handleMetadataExcel(event, isCheckpoints ? 'checkpoints' : 'messages')}
                  />
                  {canModifyProjects && (
                    <>
                      <button className="add-btn" style={{ background: '#059669' }}
                        onClick={() => metadataImportFileRef.current?.click()} disabled={saving || metadataLoading}>
                        Importer Excel
                      </button>
                      <button className="add-btn" style={{ background: '#64748b' }}
                        onClick={() => exportMetadataExcel(tab, true)} disabled={saving}>
                        Modèle d’ajout
                      </button>
                    </>
                  )}
                  <button className="add-btn" style={{ background: rows.length ? '#0f766e' : '#94a3b8' }}
                    onClick={() => exportMetadataExcel(tab)} disabled={rows.length === 0 || saving}>
                    Exporter Excel
                  </button>
                </div>
              </div>
              {metadataError && <div className="alert alert-error" role="alert" style={{ margin: 12 }}>{metadataError}</div>}
              <div style={{ padding: '8px 16px 0' }}>
                <div className="search-container" style={{ maxWidth: 400 }}>
                  <span className="search-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
                  <input type="text" className="search-input"
                    placeholder="Rechercher un projet, PDEF ou texte…"
                    value={metadataSearch} onChange={e => setMetadataSearch(e.target.value)} />
                </div>
              </div>
              <div className="table-wrapper">
                {metadataLoading ? <div className="loading"><div className="spinner" /></div> : (
                  <table>
                    <thead><tr><th>Projet</th><th>PDEF</th><th>{isCheckpoints ? 'Checkpoint' : 'Message de vérification'}</th></tr></thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={3} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                          {metadataError ? 'Impossible de charger les données' : rows.length === 0 ? 'Aucune donnée enregistrée' : 'Aucun résultat trouvé'}
                        </td></tr>
                      ) : filtered.map(row => (
                        <tr key={row.ID}>
                          <td>{row.PROJECT_NAME}</td>
                          <td>{row.PDEF}</td>
                          <td>{row[valueKey]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══ POSTE MODAL ══ */}
      {posteModal && (
        <Modal
          title={editingPoste ? 'Modifier le poste' : 'Nouveau poste'}
          onClose={() => setPosteModal(false)}
          maxWidth={420}
          footer={<ModalBtn onClick={handleSavePoste} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</ModalBtn>}>
          {formError && <div className="alert alert-error">{formError}</div>}
          <ModalField label="Code (optionnel)" hint="Ex: P001, COUT01 — utilisé pour saisie rapide">
            <input type="text" className="form-input" placeholder="Ex: P001"
              value={posteForm.code}
              onChange={e => { setPosteForm(f => ({ ...f, code: e.target.value.toUpperCase() })); setFormError('') }}
              style={{ fontFamily: 'monospace', letterSpacing: 1 }} />
          </ModalField>
          <ModalField label="Nom du poste" required>
            <input type="text" className="form-input" placeholder="Ex: AIRBAG" value={posteForm.nom}
              onChange={e => { setPosteForm(f => ({ ...f, nom: e.target.value })); setFormError('') }} />
          </ModalField>
        </Modal>
      )}

      {/* ══ ADD PROJECT MODAL ══ */}
      {photoProject && <VersionPhotoManager project={photoProject} onClose={() => setPhotoProject(null)} />}
      {addModal && createPortal(
        <Modal title="Étape 1 — Nouveau projet" onClose={() => { if (!saving) setAddModal(false) }} maxWidth={560}
          footer={<>
            <ModalBtn variant="secondary" onClick={() => setAddModal(false)} disabled={saving}>Annuler</ModalBtn>
            <ModalBtn onClick={handleCreate} disabled={saving}>{saving ? 'Création...' : 'Créer et continuer'}</ModalBtn>
          </>}>
          <ProjectSteps step={1} />
          <p className="project-help">Donnez un nom au projet. Ses références seront ajoutées à l’étape suivante.</p>
          {formError && <div className="alert alert-error" role="alert">{formError}</div>}
          <ModalField label="Nom du projet" required>
            <input type="text" className="form-input" aria-label="Nom du projet" placeholder="CAMPO" value={newName} disabled={saving} maxLength={20}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreate() } }}
              onChange={e => { setNewName(e.target.value.toUpperCase()); setFormError('') }} />
          </ModalField>
          <p className="project-help">20 caractères maximum : lettres majuscules, chiffres et _ ; commencez par une lettre.</p>
          <ModalField label="Longueur du scan Firewall / CSL par défaut (modifiable ensuite par version)">
            <BarcodeLengthField value={newBarcodeLength} onChange={setNewBarcodeLength} disabled={saving} />
          </ModalField>
          <ScanRulesEditor rules={newScanRules} onChange={setNewScanRules} disabled={saving} />
        </Modal>, document.body
      )}

      {lengthProject && <ProjectScanSettings project={lengthProject} currentLength={barcodeLength}
        onClose={() => setLengthProject(null)}
        onSaved={() => { setLengthProject(null); loadProjects(); showToast('Conditions de scan enregistrées') }} />}

      {/* ══ RENAME MODAL ══ */}
      {renameModal && (
        <Modal title="Renommer Projet" onClose={() => setRenameModal(false)} maxWidth={480}
          footer={<ModalBtn onClick={handleRename} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</ModalBtn>}>
          {formError && <div className="alert alert-error">{formError}</div>}
          <ModalField label="Nom actuel"><input className="form-input" value={renameProject} disabled /></ModalField>
          <ModalField label="Nouveau nom" required>
            <input className="form-input" value={renameName} onChange={e => { setRenameName(e.target.value.toUpperCase()); setFormError('') }} />
          </ModalField>
        </Modal>
      )}

      {/* ══ REFERENCES MODAL (full CRUD table) ══ */}
      {refsModal && createPortal(
        <Modal
          title={`${creatingRefs ? 'Étape 2 — Références' : 'Références'} — ${refsProject}`}
          accentColor="#15803d"
          onClose={closeRefs}
          footer={<ModalBtn onClick={closeRefs} disabled={saving || exportingRefs || bulkDeleting}>
            {creatingRefs ? 'Terminer' : 'Fermer les références'}
          </ModalBtn>}
          maxWidth={1050}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
            </svg>
          }
        >
          {creatingRefs && <>
            <ProjectSteps step={2} />
            <div className="project-created" role="status">
              <strong>Le projet {refsProject} est créé.</strong>
              <p>Ajoutez vos références une par une ou importez un fichier Excel. Chaque ajout est enregistré immédiatement.
                Vous pouvez terminer maintenant et reprendre depuis « Références ».</p>
            </div>
          </>}
          <p className="project-help">Saisie unitaire ou import Excel : choisissez votre méthode. L’import met à jour les PDEF existants.</p>
          {/* Action bar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="add-btn" style={{ background: '#15803d', fontSize: 13 }} onClick={openAddRef}>
              <svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Ajouter une référence
            </button>
            <button className="add-btn" style={{ background: '#059669', fontSize: 13 }} onClick={() => { setRefsExcelRows(null); setRefsExcelFile(null); setFormError(''); setRefSubModal('import') }}>
              <svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Importer Excel
            </button>
            <button className="btn-icon btn-refs" onClick={handleRefTemplate}>Modèle Excel</button>
            <button className="add-btn"
              style={{ background: (refs.length === 0 || exportingRefs) ? '#94a3b8' : '#059669', fontSize: 13 }}
              onClick={handleExportRefs}
              disabled={refs.length === 0 || exportingRefs}>
              <svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {exportingRefs ? 'Export...' : '⬇ Exporter Excel'}
            </button>
            {selectedRefs.size > 0 && (
              <>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 99, padding: '3px 12px' }}>
                  {selectedRefs.size} sélectionné{selectedRefs.size > 1 ? 's' : ''}
                </span>
                <button className="add-btn" style={{ background: bulkDeleting ? '#94a3b8' : '#dc2626', fontSize: 13 }}
                  onClick={handleBulkDeleteRefs} disabled={bulkDeleting}>
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                  {bulkDeleting ? 'Suppression…' : 'Supprimer sélection'}
                </button>
                <button onClick={clearRefSelection}
                  style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
                  Annuler
                </button>
              </>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>
              {refsPag.total || refs.length} référence(s)
            </span>
          </div>
          {refsError && <div className="alert alert-error" role="alert">
            {refsError} <button className="btn-icon btn-refs" onClick={() => loadRefs(refsProject, refsPag.page || 1)}>Réessayer</button>
          </div>}

          {/* Search bar */}
          <div style={{ position: 'relative' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Rechercher par PDEF, FAS ou Désignation…"
              value={refsSearch}
              onChange={e => setRefsSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7, border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#15803d'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          {/* Refs table */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 420 }}>
            {refsLoading ? (
              <div className="loading"><div className="spinner" /></div>
            ) : (
              <table className="data-table" style={{ margin: 0, minWidth: 700 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8fafc' }}>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox"
                        ref={el => { if (el) el.indeterminate = someRefsSelected }}
                        checked={allRefsSelected}
                        onChange={toggleAllRefs}
                        style={{ cursor: 'pointer' }} />
                    </th>
                    <th style={{ width: 40 }}>#</th>
                    <th>PDEF</th>
                    <th>FAS</th>
                    <th>Désignation</th>
                    <th>Version</th>
                    <th>Réf. Détail</th>
                    <th>Ligne</th>
                    <th style={{ width: 90, textAlign: 'center' }}>Messages</th>
                    <th style={{ width: 90, textAlign: 'center' }}>Checkpoints</th>
                    <th style={{ width: 100, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRefs.length === 0 && (
                    <tr><td colSpan={11} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
                      {refsSearch ? `Aucun résultat pour "${refsSearch}"` : 'Aucune référence'}
                    </td></tr>
                  )}
                  {filteredRefs.map((r, idx) => (
                    <tr key={r.ROW_ID || idx} style={isRefSelected(r) ? { background: '#f0fdf4' } : {}}>
                      <td>
                        <input type="checkbox"
                          checked={isRefSelected(r)}
                          onChange={() => toggleRef(r)}
                          style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={{ color: '#64748b', fontWeight: 600 }}>{(((refsPag.page || 1) - 1) * 50) + idx + 1}</td>
                      <td><code style={{ fontSize: 11 }}>{r.PDEF}</code></td>
                      <td style={{ fontSize: 12 }}>{r.FAS_ADIENT_PART_NUMBER}</td>
                      <td style={{ fontSize: 12 }}>{r.DESIGNATION}</td>
                      <td><span style={{ fontSize: 11, background: '#f0fdf4', color: '#15803d', borderRadius: 20, padding: '2px 8px', fontWeight: 600 }}>{r.VERSION}</span></td>
                      <td style={{ fontSize: 12 }}>{r.REF_DETAIL}</td>
                      <td style={{ fontSize: 12 }}>{r.LIGNE}</td>
                      <td style={{ textAlign: 'center' }}>
                        {(r.MSG_COUNT > 0)
                          ? <span style={{ fontSize: 11, fontWeight: 700, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 99, padding: '2px 8px' }}>
                              {r.MSG_COUNT}
                            </span>
                          : <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>
                        }
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {(r.CHECKPOINT_COUNT > 0)
                          ? <span style={{ fontSize: 11, fontWeight: 700, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 99, padding: '2px 8px' }}>
                              {r.CHECKPOINT_COUNT}
                            </span>
                          : <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>
                        }
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn-icon btn-edit" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => openEditRef(r)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 11, height: 11 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button className="btn-icon btn-delete" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => handleDeleteRef(r)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 11, height: 11 }}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            </div>
          </div>

          {/* Pagination */}
          {(refsPag.pages || 1) > 1 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {Array.from({ length: refsPag.pages || 1 }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => loadRefs(refsProject, p)}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: p === (refsPag.page || 1) ? '#15803d' : '#fff', color: p === (refsPag.page || 1) ? '#fff' : '#475569', cursor: 'pointer', fontSize: 12 }}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </Modal>, document.body
      )}

      {/* ══ ADD / EDIT REF SUB-MODAL ══ */}
      {(refSubModal === 'add' || refSubModal === 'edit') && createPortal(
        <Modal
          title={refSubModal === 'add' ? `Ajouter Référence — ${refsProject}` : `Modifier Référence — ${refsProject}`}
          onClose={() => { if (!saving) setRefSubModal(null) }}
          maxWidth={500}
          footer={
            <>
              <ModalBtn variant="secondary" onClick={() => setRefSubModal(null)} disabled={saving}>Annuler</ModalBtn>
              <ModalBtn onClick={handleSaveRef} disabled={saving || refMessagesLoading || refCheckpointsLoading || !!refMetadataError}>{saving ? 'Enregistrement...' : 'Enregistrer'}</ModalBtn>
            </>
          }
        >
          {formError && <div className="alert alert-error" role="alert">{formError}</div>}
          <ModalField label="PDEF" required>
            <input className="form-input" placeholder="Ex: 735681020X" {...rf('pdef')} />
          </ModalField>
          <ModalField label="FAS (SAP Nr)">
            <input className="form-input" placeholder="Ex: 735681020X" {...rf('fas')} />
          </ModalField>
          <ModalField label="Désignation">
            <input className="form-input" placeholder="Ex: ALCANTARA" {...rf('designation')} />
          </ModalField>
          <ModalField label="Version">
            <input className="form-input" placeholder="Ex: MAX, YOU, Uziris..." {...rf('version')} />
          </ModalField>
          <ModalField label="Réf. Détail">
            <input className="form-input" placeholder="Ex: DAR 40, CAR 100..." {...rf('refDetail')} />
          </ModalField>
          <ModalField label="Ligne">
            <input className="form-input" placeholder="Ex: L1, L2..." {...rf('ligne')} />
          </ModalField>
          <ModalField label="Messages de Vérification">
            {refMetadataError && <div className="alert alert-error" role="alert">{refMetadataError} Fermez puis rouvrez la référence pour réessayer.</div>}
            {refMessagesLoading ? (
              <div style={{ color: '#94a3b8', fontSize: 12, padding: '6px 0' }}>Chargement...</div>
            ) : (
              <div>
                {refMessages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                      className="form-input"
                      placeholder={`Message ${i + 1}...`}
                      value={msg}
                      onChange={e => {
                        const m = [...refMessages]; m[i] = e.target.value; setRefMessages(m)
                      }}
                      style={{ flex: 1 }}
                    />
                    <button type="button"
                      onClick={() => setRefMessages(refMessages.filter((_, j) => j !== i))}
                      style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 6, padding: '0 10px', cursor: 'pointer', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button"
                  onClick={() => setRefMessages([...refMessages, ''])}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0f9ff', border: '1.5px dashed #99f6e4', color: '#0891b2', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, width: '100%', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" style={{ width: 13, height: 13 }} fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Ajouter un message
                </button>
              </div>
            )}
          </ModalField>
          <ModalField label="Checkpoints">
            {refCheckpointsLoading ? (
              <div style={{ color: '#94a3b8', fontSize: 12, padding: '6px 0' }}>Chargement...</div>
            ) : (
              <div>
                {refCheckpoints.map((cp, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                      className="form-input"
                      placeholder={`Checkpoint ${i + 1}...`}
                      value={cp}
                      onChange={e => {
                        const c = [...refCheckpoints]; c[i] = e.target.value; setRefCheckpoints(c)
                      }}
                      style={{ flex: 1 }}
                    />
                    <button type="button"
                      onClick={() => setRefCheckpoints(refCheckpoints.filter((_, j) => j !== i))}
                      style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 6, padding: '0 10px', cursor: 'pointer', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button"
                  onClick={() => setRefCheckpoints([...refCheckpoints, ''])}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdf4', border: '1.5px dashed #bbf7d0', color: '#16a34a', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, width: '100%', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" style={{ width: 13, height: 13 }} fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Ajouter un checkpoint
                </button>
              </div>
            )}
          </ModalField>
        </Modal>, document.body
      )}

      {/* ══ IMPORT EXCEL SUB-MODAL ══ */}
      {refSubModal === 'import' && createPortal(
        <Modal
          title={`Importer Excel — ${refsProject}`}
          onClose={() => { if (!saving) setRefSubModal(null) }}
          maxWidth={460}
          footer={
            <>
              <ModalBtn variant="secondary" onClick={() => setRefSubModal(null)} disabled={saving}>Annuler</ModalBtn>
              <ModalBtn onClick={handleImportRefs} disabled={saving || !refsExcelRows}>
                {saving ? 'Import...' : `Importer${refsExcelRows ? ` (${refsExcelRows.length} lignes)` : ''}`}
              </ModalBtn>
            </>
          }
        >
          {formError && <div className="alert alert-error" role="alert">{formError}</div>}
          <p className="project-help">Importez plusieurs références. Un PDEF déjà présent sera mis à jour, les autres seront ajoutés.</p>
          <ModalBtn variant="secondary" onClick={handleRefTemplate} disabled={saving}>Télécharger le modèle Excel</ModalBtn>
          <ModalField label="Fichier Excel">
            {!refsExcelFile ? (
              <button type="button" className="upload-area" disabled={saving} onClick={() => refsFileRef.current.click()}>Sélectionner un fichier Excel</button>
            ) : (
              <div className="file-chip">{refsExcelFile.name} ({refsExcelRows?.length} lignes)<button disabled={saving} aria-label="Retirer le fichier" onClick={() => { setRefsExcelFile(null); setRefsExcelRows(null); setFormError('') }}>✕</button></div>
            )}
            <input ref={refsFileRef} type="file" accept=".xlsx,.xls,.csv" disabled={saving} hidden onChange={handleRefsExcel} />
          </ModalField>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
            Colonnes attendues : <strong>PDEF</strong> (ou "sap nr."), <strong>FAS</strong>, <strong>DESIGNATION</strong> (ou "oem"), <strong>VERSION</strong>, <strong>REF_DETAIL</strong> (ou "Coiffe"), <strong>LIGNE</strong>
          </div>
        </Modal>, document.body
      )}

      {/* ══ POSTE IMPORT EXCEL MODAL ══ */}
      {posteImportModal && (
        <Modal
          title="Importer des postes — Excel"
          accentColor="#059669"
          onClose={() => { if (!posteImporting) setPosteImportModal(false) }}
          maxWidth={460}
          footer={
            <>
              <ModalBtn variant="secondary" onClick={() => setPosteImportModal(false)} disabled={posteImporting}>Annuler</ModalBtn>
              <ModalBtn variant="success" onClick={handleImportPostes} disabled={posteImporting || !posteImportRows?.length}>
                {posteImporting ? 'Import…' : posteImportRows ? `Importer (${posteImportRows.length} poste${posteImportRows.length > 1 ? 's' : ''})` : 'Importer'}
              </ModalBtn>
            </>
          }
        >
          <ModalField label="Fichier Excel (.xlsx / .xls)" required>
            {!posteImportFile ? (
              <div className="upload-area" onClick={() => posteImportFileRef.current.click()} style={{ cursor: 'pointer' }}>
                📊 Sélectionner un fichier Excel
              </div>
            ) : (
              <div className="file-chip">
                {posteImportFile.name} — <strong>{posteImportRows?.length}</strong> poste{posteImportRows?.length > 1 ? 's' : ''} détecté{posteImportRows?.length > 1 ? 's' : ''}
                <button type="button" onClick={() => { setPosteImportFile(null); setPosteImportRows(null); setPosteImportErrors([]) }}>✕</button>
              </div>
            )}
            <input ref={posteImportFileRef} type="file" accept=".xlsx,.xls" hidden onChange={handlePosteExcel} />
          </ModalField>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Colonnes attendues : <strong>NOM</strong> (ou POSTE) et <strong>CODE</strong> (optionnel). Une ligne par poste.
          </div>
          {posteImportErrors.length > 0 && (
            <div style={{ maxHeight: 150, overflow: 'auto', marginTop: 12, padding: 10, border: '1px solid #fecaca', borderRadius: 8, background: '#fff7f7', color: '#991b1b', fontSize: 12 }}>
              {posteImportErrors.map((error, index) => <div key={`${index}-${error}`}>{error}</div>)}
            </div>
          )}
          {posteImportRows?.length > 0 && posteImportErrors.length === 0 && (
            <div style={{ maxHeight: 160, overflow: 'auto', marginTop: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <table className="data-table" style={{ minWidth: 320, margin: 0 }}>
                <thead><tr><th>Code</th><th>Nom du poste</th></tr></thead>
                <tbody>{posteImportRows.slice(0, 6).map(row => (
                  <tr key={row.rowNumber}><td>{row.code || '—'}</td><td>{row.nom}</td></tr>
                ))}</tbody>
              </table>
              {posteImportRows.length > 6 && <div style={{ padding: 8, color: '#64748b', fontSize: 11 }}>Aperçu des 6 premières lignes sur {posteImportRows.length}.</div>}
            </div>
          )}
        </Modal>
      )}

      {/* ══ DEFECT CODE MODAL ══ */}
      {defModal && (
        <Modal title={defEditCod ? 'Modifier Code Défaut' : 'Ajouter Code Défaut'} onClose={() => setDefModal(false)} maxWidth={420}
          footer={<ModalBtn onClick={handleSaveDef} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</ModalBtn>}>
          {formError && <div className="alert alert-error">{formError}</div>}
          <ModalField label="Code" required>
            <input className="form-input" value={defForm.cod} disabled={!!defEditCod}
              onChange={e => setDefForm(f => ({ ...f, cod: e.target.value.toUpperCase() }))} />
          </ModalField>
          <ModalField label="Description">
            <input className="form-input" value={defForm.description}
              onChange={e => setDefForm(f => ({ ...f, description: e.target.value }))} />
          </ModalField>
          <ModalField label="Démérite">
            <input type="number" className="form-input" value={defForm.demerite}
              onChange={e => setDefForm(f => ({ ...f, demerite: parseInt(e.target.value) || 0 }))} />
          </ModalField>
          <ModalField label="Délai d'échéance (heures)" hint="Optionnel — durée max avant reprise obligatoire">
            <input type="number" className="form-input" placeholder="Ex: 48" min="1" value={defForm.delai}
              onChange={e => setDefForm(f => ({ ...f, delai: e.target.value }))} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {[{ label: '1j', val: 24 }, { label: '2j', val: 48 }, { label: '3j', val: 72 }, { label: '1 sem.', val: 168 }].map(({ label, val }) => (
                <button key={val} type="button"
                  onClick={() => setDefForm(f => ({ ...f, delai: String(val) }))}
                  style={{ padding: '3px 10px', borderRadius: 99, border: '1.5px solid', cursor: 'pointer', fontSize: 11, fontWeight: 700, transition: 'all .15s',
                    borderColor: defForm.delai === String(val) ? '#15803d' : '#e2e8f0',
                    background:  defForm.delai === String(val) ? '#15803d' : '#f8fafc',
                    color:       defForm.delai === String(val) ? '#fff'    : '#64748b' }}>
                  {label}={val}h
                </button>
              ))}
              {defForm.delai && (
                <button type="button" onClick={() => setDefForm(f => ({ ...f, delai: '' }))}
                  style={{ padding: '3px 10px', borderRadius: 99, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                  Effacer
                </button>
              )}
            </div>
          </ModalField>
        </Modal>
      )}

      {defImportModal && (
        <Modal
          title="Importer des codes défauts — Excel"
          accentColor="#059669"
          onClose={() => { setDefImportModal(false); setDefImportRows(null); setDefImportFile(null) }}
          maxWidth={480}
          footer={
            <>
              <ModalBtn variant="secondary" onClick={() => { setDefImportModal(false); setDefImportRows(null); setDefImportFile(null) }}>Annuler</ModalBtn>
              <ModalBtn variant="success" onClick={handleImportDefCodes} disabled={saving || !defImportRows?.length}>
                {saving ? 'Import…' : `Importer${defImportRows ? ` (${defImportRows.length} codes)` : ''}`}
              </ModalBtn>
            </>
          }
        >
          <ModalField label="Fichier Excel (.xlsx, .xls ou .csv)" required>
            {!defImportFile ? (
              <div className="upload-area" onClick={() => defImportFileRef.current?.click()} style={{ cursor: 'pointer' }}>
                Sélectionner le fichier de codes défauts
              </div>
            ) : (
              <div className="file-chip">
                {defImportFile.name} — <strong>{defImportRows?.length}</strong> code(s) détecté(s)
                <button type="button" onClick={() => { setDefImportFile(null); setDefImportRows(null) }}>✕</button>
              </div>
            )}
          </ModalField>
          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
            Colonnes attendues : <strong>COD</strong> (ou CODE), DESCRIPTION, DEMERITE et DELAI_ECHEANCE_HEURES (optionnel).<br/>
            Un code existant sera mis à jour; un nouveau code sera ajouté.
          </div>
        </Modal>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 99999,
          background: toast.type === 'error' ? '#c92a2a' : '#059669',
          color: '#fff', padding: '12px 22px', borderRadius: 10,
          fontSize: 14, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
          animation: 'modal-panel-in 0.18s ease-out forwards',
        }}>
          {toast.msg}
        </div>
      )}
    </>
  )
}