export const emptyScanRule = () => ({ length: null, prefix: '', suffix: '' })

export function validScanRules(rules) {
  return rules.length >= 1 && rules.length <= 3 && rules.every(rule =>
    (rule.length === null || (Number.isInteger(Number(rule.length)) && Number(rule.length) >= 1 && Number(rule.length) <= 100))
    && Array.from(rule.prefix).length <= (rule.length ?? 100)
    && Array.from(rule.suffix).length <= (rule.length ?? 100))
}

export default function ScanRulesEditor({ rules, onChange, disabled }) {
  const update = (index, patch) => onChange(rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule))
  return <div className="scan-rules-editor">
    <label>Nombre de champs à scanner (Délibéra OK / NOK)
      <select className="form-input" aria-label="Nombre de champs à scanner" value={rules.length} disabled={disabled}
        onChange={e => onChange(Array.from({ length: Number(e.target.value) }, (_, i) => rules[i] || emptyScanRule()))}>
        {[1, 2, 3].map(n => <option key={n} value={n}>{n} champ{n > 1 ? 's' : ''}</option>)}
      </select>
    </label>
    <p className="project-help">Tous les champs configurés sont obligatoires. Le code 1 identifie la pièce ; les autres sont conservés avec elle.</p>
    {rules.map((rule, i) => <fieldset key={i} style={{ padding: 14, marginTop: 14, border: '1px solid #cbd5e1', borderRadius: 10 }}>
      <legend>Code {i + 1}{i === 0 ? ' — pièce principale' : ' — complémentaire'}</legend>
      <label>Nombre de caractères
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-icon" aria-label={`Diminuer longueur code ${i + 1}`} disabled={disabled || rule.length === 1}
            onClick={() => update(i, { length: Math.max(1, (rule.length ?? 26) - 1) })}>−</button>
          <input className="form-input" type="number" min="1" max="100" aria-label={`Longueur code ${i + 1}`}
            value={rule.length ?? ''} disabled={disabled}
            onChange={e => update(i, { length: e.target.value === '' ? null : Number(e.target.value) })} />
          <button type="button" className="btn-icon" aria-label={`Augmenter longueur code ${i + 1}`} disabled={disabled || rule.length === 100}
            onClick={() => update(i, { length: Math.min(100, (rule.length ?? 26) + 1) })}>+</button>
        </div>
      </label>
      <label>Commence par
        <input className="form-input" aria-label={`Début code ${i + 1}`} value={rule.prefix} maxLength={100} disabled={disabled}
          onChange={e => update(i, { prefix: e.target.value })} placeholder="Exemple : 098 ou AB" />
      </label>
      <label>Finit par
        <input className="form-input" aria-label={`Fin code ${i + 1}`} value={rule.suffix} maxLength={100} disabled={disabled}
          onChange={e => update(i, { suffix: e.target.value })} placeholder="Exemple : 26 ou XY" />
      </label>
    </fieldset>)}
    <p className="project-help">Condition vide = non imposée. Début et fin exacts : lettres, chiffres, zéros initiaux et casse conservés.</p>
  </div>
}
