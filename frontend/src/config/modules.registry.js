export const MODULES_REGISTRY = {
  overview:       { key: 'overview',       label: "Vue d'ensemble" },
  firewall:       { key: 'firewall',       label: 'Firewall' },
  csl:            { key: 'csl',            label: 'CSL' },
  delibera:       { key: 'delibera',       label: 'Délibéra' },
  delibera_forms: { key: 'delibera_forms', label: 'Formulaires Délibéra' },
  audit_forms:    { key: 'audit_forms',    label: 'Formulaires Auditeur' },
  audit_produit:  { key: 'audit_produit',  label: 'Audit Produit' },
  tri:            { key: 'tri',            label: 'Tri' },
  echeances:      { key: 'echeances',      label: 'Échéances' },
  rapports:       { key: 'rapports',       label: 'Rapports' },
  operators:      { key: 'operators',      label: 'Opérateurs' },
  projects:       { key: 'projects',       label: 'Projets' },
  target:         { key: 'target',         label: 'Target' },
  suivi_qualite:  { key: 'suivi_qualite',  label: 'Suivi Qualité' },
  defauts_couturiere: { key: 'defauts_couturiere', label: 'Défauts Couturière' },
  users:          { key: 'users',          label: 'Utilisateurs' },
  permissions:    { key: 'permissions',    label: 'Permissions' },
}

export const getAllModules = () => Object.values(MODULES_REGISTRY)
