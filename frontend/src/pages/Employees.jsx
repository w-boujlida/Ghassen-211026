import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { employeesApi } from '../api/employees.api.js'
import { lookupApi } from '../api/lookup.api.js'
import { projectsApi } from '../api/projects.api.js'
import { deliberaApi } from '../api/delibera.api.js'
import { operatorsApi } from '../api/operators.api.js'
import Pagination from '../components/Pagination.jsx'
import { debounce, exportToExcel, parseExcelFile } from '../utils/helpers.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import Modal, { ModalBtn, ModalField } from '../components/Modal.jsx'

const EMPTY_EMP = { mat: '', name: '', tampon: '', dateEmbauche: '', projet: 'CSL', equipe: '', equipe2: 'A', supervisor: '' }
const FONCTIONS = ['CSL', 'AUDITRICE', 'FW', 'CONTRÔLE QUALITÉ', 'PRÉP CAMPO', 'APPOLO']
const excelButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #16a34a', background: '#fff', color: '#15803d', cursor: 'pointer', fontSize: 13, fontWeight: 600 }
const excelImportStyle = { ...excelButtonStyle, borderColor: '#cbd5e1', color: '#475569', cursor: 'pointer' }

function excelHeader(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function excelValue(row, aliases) {
  const entries = Object.entries(row || {})
  const aliasKeys = aliases.map(excelHeader)
  const match = entries.find(([key]) => aliasKeys.includes(excelHeader(key)))
  return match ? match[1] : ''
}

function excelText(value) {
  return value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : String(value ?? '').trim()
}

function excelDate(value) {
  const text = excelText(value)
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : text
}

function operatorId(kind, row) {
  return String(kind === 'employees' ? row.mat : kind === 'supervisors' ? row.name : row.id)
}

function operatorName(kind, row) {
  return kind === 'employees' || kind === 'supervisors' ? row.name : row.nom
}

export default function Employees() {
  const { canManageEmployees } = useAuth()
  const [tab, setTab]                     = useState('employees')
  // ── Employees state ──
  const [records, setRecords]             = useState([])
  const [pagination, setPagination]       = useState({ currentPage: 1, totalPages: 1, totalRecords: 0, recordsPerPage: 50 })
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')
  const [page, setPage]                   = useState(1)
  const [filters, setFilters]             = useState({ search: '', projet: '', equipe: '', equipe2: '', supervisor: '' })
  // ── Supervisors state ──
  const [supervisors, setSupervisors]     = useState([])
  const [supLoading, setSupLoading]       = useState(false)
  // ── Projects list (for dropdown) ──
  const [projects, setProjects]           = useState([])
  const [supervisorList, setSupervisorList] = useState([])
  // ── Employee modal ──
  const [modal, setModal]                 = useState(null)
  const [form, setForm]                   = useState(EMPTY_EMP)
  const [saving, setSaving]               = useState(false)
  const [formError, setFormError]         = useState('')
  const [isEditMode, setIsEditMode]       = useState(false)
  // ── Supervisor modal ──
  const [supModal, setSupModal]           = useState(false)
  const [supName, setSupName]             = useState('')
  const [supSaving, setSupSaving]         = useState(false)
  const [supError, setSupError]           = useState('')
  // ── Search states for tabs ──
  const [supSearch, setSupSearch]         = useState('')
  // ── Couturières state ──
  const [couturieres, setCouturieres]           = useState([])
  const [couturieresLoading, setCouturieresLoading] = useState(false)
  const [couturiereSearch, setCouturiereSearch] = useState('')
  const [couturiereProjetFilter, setCouturiereProjetFilter] = useState('')
  const [couturiereModal, setCouturiereModal]   = useState(null) // null | 'add' | 'edit'
  const [couturiereForm, setCouturiereForm]     = useState({ matricule: '', nom: '', projet: '', equipe: 'A', actif: 1 })
  const [couturiereEditing, setCouturiereEditing] = useState(null)
  const [couturiereSaving, setCouturiereSaving] = useState(false)
  const [couturiereError, setCouturiereError]   = useState('')
  const [selectedRows, setSelectedRows] = useState([])
  const [selectingAll, setSelectingAll] = useState(false)
  const [bulkModal, setBulkModal] = useState(null)
  const [bulkChanges, setBulkChanges] = useState({})
  const [bulkNames, setBulkNames] = useState({})
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const [bulkNotice, setBulkNotice] = useState('')
  const [preservedTampons, setPreservedTampons] = useState([])
  const selectionVersion = useRef(0)
  const employeeLoadVersion = useRef(0)
  const couturiereLoadVersion = useRef(0)

  useEffect(() => {
    selectionVersion.current++
    setSelectedRows([])
    setSelectingAll(false)
    setBulkModal(null)
    setBulkNotice('')
    setPreservedTampons([])
    setBulkError('')
  }, [tab, filters, supSearch, couturiereSearch, couturiereProjetFilter])

  const filteredSupervisors = supervisors
    .map(s => typeof s === 'string' ? { name: s } : s)
    .filter(s => s.name.toLowerCase().includes(supSearch.trim().toLowerCase()))
  const filteredCouturieres = couturieres.filter(c => {
    const q = couturiereSearch.trim().toLowerCase()
    return c.nom.toLowerCase().includes(q) || c.matricule.toLowerCase().includes(q)
  })
  const visibleRows = tab === 'employees' ? records : tab === 'supervisors'
    ? filteredSupervisors : filteredCouturieres
  const selectedIds = new Set(selectedRows.map(row => operatorId(tab, row)))
  const allMatchingSelected = selectedRows.length > 0
    && selectedRows.length === (tab === 'employees' ? pagination.totalRecords : visibleRows.length)
    && visibleRows.every(row => selectedIds.has(operatorId(tab, row)))
  const selectionBusy = selectingAll || bulkSaving
  const tabLoading = tab === 'employees' ? loading : tab === 'supervisors'
    ? supLoading : couturieresLoading

  const toggleRow = (row) => {
    const id = operatorId(tab, row)
    setSelectedRows(current => current.some(item => operatorId(tab, item) === id)
      ? current.filter(item => operatorId(tab, item) !== id) : [...current, row])
  }

  const selectAllFiltered = async () => {
    const version = selectionVersion.current
    setSelectingAll(true)
    setBulkNotice('')
    setPreservedTampons([])
    try {
      const rows = tab === 'employees' ? await employeesApi.getSelection(filters) : visibleRows
      if (version === selectionVersion.current) {
        setSelectedRows([...new Map(rows.map(row => [operatorId(tab, row), row])).values()])
      }
    } catch (e) {
      if (version === selectionVersion.current) alert(e.response?.data?.error || e.message)
    } finally {
      if (version === selectionVersion.current) setSelectingAll(false)
    }
  }

  const openBulk = (action) => {
    setBulkNotice('')
    setPreservedTampons([])
    setBulkChanges({})
    setBulkNames(Object.fromEntries(selectedRows.map(row => [operatorId(tab, row), operatorName(tab, row)])))
    setBulkError('')
    setBulkModal(action === 'update' && tab === 'supervisors' ? 'rename' : action)
  }

  const saveBulk = async () => {
    setBulkSaving(true)
    setBulkError('')
    try {
      const result = await operatorsApi.bulk(tab, {
        action: bulkModal,
        ids: selectedRows.map(row => operatorId(tab, row)),
        changes: bulkModal === 'update' ? bulkChanges : undefined,
        names: bulkModal === 'rename' ? bulkNames : undefined,
      })
      setSelectedRows([])
      setBulkModal(null)
      const preserved = result.preserved || []
      setPreservedTampons(preserved)
      setBulkNotice(`${result.affected} élément(s) ${bulkModal === 'delete' ? 'supprimé(s)' : 'modifié(s)'}.${
        preserved.length > 0 ? ` ${preserved.length} tampon(s) affecté(s) conservé(s). Aucune affectation n’a été modifiée.` : ''}`)
      if (tab === 'employees' && bulkModal === 'delete') setPage(1)
      loadData()
      loadSupervisors()
      if (tab === 'couturieres') loadCouturieres()
      const list = await lookupApi.supervisorsList()
      setSupervisorList(Array.isArray(list) ? list : (list?.supervisors || []))
    } catch (e) {
      setBulkError(e.response?.data?.error || e.response?.data?.message || e.message)
    } finally {
      setBulkSaving(false)
    }
  }

  const commonFields = tab === 'employees' ? [
    { key: 'projet', label: 'Fonction', options: FONCTIONS },
    { key: 'equipe', label: 'Projet', options: projects.map(p => p.name) },
    { key: 'equipe2', label: 'Équipe', options: ['A', 'B'] },
    { key: 'supervisor', label: 'Superviseur', options: supervisorList.map(s => typeof s === 'string' ? s : s.name) },
    { key: 'dateEmbauche', label: "Date d'embauche", type: 'date' },
  ] : [
    { key: 'projet', label: 'Projet', options: projects.map(p => p.name) },
    { key: 'equipe', label: 'Équipe', options: ['A', 'B'] },
    { key: 'actif', label: 'Statut', options: [{ value: '1', label: 'Actif' }, { value: '0', label: 'Inactif' }] },
  ]

  const selectionControls = canManageEmployees && (
    <>
      <button type="button" style={excelImportStyle} disabled={selectionBusy || tabLoading}
        onClick={selectAllFiltered}>{selectingAll ? 'Sélection...' : 'Tout sélectionner (résultats filtrés)'}</button>
      {selectedRows.length > 0 && <>
        <span role="status">{selectedRows.length} sélectionné(s)</span>
        <button type="button" className="btn-icon btn-edit" disabled={selectionBusy} onClick={() => openBulk('update')}>Modifier la sélection</button>
        <button type="button" className="btn-icon btn-edit" disabled={selectionBusy} onClick={() => openBulk('rename')}>Renommer</button>
        <button type="button" className="btn-icon btn-delete" disabled={selectionBusy} onClick={() => openBulk('delete')}>Supprimer la sélection</button>
        <button type="button" style={excelImportStyle} disabled={selectionBusy} onClick={() => setSelectedRows([])}>Désélectionner</button>
      </>}
    </>
  )

  const selectionHeader = canManageEmployees && (
    <th>
      <input type="checkbox" aria-label="Sélectionner tous les résultats filtrés"
        checked={allMatchingSelected}
        ref={input => { if (input) input.indeterminate = selectedRows.length > 0 && !allMatchingSelected }}
        disabled={selectionBusy || tabLoading}
        onChange={e => e.target.checked ? selectAllFiltered() : setSelectedRows([])} />
    </th>
  )

  const selectionCell = (row) => canManageEmployees && (
    <td>
      <input type="checkbox" aria-label={`Sélectionner ${operatorName(tab, row)} (${operatorId(tab, row)})`}
        disabled={selectionBusy} checked={selectedIds.has(operatorId(tab, row))} onChange={() => toggleRow(row)} />
    </td>
  )

  // Load employees
  const loadData = useCallback(() => {
    const version = ++employeeLoadVersion.current
    setLoading(true)
    employeesApi.getAll({ page, limit: 50, ...filters })
      .then(d => {
        if (version !== employeeLoadVersion.current) return
        setRecords(d.records || [])
        setPagination(d.pagination || {})
        setError('')
      })
      .catch(e => { if (version === employeeLoadVersion.current) setError(e.message) })
      .finally(() => { if (version === employeeLoadVersion.current) setLoading(false) })
  }, [page, filters])

  // Load supervisors tab
  const loadSupervisors = useCallback(() => {
    setSupLoading(true)
    lookupApi.supervisorsList()
      .then(d => setSupervisors(Array.isArray(d) ? d : (d?.supervisors || [])))
      .catch(e => setBulkError('Chargement des superviseurs : ' + (e.response?.data?.error || e.message)))
      .finally(() => setSupLoading(false))
  }, [])

  // Load dropdowns on mount
  useEffect(() => {
    projectsApi.getProjects()
      .then(d => setProjects(d?.projects || []))
      .catch(() => setProjects([]))
    lookupApi.supervisorsList()
      .then(d => setSupervisorList(Array.isArray(d) ? d : (d?.supervisors || [])))
      .catch(() => setSupervisorList([]))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const loadCouturieres = useCallback(() => {
    const version = ++couturiereLoadVersion.current
    setCouturieresLoading(true)
    deliberaApi.getCouturieres({ projet: couturiereProjetFilter || undefined })
      .then(d => { if (version === couturiereLoadVersion.current) setCouturieres(Array.isArray(d) ? d : []) })
      .catch(e => { if (version === couturiereLoadVersion.current) alert(e.response?.data?.error || e.message) })
      .finally(() => { if (version === couturiereLoadVersion.current) setCouturieresLoading(false) })
  }, [couturiereProjetFilter])

  useEffect(() => {
    if (tab === 'supervisors' && supervisors.length === 0) loadSupervisors()
    if (tab === 'couturieres') loadCouturieres()
  }, [tab, loadCouturieres]) // eslint-disable-line

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSearch = useCallback(debounce(v => {
    setFilters(f => ({ ...f, search: v }))
    setPage(1)
  }, 400), [])

  const setFilter = (key, val) => { setFilters(f => ({ ...f, [key]: val })); setPage(1) }

  // Employee CRUD
  const openAdd = () => {
    setForm(EMPTY_EMP); setFormError(''); setIsEditMode(false)
    setModal('add')
  }
  const openEdit = (emp) => {
    setForm({ mat: emp.mat, name: emp.name, tampon: emp.tampon || '',
      dateEmbauche: emp.dateEmbauche || '', projet: emp.projet || 'CSL',
      equipe: emp.equipe || '', equipe2: emp.equipe2 || 'A', supervisor: emp.supervisor || '' })
    setFormError(''); setIsEditMode(true)
    setModal('edit')
  }

  const handleSave = async () => {
    if (!form.mat || !form.name) { setFormError('Matricule et nom sont requis'); return }
    if (!form.tampon.trim()) { setFormError('Code tampon requis'); return }
    setSaving(true); setFormError('')
    try {
      const empData = { ...form, tampon: form.tampon.trim().toUpperCase() }
      if (!isEditMode) {
        await employeesApi.create(empData)
      } else {
        await employeesApi.update(empData)
      }
      setSelectedRows([])
      setModal(null); loadData()
    } catch (e) { setFormError(e.response?.data?.error || e.response?.data?.message || e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (mat) => {
    if (!confirm(`Supprimer l'opérateur ${mat} ?`)) return
    try { await employeesApi.delete(mat); setSelectedRows([]); loadData() }
    catch (e) { alert(e.response?.data?.error || e.message) }
  }

  // Supervisor CRUD
  const handleAddSup = async () => {
    if (!supName.trim()) { setSupError('Nom requis'); return }
    setSupSaving(true); setSupError('')
    try {
      await lookupApi.addSupervisor(supName.trim())
      setSelectedRows([])
      setSupModal(false); setSupName(''); loadSupervisors()
      lookupApi.supervisorsList().then(d => setSupervisorList(Array.isArray(d) ? d : (d?.supervisors || [])))
    } catch (e) { setSupError(e.response?.data?.error || e.response?.data?.message || e.message) }
    finally { setSupSaving(false) }
  }

  const handleDeleteSup = async (name) => {
    if (!confirm(`Supprimer le superviseur "${name}" ?`)) return
    try { await lookupApi.deleteSupervisor(name); setSelectedRows([]); loadSupervisors() }
    catch (e) { alert(e.message) }
  }

  // Couturière CRUD
  const openAddCouturiere = () => {
    setCouturiereForm({ matricule: '', nom: '', projet: '', equipe: 'A', actif: 1 })
    setCouturiereError(''); setCouturiereEditing(null); setCouturiereModal('add')
  }
  const openEditCouturiere = (c) => {
    setCouturiereForm({ matricule: c.matricule, nom: c.nom, projet: c.projet || '', equipe: c.equipe || 'A', actif: c.actif ?? 1 })
    setCouturiereError(''); setCouturiereEditing(c); setCouturiereModal('edit')
  }
  const handleSaveCouturiere = async () => {
    if (!couturiereForm.matricule.trim()) { setCouturiereError('Matricule requis'); return }
    if (!couturiereForm.nom.trim())       { setCouturiereError('Nom requis'); return }
    setCouturiereSaving(true); setCouturiereError('')
    try {
      if (couturiereModal === 'add') {
        await deliberaApi.createCouturiere(couturiereForm)
      } else {
        await deliberaApi.updateCouturiere(couturiereEditing.id, couturiereForm)
      }
      setSelectedRows([])
      setCouturiereModal(null); loadCouturieres()
    } catch (e) {
      setCouturiereError(e.response?.data?.error || e.response?.data?.message || e.message)
    } finally { setCouturiereSaving(false) }
  }
  const handleDeleteCouturiere = async (c) => {
    if (!confirm(`Supprimer la couturière "${c.nom}" ?`)) return
    try { await deliberaApi.deleteCouturiere(c.id); setSelectedRows([]); loadCouturieres() }
    catch (e) { alert(e.response?.data?.error || e.message) }
  }
  const [exporting, setExporting] = useState(false)
  const [importingTab, setImportingTab] = useState('')

  const handleExport = async () => {
    setExporting(true)
    try {
      const data = await employeesApi.exportAll(filters)
      const rows = (data.records || []).map((emp, idx) => {
        return {
          '#': idx + 1,
          'Matricule': emp.mat,
          'Nom': emp.name,
          'Tampon': emp.tampon || '',
          'Date Embauche': emp.dateEmbauche || '',
          'Fonction': emp.projet || '',
          'Projet': emp.equipe || '',
          'Équipe': emp.equipe2 || '',
          'Superviseur': emp.supervisor || '',
        }
      })
      const parts = []
      if (filters.equipe) parts.push(filters.equipe)
      if (filters.equipe2) parts.push(`Eq${filters.equipe2}`)
      if (filters.projet) parts.push(filters.projet)
      if (filters.supervisor) parts.push(filters.supervisor)
      const suffix = parts.length ? `_${parts.join('_')}` : ''
      exportToExcel(rows, `Employes${suffix}.xlsx`, 'Employés', 'employees')
    } catch (e) {
      alert('Erreur export : ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  const handleExportSupervisors = () => {
    const rows = supervisors.map(s => ({
      'Nom superviseur': typeof s === 'string' ? s : s.name,
    }))
    exportToExcel(rows, 'Superviseurs.xlsx', 'Superviseurs', 'operators')
  }

  const handleExportCouturieres = () => {
    const rows = couturieres.map(c => ({
      Matricule: c.matricule,
      Nom: c.nom,
      Projet: c.projet || '',
      Équipe: c.equipe || '',
      Actif: c.actif === 1 ? 'Oui' : 'Non',
    }))
    exportToExcel(rows, 'Couturieres.xlsx', 'Couturières', 'operators')
  }

  const handleImportExcel = async (event, kind) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImportingTab(kind)
    try {
      const parsed = await parseExcelFile(file)
      const sourceRows = parsed.filter(row => Object.values(row).some(value => String(value ?? '').trim()))
      if (sourceRows.length === 0) throw new Error('Le fichier ne contient aucune ligne à importer')

      let result
      if (kind === 'employees') {
        const rows = sourceRows.map(row => ({
          mat: excelText(excelValue(row, ['Matricule', 'MAT'])),
          name: excelText(excelValue(row, ['Nom', 'Nom complet', 'NAME'])),
          dateEmbauche: excelDate(excelValue(row, ['Date Embauche', 'Date embauche', 'Date de recrutement'])),
          projet: excelText(excelValue(row, ['Fonction', 'Fonction projet', 'Poste'])),
          equipe: excelText(excelValue(row, ['Projet équipe', 'Projet'])),
          equipe2: excelText(excelValue(row, ['Équipe', 'Équipe 2', 'Shift'])),
          supervisor: excelText(excelValue(row, ['Superviseur', 'Supervisor'])),
          tampons: excelText(excelValue(row, ['Tampon(s)', 'Tampons', 'Tampon']))
            .split(/[,;|]/).map(code => code.trim()).filter(code => code && code !== '—' && code !== '-'),
        }))
        const invalidRow = rows.findIndex(row => !row.mat || !row.name)
        if (invalidRow !== -1) throw new Error(`Ligne ${invalidRow + 2} : matricule et nom obligatoires`)
        result = await employeesApi.importAll(rows)
        loadData()
      } else if (kind === 'supervisors') {
        const names = sourceRows.map(row => excelText(excelValue(row, ['Nom superviseur', 'Superviseur', 'Nom', 'Name'])))
        const invalidRow = names.findIndex(name => !name)
        if (invalidRow !== -1) throw new Error(`Ligne ${invalidRow + 2} : nom de superviseur obligatoire`)
        result = await lookupApi.importSupervisors(names)
        loadSupervisors()
        lookupApi.supervisorsList().then(d => setSupervisorList(Array.isArray(d) ? d : (d?.supervisors || [])))
      } else {
        const rows = sourceRows.map(row => ({
          MATRICULE: excelText(excelValue(row, ['Matricule', 'MATRICULE'])),
          NOM: excelText(excelValue(row, ['Nom', 'Nom complet', 'NOM'])),
          PROJET: excelText(excelValue(row, ['Projet', 'PROJET'])),
          EQUIPE: excelText(excelValue(row, ['Équipe', 'EQUIPE'])),
          ACTIF: excelText(excelValue(row, ['Actif', 'ACTIF'])) || 'Oui',
        }))
        const invalidRow = rows.findIndex(row => !row.MATRICULE || !row.NOM)
        if (invalidRow !== -1) throw new Error(`Ligne ${invalidRow + 2} : matricule et nom obligatoires`)
        result = await deliberaApi.importCouturieres(rows)
        loadCouturieres()
      }

      const inserted = result?.inserted ?? sourceRows.length
      const skipped = result?.skipped ?? 0
      setSelectedRows([])
      alert(`Import terminé : ${inserted} ligne(s) ajoutée(s), ${skipped} ignorée(s) (déjà existante(s)).`)
    } catch (err) {
      alert('Erreur import : ' + (err.response?.data?.error || err.response?.data?.message || err.message))
    } finally {
      setImportingTab('')
      event.target.value = ''
    }
  }

  const f = (key) => ({ value: form[key] || '', onChange: e => setForm(p => ({ ...p, [key]: e.target.value })) })

  return (
    <>
      {/* ── Header ── */}
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar"></div>
          <div className="header-title-group">
            <h2>Gestion des Opérateurs</h2>
            <span className="header-subtitle">Employés · Superviseurs · Couturières</span>
          </div>
        </div>
        <div className="header-right">
          <div className="hbadge hbadge-clock">
            <span className="hbadge-clock-dot"></span>
            <span id="hLiveClock">{new Date().toLocaleTimeString('fr-FR')}</span>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="emp-tabs">
        <button className={`emp-tab${tab === 'employees' ? ' active' : ''}`} onClick={() => setTab('employees')}>
          <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          Employés
          <span className="badge-count">{pagination.totalRecords}</span>
        </button>
        <button className={`emp-tab${tab === 'supervisors' ? ' active' : ''}`} onClick={() => setTab('supervisors')}>
          <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Superviseurs
          <span className="badge-count">{supervisors.length}</span>
        </button>
        <button className={`emp-tab${tab === 'couturieres' ? ' active' : ''}`} onClick={() => setTab('couturieres')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M8 12h8M12 8v8"/></svg>
          Couturières
          <span className="badge-count">{couturieres.length}</span>
        </button>
      </div>

      {bulkNotice && <div className="alert alert-success" role="status"
        style={preservedTampons.length > 0 ? { background: '#fffbeb', color: '#92400e', borderColor: '#fcd34d' } : undefined}>
        {bulkNotice}
        {preservedTampons.length > 0 && <details style={{ marginTop: 8 }}>
          <summary>Tampons conservés ({preservedTampons.length})</summary>
          <ul style={{ maxHeight: 240, overflowY: 'auto' }}>
            {preservedTampons.map(tampon => <li key={tampon.id}>
              {tampon.code} — {tampon.matricule ? `affecté au matricule ${tampon.matricule}` : 'affectation existante dans la fiche employé'}
            </li>)}
          </ul>
        </details>}
      </div>}
      {!bulkModal && bulkError && <div className="alert alert-error" role="alert">{bulkError}</div>}

      {/* ══ EMPLOYEES PANEL ══ */}
      {tab === 'employees' && (
        <div className="emp-panel active">
          <div className="table-container">
            <div className="table-header">
              <h3 className="table-title">
                Employés
                <span className="badge-count" style={{ marginLeft: 8 }}>{pagination.totalRecords}</span>
              </h3>
              <div className="table-controls">
                {selectionControls}
                <div className="filters">
                  <select className="filter-select" value={filters.equipe} onChange={e => setFilter('equipe', e.target.value)}>
                    <option value="">Tous les projets</option>
                    {projects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </select>
                  <select className="filter-select" value={filters.equipe2} onChange={e => setFilter('equipe2', e.target.value)}>
                    <option value="">Toutes les équipes</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                  </select>
                  <select className="filter-select" value={filters.projet} onChange={e => setFilter('projet', e.target.value)}>
                    <option value="">Toutes les fonctions</option>
                    {FONCTIONS.map(fn => <option key={fn} value={fn}>{fn}</option>)}
                  </select>
                  <select className="filter-select" value={filters.supervisor} onChange={e => setFilter('supervisor', e.target.value)}>
                    <option value="">Tous les superviseurs</option>
                    {supervisorList.map(s => {
                      const n = typeof s === 'string' ? s : s.name
                      return <option key={n} value={n}>{n}</option>
                    })}
                  </select>
                  <div className="search-container" style={{ marginLeft: 4 }}>
                    <span className="search-icon">
                      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </span>
                    <input type="text" className="search-input" placeholder="Rechercher…" onChange={e => handleSearch(e.target.value)} />
                  </div>
                </div>
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  style={{ ...excelButtonStyle, background: exporting ? '#f0fdf4' : '#fff', cursor: exporting ? 'not-allowed' : 'pointer' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {exporting ? 'Export...' : 'Export Excel'}
                </button>
                {canManageEmployees && (
                  <>
                    <label style={excelImportStyle}>
                      {importingTab === 'employees' ? 'Import...' : 'Import Excel'}
                      <input type="file" accept=".xlsx,.xls,.csv" hidden disabled={!!importingTab}
                        onChange={e => handleImportExcel(e, 'employees')} />
                    </label>
                    <button className="add-btn" onClick={openAdd}>
                      <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Ajouter
                    </button>
                  </>
                )}
              </div>
            </div>

            {error && <div className="alert alert-error" style={{ margin: '8px 16px' }}>{error}</div>}

            <div className="table-wrapper">
              {loading ? <div className="loading"><div className="spinner" /></div> : (
                <table className="data-table">
                  <thead>
                    <tr>
                      {selectionHeader}
                      <th>#</th><th>Mat</th><th>Nom</th><th>Tampon</th>
                      <th>Date Embauche</th><th>Fonction</th><th>Projet</th>
                      <th>Équipe</th><th>Superviseur</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.length === 0 && (
                      <tr><td colSpan={canManageEmployees ? 11 : 10} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Aucun opérateur trouvé</td></tr>
                    )}
                    {records.map((emp, idx) => {
                      return (
                        <tr key={emp.mat}>
                          {selectionCell(emp)}
                          <td style={{ color: '#64748b', fontWeight: 600 }}>
                            {(pagination.currentPage - 1) * pagination.recordsPerPage + idx + 1}
                          </td>
                          <td><strong>{emp.mat}</strong></td>
                          <td>{emp.name}</td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {emp.tampon
                                ? <code style={{ fontSize: 11, background: '#f0fdf4', color: '#15803d', border: '1px solid #c7d2fe', borderRadius: 4, padding: '1px 5px' }}>{emp.tampon}</code>
                                : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                            </div>
                          </td>
                          <td style={{ fontSize: 12 }}>{emp.dateEmbauche}</td>
                          <td>{emp.projet}</td>
                          <td>{emp.equipe}</td>
                          <td>
                            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: emp.equipe2 === 'A' ? 'rgba(21,128,61,.1)' : 'rgba(109,40,217,.1)', color: emp.equipe2 === 'A' ? '#15803d' : '#5b21b6' }}>
                              {emp.equipe2}
                            </span>
                          </td>
                          <td>{emp.supervisor}</td>
                          <td>
                            {canManageEmployees ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn-icon btn-edit" onClick={() => openEdit(emp)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  Modifier
                                </button>
                                <button className="btn-icon btn-delete" onClick={() => handleDelete(emp.mat)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                  Supprimer
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>Lecture seule</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <Pagination
              page={pagination.currentPage} totalPages={pagination.totalPages}
              total={pagination.totalRecords} limit={pagination.recordsPerPage}
              onPage={p => { setPage(p) }}
            />
          </div>
        </div>
      )}

      {/* ══ SUPERVISORS PANEL ══ */}
      {tab === 'supervisors' && (
        <div className="emp-panel active">
          <div className="table-container">
            <div className="table-header">
              <h3 className="table-title">Superviseurs <span className="badge-count" style={{ marginLeft: 8 }}>{supervisors.length}</span></h3>
              <div className="table-controls">
                {selectionControls}
                <button type="button" style={excelButtonStyle} onClick={handleExportSupervisors}>Export Excel</button>
                {canManageEmployees && (
                  <>
                    <label style={excelImportStyle}>
                      {importingTab === 'supervisors' ? 'Import...' : 'Import Excel'}
                      <input type="file" accept=".xlsx,.xls,.csv" hidden disabled={!!importingTab}
                        onChange={e => handleImportExcel(e, 'supervisors')} />
                    </label>
                    <button className="add-btn" onClick={() => { setSupName(''); setSupError(''); setSupModal(true) }}>
                      <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Ajouter Superviseur
                    </button>
                  </>
                )}
              </div>
            </div>
            <div style={{ padding: '8px 16px 0' }}>
              <div className="search-container" style={{ maxWidth: 320 }}>
                <span className="search-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
                <input type="text" className="search-input" placeholder="Rechercher un superviseur…"
                  value={supSearch} onChange={e => setSupSearch(e.target.value)} />
              </div>
            </div>
            <div className="table-wrapper">
              {supLoading ? <div className="loading"><div className="spinner" /></div> : (() => {
                const filtered = filteredSupervisors
                return (
                  <table className="data-table">
                    <thead><tr>{selectionHeader}<th>#</th><th>Nom</th><th>Actions</th></tr></thead>
                    <tbody>
                      {filtered.length === 0 && (
                        <tr><td colSpan={canManageEmployees ? 4 : 3} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>{supervisors.length === 0 ? 'Aucun superviseur' : 'Aucun résultat trouvé'}</td></tr>
                      )}
                      {filtered.map((s, idx) => {
                        const name = typeof s === 'string' ? s : s.name
                        return (
                          <tr key={name}>
                            {selectionCell(s)}
                            <td style={{ color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                            <td><strong>{name}</strong></td>
                            <td>
                              {canManageEmployees && (
                                <button className="btn-icon btn-delete" onClick={() => handleDeleteSup(name)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                                  Supprimer
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ══ COUTURIÈRES PANEL ══ */}
      {tab === 'couturieres' && (
        <div className="emp-panel active">
          <div className="table-container">
            <div className="table-header">
              <h3 className="table-title">Couturières <span className="badge-count" style={{ marginLeft: 8 }}>{couturieres.length}</span></h3>
              <div className="table-controls">
                {selectionControls}
                <button type="button" style={excelButtonStyle} onClick={handleExportCouturieres}>Export Excel</button>
                {canManageEmployees && (
                  <>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569' }}>
                      {importingTab === 'couturieres' ? 'Import...' : 'Import Excel'}
                      <input type="file" accept=".xlsx,.xls,.csv" hidden disabled={!!importingTab}
                        onChange={e => handleImportExcel(e, 'couturieres')} />
                    </label>
                    <button className="add-btn" onClick={openAddCouturiere}>
                      <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Ajouter
                    </button>
                  </>
                )}
              </div>
            </div>
            <div style={{ padding: '8px 16px 0', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select className="filter-select" value={couturiereProjetFilter} onChange={e => setCouturiereProjetFilter(e.target.value)}>
                <option value="">Tous les projets</option>
                {projects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
              <div className="search-container" style={{ maxWidth: 300 }}>
                <span className="search-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
                <input type="text" className="search-input" placeholder="Rechercher…" value={couturiereSearch} onChange={e => setCouturiereSearch(e.target.value)} />
              </div>
            </div>
            <div className="table-wrapper">
              {couturieresLoading ? <div className="loading"><div className="spinner" /></div> : (() => {
                const filtered = filteredCouturieres
                return (
                  <table className="data-table">
                    <thead>
                      <tr>{selectionHeader}<th>#</th><th>Matricule</th><th>Nom</th><th>Projet</th><th>Équipe</th><th>Actif</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 && (
                        <tr><td colSpan={canManageEmployees ? 8 : 7} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Aucune couturière trouvée</td></tr>
                      )}
                      {filtered.map((c, idx) => (
                        <tr key={c.id}>
                          {selectionCell(c)}
                          <td style={{ color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                          <td><code style={{ fontSize: 12, background: '#f1f5f9', padding: '2px 7px', borderRadius: 5, color: '#475569' }}>{c.matricule}</code></td>
                          <td style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{c.nom}</td>
                          <td>{c.projet || '—'}</td>
                          <td>
                            {c.equipe && (
                              <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: c.equipe === 'A' ? 'rgba(21,128,61,.1)' : 'rgba(109,40,217,.1)', color: c.equipe === 'A' ? '#15803d' : '#5b21b6' }}>
                                {c.equipe}
                              </span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: c.actif === 1 ? '#dcfce7' : '#fee2e2', color: c.actif === 1 ? '#15803d' : '#b91c1c', border: `1px solid ${c.actif === 1 ? '#86efac' : '#fca5a5'}` }}>
                              {c.actif === 1 ? 'Actif' : 'Inactif'}
                            </span>
                          </td>
                          <td>
                            {canManageEmployees ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn-icon btn-edit" onClick={() => openEditCouturiere(c)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  Modifier
                                </button>
                                <button className="btn-icon btn-delete" onClick={() => handleDeleteCouturiere(c)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                                  Supprimer
                                </button>
                              </div>
                            ) : <span style={{ fontSize: 11, color: '#94a3b8' }}>Lecture seule</span>}
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

      {bulkModal && createPortal(
        <Modal
          title={`${bulkModal === 'delete' ? 'Supprimer' : bulkModal === 'rename' ? 'Renommer' : 'Modifier'} ${selectedRows.length} élément(s)`}
          maxWidth={680}
          onClose={() => { if (!bulkSaving) setBulkModal(null) }}
          footer={<>
            <ModalBtn variant="secondary" disabled={bulkSaving} onClick={() => setBulkModal(null)}>Annuler</ModalBtn>
            <ModalBtn variant={bulkModal === 'delete' ? 'danger' : 'primary'} onClick={saveBulk}
              disabled={bulkSaving || (bulkModal === 'update' && Object.keys(bulkChanges).length === 0)
                || (bulkModal === 'rename' && Object.values(bulkNames).some(name => !name.trim()))}>
              {bulkSaving ? 'Enregistrement...' : bulkModal === 'delete' ? 'Confirmer la suppression' : 'Enregistrer'}
            </ModalBtn>
          </>}
        >
          {bulkError && <div className="alert alert-error" role="alert">{bulkError}</div>}
          {bulkModal === 'delete' ? <>
            <p>Supprimer définitivement ces {selectedRows.length} élément(s) ? Cette action est irréversible.</p>
            {tab === 'employees' && <p>Les tampons affectés seront libérés, pas supprimés.</p>}
            {tab === 'supervisors' && <p>Le superviseur sera retiré des affectations actuelles des employés. Les historiques de contrôle sont conservés.</p>}
            <ul>{selectedRows.slice(0, 20).map(row => <li key={operatorId(tab, row)}>{operatorName(tab, row)} ({operatorId(tab, row)})</li>)}</ul>
            {selectedRows.length > 20 && <p>Et {selectedRows.length - 20} autre(s) élément(s) sélectionné(s).</p>}
          </> : bulkModal === 'rename' ? <>
            <p>Modifiez chaque nom individuellement. Les matricules et identifiants restent inchangés.</p>
            {selectedRows.map(row => {
              const id = operatorId(tab, row)
              return (
                <ModalField key={id} label={`${operatorName(tab, row)} (${id})`} required>
                  <input className="form-input" aria-label={`Nouveau nom (${id})`}
                    disabled={bulkSaving} value={bulkNames[id] ?? ''}
                    onChange={e => setBulkNames(current => ({ ...current, [id]: e.target.value }))} />
                </ModalField>
              )
            })}
          </> : <>
            <p>Seuls les champs cochés seront appliqués à toute la sélection. Une valeur vide efface le champ.</p>
            {commonFields.map(field => {
              const enabled = Object.hasOwn(bulkChanges, field.key)
              return (
                <div key={field.key} style={{ display: 'grid', gap: 6 }}>
                  <label>
                    <input type="checkbox" aria-label={`Appliquer ${field.label}`} checked={enabled} disabled={bulkSaving}
                      onChange={e => setBulkChanges(current => {
                        const next = { ...current }
                        if (e.target.checked) next[field.key] = field.key === 'actif' ? '1' : ''
                        else delete next[field.key]
                        return next
                      })} /> {field.label}
                  </label>
                  {field.options ? (
                    <select className="form-input" aria-label={`Valeur ${field.label}`} disabled={!enabled || bulkSaving}
                      value={bulkChanges[field.key] ?? ''}
                      onChange={e => setBulkChanges(current => ({ ...current, [field.key]: e.target.value }))}>
                      {field.key !== 'actif' && <option value="">Effacer la valeur</option>}
                      {field.options.map(option => {
                        const value = typeof option === 'string' ? option : option.value
                        return <option key={value} value={value}>{typeof option === 'string' ? option : option.label}</option>
                      })}
                    </select>
                  ) : (
                    <input className="form-input" aria-label={`Valeur ${field.label}`} type={field.type}
                      disabled={!enabled || bulkSaving} value={bulkChanges[field.key] ?? ''}
                      onChange={e => setBulkChanges(current => ({ ...current, [field.key]: e.target.value }))} />
                  )}
                </div>
              )
            })}
          </>}
        </Modal>,
        document.body
      )}

      {/* ══ COUTURIÈRE MODAL ══ */}
      {couturiereModal && (
        <Modal
          title={couturiereModal === 'add' ? 'Ajouter une couturière' : 'Modifier la couturière'}
          onClose={() => setCouturiereModal(null)}
          footer={
            <>
              <ModalBtn variant="secondary" onClick={() => setCouturiereModal(null)}>Annuler</ModalBtn>
              <ModalBtn onClick={handleSaveCouturiere} disabled={couturiereSaving}>{couturiereSaving ? 'Enregistrement...' : 'Enregistrer'}</ModalBtn>
            </>
          }
        >
          {couturiereError && <div className="alert alert-error">{couturiereError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ModalField label="Matricule" required>
              <input type="text" className="form-input" value={couturiereForm.matricule}
                onChange={e => setCouturiereForm(p => ({ ...p, matricule: e.target.value }))} />
            </ModalField>
            <ModalField label="Nom complet" required>
              <input type="text" className="form-input" value={couturiereForm.nom}
                onChange={e => setCouturiereForm(p => ({ ...p, nom: e.target.value }))} />
            </ModalField>
            <ModalField label="Projet">
              <select className="form-input" value={couturiereForm.projet}
                onChange={e => setCouturiereForm(p => ({ ...p, projet: e.target.value }))}>
                <option value="">Sélectionner…</option>
                {projects.map(p => <option key={p.name}>{p.name}</option>)}
              </select>
            </ModalField>
            <ModalField label="Équipe">
              <select className="form-input" value={couturiereForm.equipe}
                onChange={e => setCouturiereForm(p => ({ ...p, equipe: e.target.value }))}>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </ModalField>
            <ModalField label="Statut">
              <select className="form-input" value={couturiereForm.actif}
                onChange={e => setCouturiereForm(p => ({ ...p, actif: Number(e.target.value) }))}>
                <option value={1}>Actif</option>
                <option value={0}>Inactif</option>
              </select>
            </ModalField>
          </div>
        </Modal>
      )}

      {/* ══ EMPLOYEE MODAL ══ */}
      {modal && (
        <Modal
          title={isEditMode ? 'Modifier Employé' : 'Ajouter Employé'}
          onClose={() => setModal(null)}
          footer={
            <>
              <ModalBtn variant="secondary" onClick={() => setModal(null)}>Annuler</ModalBtn>
              <ModalBtn onClick={handleSave} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</ModalBtn>
            </>
          }
        >
          {formError && <div className="alert alert-error">{formError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ModalField label="Matricule" required>
              <input type="number" className="form-input" {...f('mat')} disabled={isEditMode} />
            </ModalField>
            <ModalField label="Nom" required>
              <input type="text" className="form-input" {...f('name')} />
            </ModalField>
            <ModalField label="Tampon" required>
              <input type="text" className="form-input" placeholder="Ex: CQ108" maxLength={50}
                value={form.tampon} onChange={e => setForm(p => ({ ...p, tampon: e.target.value.toUpperCase() }))} />
            </ModalField>
            <ModalField label="Fonction" required>
              <select className="form-input" value={form.projet} onChange={e => setForm(p => ({ ...p, projet: e.target.value }))}>
                {FONCTIONS.map(fn => <option key={fn}>{fn}</option>)}
              </select>
            </ModalField>
            <ModalField label="Projet" required>
              <select className="form-input" value={form.equipe} onChange={e => setForm(p => ({ ...p, equipe: e.target.value }))}>
                <option value="">Sélectionner…</option>
                {projects.map(p => <option key={p.name}>{p.name}</option>)}
              </select>
            </ModalField>
            <ModalField label="Équipe" required>
              <select className="form-input" value={form.equipe2} onChange={e => setForm(p => ({ ...p, equipe2: e.target.value }))}>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </ModalField>
            <ModalField label="Superviseur" required>
              <select className="form-input" value={form.supervisor} onChange={e => setForm(p => ({ ...p, supervisor: e.target.value }))}>
                <option value="">Sélectionner…</option>
                {supervisorList.map(s => {
                  const n = typeof s === 'string' ? s : s.name
                  return <option key={n}>{n}</option>
                })}
              </select>
            </ModalField>
            <ModalField label="Date Embauche">
              <input type="date" className="form-input" {...f('dateEmbauche')} />
            </ModalField>
          </div>
        </Modal>
      )}

      {/* ══ SUPERVISOR MODAL ══ */}
      {supModal && (
        <Modal title="Ajouter Superviseur" onClose={() => setSupModal(false)} maxWidth={420}
          footer={<>
            <ModalBtn variant="secondary" onClick={() => setSupModal(false)}>Annuler</ModalBtn>
            <ModalBtn onClick={handleAddSup} disabled={supSaving}>{supSaving ? 'Ajout...' : 'Ajouter'}</ModalBtn>
          </>}>
          <ModalField label="Nom du superviseur" required>
            <input type="text" className="form-input" placeholder="NOM PRÉNOM" value={supName}
              onChange={e => { setSupName(e.target.value); setSupError('') }} />
          </ModalField>
          {supError && <div style={{ color: '#c92a2a', fontSize: 12 }}>{supError}</div>}
        </Modal>
      )}

    </>
  )
}
