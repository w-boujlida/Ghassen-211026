export function scanRuleError(project, index, rule, code) {
  const label = `Code-barres erroné : projet ${project}, code ${index + 1}. `
  if (!code || !code.trim()) return label + 'Champ obligatoire.'
  const received = Array.from(code).length
  if (received > 100) return label + '100 caractères maximum.'
  if (rule.length != null && received !== rule.length) {
    return label + `Attendu : ${rule.length} caractères ; reçu : ${received}. ${Math.abs(rule.length - received)} caractère(s) ${received < rule.length ? 'manquant(s)' : 'en trop'}.`
  }
  if (!code.startsWith(rule.prefix || '')) return label + `Le code doit commencer par « ${rule.prefix} ».`
  if (!code.endsWith(rule.suffix || '')) return label + `Le code doit finir par « ${rule.suffix} ».`
  return ''
}
