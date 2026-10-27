import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersApi } from '../api/users.api.js'

const MODULES = {
  users: 'Utilisateurs', firewall: 'Firewall', csl: 'CSL', delibera: 'Délibéra',
  'delibera-forms': 'Formulaires Délibéra', 'audit-forms': 'Formulaires audit',
  'audit-produit': 'Audit produit', common: 'Référentiels', employees: 'Employés',
  operators: 'Opérateurs', postes: 'Postes', production: 'Production', profile: 'Profil',
  projects: 'Projets', tampons: 'Tampons', targets: 'Objectifs', tri: 'Tri',
  echeances: 'Échéances', notifications: 'Notifications', 'defauts-couturiere': 'Défauts couturière',
  'suivi-qualite': 'Suivi qualité', auth: 'Compte',
}
const ACTIONS = {
  CREATE: 'Création', UPDATE: 'Modification', DELETE: 'Suppression', IMPORT: 'Import',
  EXPORT: 'Export serveur', EXPORT_CLIENT: 'Export Excel déclaré par le navigateur',
  SCAN: 'Scan', SCAN_SAVE: 'Enregistrement du scan', SCAN_VALIDATION: 'Validation du scan',
  VALIDATION: 'Validation', NOK_TO_OK: 'Retour NOK → OK', CHECKPOINTS: 'Contrôle des checkpoints',
  PASSWORD_CHANGE: 'Changement / réinitialisation du mot de passe', LOCK: 'Blocage', UNLOCK: 'Déblocage',
}
const OUTCOMES = { success: 'Succès HTTP', failed: 'Échec HTTP', reported: 'Déclaré navigateur' }
const inputStyle = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6 }

export default function BusinessActivityHistory({ userId, embedded }) {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ actor: '', from: '', to: '', module: '', outcome: '' })
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const limit = 50
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const timer = setTimeout(() => {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))
      usersApi.activityHistory(userId, { ...params, page, limit })
        .then(data => {
          if (!data || !Array.isArray(data.rows)) throw new Error("Réponse d'activité invalide")
          if (active) setResult(data)
        })
        .catch(e => { if (active) setError(e.response?.data?.error || e.message || "Impossible de charger l'activité") })
        .finally(() => { if (active) setLoading(false) })
    }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [userId, filters, page, refresh])
  const change = (key, value) => { setFilters(current => ({ ...current, [key]: value })); setPage(1) }
  return <section style={{ padding: embedded ? '20px 28px' : 24 }}>
    {!embedded && userId && <button className="btn btn-secondary" onClick={() => navigate('/users')}>← Retour aux utilisateurs</button>}
    <h2>Activité métier{userId ? ` — utilisateur #${userId}` : ' — tous les utilisateurs'}</h2>
    <p style={{ color: '#64748b', fontSize: 13 }}>
      Suivi à partir du déploiement de cette fonctionnalité uniquement, sans reconstitution historique.
      Les consultations de pages et de listes ne sont pas enregistrées.
      Le résultat HTTP ne garantit pas le traitement de chaque ligne d’un import.
      Un export navigateur est une déclaration, pas une preuve de sauvegarde du fichier.
    </p>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12, margin: '20px 0' }}>
      {!userId && <label>Matricule exact<br /><input style={inputStyle} value={filters.actor} maxLength={200} onChange={e => change('actor', e.target.value)} /></label>}
      <label>Du<br /><input type="date" style={inputStyle} value={filters.from} onChange={e => change('from', e.target.value)} /></label>
      <label>Au<br /><input type="date" style={inputStyle} value={filters.to} onChange={e => change('to', e.target.value)} /></label>
      <label>Module<br /><select style={inputStyle} value={filters.module} onChange={e => change('module', e.target.value)}>
        <option value="">Tous</option>{Object.entries(MODULES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Résultat<br /><select style={inputStyle} value={filters.outcome} onChange={e => change('outcome', e.target.value)}>
        <option value="">Tous</option>{Object.entries(OUTCOMES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <button className="btn btn-secondary" onClick={() => setRefresh(value => value + 1)}>Actualiser</button>
    </div>
    {error && <div role="alert" style={{ color: '#b91c1c', padding: 12 }}>Erreur : {error} <button onClick={() => setRefresh(value => value + 1)}>Réessayer</button></div>}
    {loading ? <p role="status">Chargement de l’activité…</p> : !error && result && <>
      <p>{result.total} action(s) · Page {page} / {Math.max(1, Math.ceil(result.total / limit))}</p>
      <div style={{ overflowX: 'auto' }}><table className="data-table" style={{ width: '100%' }}>
        <thead><tr>{['Date / heure', 'Utilisateur', 'Module', 'Action', 'Cible / contexte', 'Résultat', 'HTTP', 'Durée'].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{result.rows.map(row => <tr key={row.id}>
          <td style={{ whiteSpace: 'nowrap' }}>{new Date(row.occurredAt).toLocaleString('fr-FR')}</td>
          <td>{row.actor} {row.userId ? `(#${row.userId})` : ''}</td>
          <td>{MODULES[row.module] || row.module}</td>
          <td title={row.route}>{ACTIONS[row.action] || row.action}<div style={{ fontSize: 11, color: '#64748b' }}>{row.route}</div></td>
          <td style={{ maxWidth: 360, overflowWrap: 'anywhere' }}>{row.target || '—'}</td>
          <td style={{ color: row.outcome === 'failed' ? '#b91c1c' : row.outcome === 'reported' ? '#92400e' : '#15803d' }}>{OUTCOMES[row.outcome] || row.outcome}</td>
          <td>{row.httpStatus}</td><td>{row.durationMs} ms</td>
        </tr>)}
        {!result.rows.length && <tr><td colSpan={8}>Aucune activité enregistrée pour ces filtres.</td></tr>}</tbody>
      </table></div>
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Précédent</button>
        <button className="btn btn-secondary" disabled={page * limit >= result.total} onClick={() => setPage(value => value + 1)}>Suivant</button>
      </div>
    </>}
  </section>
}
