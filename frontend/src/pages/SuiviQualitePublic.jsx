import { useCallback, useEffect, useRef, useState } from 'react'
import { publicSuiviQualiteApi } from '../api/publicSuiviQualite.api.js'
import AnimatedNumber from '../components/AnimatedNumber.jsx'

const SHIFT_LABELS = {
  MATIN: 'Matin (06h-14h)',
  APRES_MIDI: 'Après-midi (14h-22h)',
  SHIFT_1: 'Shift 1 (06h-16h)',
  SHIFT_2: 'Shift 2 (20h-06h)',
}

// Plage horaire réelle (Africa/Tunis) de chaque shift — affichée près des totaux
// pour situer temporellement les chiffres du grand affichage.
const SHIFT_HOURS = {
  MATIN: '06:00-14:00',
  APRES_MIDI: '14:00-22:00',
  SHIFT_1: '06:00-16:00',
  SHIFT_2: '20:00-06:00',
}

// Pas d'infrastructure WebSocket/SSE dans le projet (cf. SuiviQualite.jsx authentifié) :
// on garde le même mécanisme de rafraîchissement par polling pour cet écran public.
const REFRESH_MS = 15000
const CLOCK_MS = 1000
// Durée pendant laquelle une tuile "flashe" après une hausse de quantité.
const FLASH_MS = 1400
// Durée de la bordure clignotante brève lors d'un passage au rouge.
const ALERT_MS = 4000

// Page React réelle (pas un Artifact Claude.ai) : localStorage persiste normalement
// entre les rechargements de l'écran d'atelier/TV.
const THEME_KEY = 'pq_theme'

// TODO: renseigner le nom exact du service et du développeur à créditer en pied de page.
const SERVICE_NAME = 'SERVICE IT'
const DEVELOPER_NAME = 'SAIDI BAHA EDDINE'

const STATUT_LABEL = { VERT: 'Vert', ORANGE: 'Orange', ROUGE: 'Rouge' }
const STATUT_CLASS = { VERT: 'pq-statut-vert', ORANGE: 'pq-statut-orange', ROUGE: 'pq-statut-rouge' }

function fmtToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* localStorage indisponible (mode privé, etc.) — on retombe sur la préférence système */ }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

/** Détecte une hausse de valeur et renvoie un compteur qui s'incrémente à chaque hausse (déclenche le flash). */
function useFlashOnIncrease(value) {
  const prevRef = useRef(value)
  const [flashing, setFlashing] = useState(false)
  const timeoutRef = useRef(null)

  useEffect(() => {
    if (value > prevRef.current) {
      setFlashing(false)
      requestAnimationFrame(() => setFlashing(true))
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setFlashing(false), FLASH_MS)
    }
    prevRef.current = value
  }, [value])

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }, [])

  return flashing
}

/** Détecte une transition (autre statut) -> ROUGE et renvoie l'état d'alerte brève. */
function useRougeAlert(statut) {
  const prevRef = useRef(statut)
  const [alerting, setAlerting] = useState(false)
  const timeoutRef = useRef(null)

  useEffect(() => {
    if (statut === 'ROUGE' && prevRef.current !== 'ROUGE') {
      setAlerting(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setAlerting(false), ALERT_MS)
    }
    prevRef.current = statut
  }, [statut])

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }, [])

  return alerting
}

function CreneauTile({ creneau }) {
  const flashing = useFlashOnIncrease(creneau.quantiteDefauts)
  const alerting = useRougeAlert(creneau.statut)
  const statutClass = STATUT_CLASS[creneau.statut] || STATUT_CLASS.VERT

  return (
    <div
      className={`pq-tile ${statutClass}${flashing ? ' pq-tile-flash' : ''}${alerting ? ' pq-tile-alert' : ''}${creneau.statut === 'ROUGE' ? ' pq-tile-rouge-persist' : ''}`}
    >
      {creneau.statut === 'ROUGE' && <span className="pq-tile-warn" aria-label="Dépassement">⚠</span>}
      <div className="pq-tile-creneau">{creneau.creneau}</div>
      <div className="pq-tile-limite">Limite&nbsp;{creneau.limite}</div>
      <div className="pq-tile-qte">
        <AnimatedNumber value={creneau.quantiteDefauts} className="pq-anim-number" />
      </div>
    </div>
  )
}

function LigneCard({ ligne }) {
  const statutClass = STATUT_CLASS[ligne.statut] || STATUT_CLASS.VERT
  const flashing = useFlashOnIncrease(ligne.quantiteDefauts)
  const pct = ligne.limite > 0 ? Math.min(100, Math.round((ligne.quantiteDefauts / ligne.limite) * 100)) : 0

  return (
    <div className="pq-ligne-card">
      <div className="pq-ligne-head">
        <span className="pq-ligne-name">{ligne.ligne}</span>
        <span className={`pq-ligne-badge ${statutClass}`}>{STATUT_LABEL[ligne.statut] || ligne.statut}</span>
      </div>
      <div
        className={`pq-ligne-total ${statutClass}${flashing ? ' pq-tile-flash' : ''}`}
        aria-label={`Total ${ligne.quantiteDefauts} sur limite ${ligne.limite}`}
      >
        <span className="pq-ligne-total-label">Total</span>
        <span className="pq-ligne-total-nums">
          <AnimatedNumber value={ligne.quantiteDefauts} className="pq-anim-number pq-ligne-total-qte" />
          <span className="pq-ligne-total-sep">/</span>
          <span className="pq-ligne-total-limite">{ligne.limite}</span>
        </span>
        <div className="pq-ligne-total-bar">
          <div className="pq-ligne-total-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="pq-creneaux-grid">
        {ligne.creneaux.map(c => <CreneauTile key={c.creneau} creneau={c} />)}
      </div>
    </div>
  )
}

function useTunisClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_MS)
    return () => clearInterval(id)
  }, [])
  const time = now.toLocaleTimeString('fr-FR', { timeZone: 'Africa/Tunis', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const date = now.toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  return { time, date }
}

export default function SuiviQualitePublic() {
  const [projects, setProjects] = useState([])
  const [projet, setProjet] = useState('')
  const [lignesProjet, setLignesProjet] = useState([])
  const [ligne, setLigne] = useState('')
  const [shift, setShift] = useState('')
  const [date] = useState(fmtToday())
  const [theme, setTheme] = useState(getInitialTheme)

  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState('')
  const timerRef = useRef(null)
  const { time, date: dateLabel } = useTunisClock()

  useEffect(() => {
    publicSuiviQualiteApi.getProjects()
      .then(d => setProjects(d?.projects || []))
      .catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    if (!projet) { setLignesProjet([]); setLigne(''); return }
    publicSuiviQualiteApi.getLignes(projet)
      .then(d => setLignesProjet(d?.lignes || []))
      .catch(() => setLignesProjet([]))
  }, [projet])

  const load = useCallback(() => {
    if (!projet) { setDashboard(null); return }
    publicSuiviQualiteApi.getDashboard({ projet, ligne, shift, date })
      .then(d => { setDashboard(d); setError('') })
      .catch(e => setError(e.message))
  }, [projet, ligne, shift, date])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!projet) return undefined
    timerRef.current = setInterval(load, REFRESH_MS)
    return () => clearInterval(timerRef.current)
  }, [projet, load])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
    else document.exitFullscreen?.()
  }

  const toggleTheme = () => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem(THEME_KEY, next) } catch { /* mode privé — non bloquant, juste pas persisté */ }
      return next
    })
  }

  const lignesRows = dashboard?.lignes || []

  return (
    <div className={`pq-root theme-${theme}`}>
      <header className="pq-header">
        <div className="pq-title-block">
          <h1>Suivi Qualité — Grand Affichage</h1>
          <div className="pq-subtitle">Limite vs coiffes avec défaut, par ligne et créneau — Africa/Tunis</div>
        </div>
        <div className="pq-clock">
          <div className="pq-clock-time">{time}</div>
          <div className="pq-clock-date">{dateLabel}</div>
        </div>
        <button
          className="pq-icon-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
          aria-label="Basculer le thème clair/sombre"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button className="pq-icon-btn" onClick={toggleFullscreen} title="Plein écran">⛶</button>
      </header>

      <div className="pq-filters">
        <div className="pq-filter">
          <label>Projet</label>
          <select value={projet} onChange={e => setProjet(e.target.value)}>
            <option value="">Sélectionner…</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="pq-filter">
          <label>Ligne</label>
          <select value={ligne} onChange={e => setLigne(e.target.value)} disabled={!projet}>
            <option value="">Toutes les lignes</option>
            {lignesProjet.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="pq-filter">
          <label>Shift</label>
          <select value={shift} onChange={e => setShift(e.target.value)}>
            <option value="">Shift courant</option>
            {Object.keys(SHIFT_LABELS).map(s => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
          </select>
        </div>
        {dashboard && (
          <div className="pq-live-pill">
            <span className="pq-live-dot" />
            {SHIFT_LABELS[dashboard.shift] || dashboard.shift} · Maj {dashboard.generatedAt?.slice(11, 19)}
          </div>
        )}
      </div>

      <main className="pq-main">
        {!projet && !error && (
          <div className="pq-empty">Sélectionnez un projet pour afficher le suivi qualité.</div>
        )}
        {error && <div className="pq-error">{error}</div>}
        {projet && dashboard && lignesRows.length === 0 && (
          <div className="pq-empty">Aucune ligne de projet trouvée.</div>
        )}
        {projet && dashboard && lignesRows.length > 0 && (
          <>
            <div className="pq-shift-range">
              Créneau shift&nbsp;: <strong>{SHIFT_HOURS[dashboard.shift] || dashboard.shift}</strong>
            </div>
            <div className="pq-lignes-grid">
              {lignesRows.map(l => <LigneCard key={l.ligne} ligne={l} />)}
            </div>
          </>
        )}
      </main>

      <footer className="pq-footer">
        <span>{SERVICE_NAME}</span>
        <span className="pq-footer-sep">·</span>
        <span>Développé par {DEVELOPER_NAME}</span>
      </footer>

      <style>{`
        /* ── Thème sombre (défaut historique de l'écran) ─────────────────────── */
        .pq-root.theme-dark {
          --pq-bg-grad-start: #131a2b;
          --pq-bg-grad-end: #05070d;
          --pq-text: #e5e9f2;
          --pq-text-muted: #94a3b8;
          --pq-header-border: rgba(255,255,255,.08);
          --pq-panel-bg: rgba(255,255,255,.03);
          --pq-panel-border: rgba(255,255,255,.06);
          --pq-select-bg: #131a2b;
          --pq-select-border: rgba(255,255,255,.18);
          --pq-btn-bg: rgba(255,255,255,.06);
          --pq-btn-border: rgba(255,255,255,.15);
          --pq-btn-hover-bg: rgba(255,255,255,.14);
          --pq-accent: #4ade80;
          --pq-card-bg: rgba(255,255,255,.04);
          --pq-card-border: rgba(255,255,255,.1);
          --pq-ligne-total-text: #cbd5e1;
          --pq-muted-2: #64748b;
          --pq-error-bg: #451a1a;
          --pq-error-border: #7f1d1d;
          --pq-error-text: #fecaca;
          --pq-tile-shadow: 0 2px 10px rgba(0,0,0,.25);
          --pq-card-shadow: none;
          --pq-strip-shadow: none;
          --pq-flash-glow: rgba(255,255,255,.85);
          --pq-flash-brightness: 1.6;
          --pq-alert-peak-border: #ffffff;

          --statut-vert-bg: linear-gradient(160deg,#0f4d2e,#0a3620);
          --statut-vert-border: #22c55e;
          --statut-vert-text: #d1fae5;
          --statut-orange-bg: linear-gradient(160deg,#7a4a06,#5c3705);
          --statut-orange-border: #f59e0b;
          --statut-orange-text: #fef3c7;
          --statut-rouge-bg: linear-gradient(160deg,#7f1d1d,#5c1414);
          --statut-rouge-border: #ef4444;
          --statut-rouge-text: #fee2e2;
          --statut-rouge-glow: rgba(239,68,68,.9);
          --statut-rouge-glow-idle: rgba(239,68,68,.55);
        }

        /* ── Thème clair — mêmes variables, valeurs adaptées au fond blanc ──── */
        .pq-root.theme-light {
          --pq-bg-grad-start: #f8fafc;
          --pq-bg-grad-end: #e2e8f0;
          --pq-text: #0f172a;
          --pq-text-muted: #475569;
          --pq-header-border: rgba(15,23,42,.1);
          --pq-panel-bg: #eef1f6;
          --pq-panel-border: rgba(15,23,42,.08);
          --pq-select-bg: #ffffff;
          --pq-select-border: rgba(15,23,42,.22);
          --pq-btn-bg: #ffffff;
          --pq-btn-border: rgba(15,23,42,.18);
          --pq-btn-hover-bg: #f1f5f9;
          --pq-accent: #14532d;
          --pq-card-bg: #ffffff;
          --pq-card-border: rgba(15,23,42,.08);
          --pq-ligne-total-text: #334155;
          --pq-muted-2: #64748b;
          --pq-error-bg: #fef2f2;
          --pq-error-border: #fecaca;
          --pq-error-text: #b91c1c;
          --pq-tile-shadow: 0 1px 3px rgba(15,23,42,.1);
          --pq-card-shadow: 0 6px 18px rgba(15,23,42,.08);
          --pq-strip-shadow: 0 2px 8px rgba(15,23,42,.05);
          --pq-flash-glow: rgba(29,78,216,.55);
          --pq-flash-brightness: 1.12;
          --pq-alert-peak-border: #7f1d1d;

          --statut-vert-bg: linear-gradient(160deg,#dcfce7,#bbf7d0);
          --statut-vert-border: #16a34a;
          --statut-vert-text: #14532d;
          --statut-orange-bg: linear-gradient(160deg,#fef3c7,#fde68a);
          --statut-orange-border: #d97706;
          --statut-orange-text: #78350f;
          --statut-rouge-bg: linear-gradient(160deg,#fee2e2,#fecaca);
          --statut-rouge-border: #dc2626;
          --statut-rouge-text: #7f1d1d;
          --statut-rouge-glow: rgba(220,38,38,.65);
          --statut-rouge-glow-idle: rgba(220,38,38,.4);
        }

        .pq-root {
          position: fixed; inset: 0; overflow-y: auto; overflow-x: hidden;
          background: radial-gradient(ellipse at top, var(--pq-bg-grad-start) 0%, var(--pq-bg-grad-end) 70%);
          color: var(--pq-text);
          font-family: 'Segoe UI', system-ui, sans-serif;
          display: flex; flex-direction: column;
          transition: background .25s ease, color .25s ease;
        }
        .pq-header {
          display: flex; align-items: center; gap: clamp(12px, 2vw, 32px);
          padding: clamp(10px, 1.6vw, 22px) clamp(16px, 3vw, 40px);
          border-bottom: 1px solid var(--pq-header-border);
          flex-wrap: wrap;
        }
        .pq-title-block h1 { margin: 0; font-size: clamp(1.1rem, 2.4vw, 2rem); font-weight: 800; letter-spacing: .01em; }
        .pq-subtitle { font-size: clamp(.7rem, 1vw, .95rem); color: var(--pq-text-muted); margin-top: 4px; }
        .pq-clock { margin-left: auto; text-align: right; }
        .pq-clock-time { font-size: clamp(1.3rem, 3vw, 2.4rem); font-weight: 800; font-variant-numeric: tabular-nums; color: var(--pq-accent); line-height: 1; }
        .pq-clock-date { font-size: clamp(.65rem, .9vw, .9rem); color: var(--pq-text-muted); margin-top: 4px; text-transform: capitalize; }
        .pq-icon-btn {
          background: var(--pq-btn-bg); border: 1px solid var(--pq-btn-border); color: var(--pq-text);
          border-radius: 10px; font-size: clamp(1.1rem, 1.8vw, 1.6rem); padding: 8px 14px; cursor: pointer;
          line-height: 1;
        }
        .pq-icon-btn:hover { background: var(--pq-btn-hover-bg); }
        .pq-icon-btn:focus-visible, .pq-filter select:focus-visible {
          outline: 2px solid var(--pq-accent); outline-offset: 2px;
        }

        .pq-filters {
          display: flex; align-items: flex-end; gap: clamp(10px, 1.6vw, 24px); flex-wrap: wrap;
          padding: clamp(10px, 1.4vw, 18px) clamp(16px, 3vw, 40px);
          background: var(--pq-panel-bg);
          border-bottom: 1px solid var(--pq-panel-border);
          box-shadow: var(--pq-strip-shadow);
        }
        .pq-filter label {
          display: block; font-size: clamp(.65rem, .8vw, .8rem); font-weight: 700; text-transform: uppercase;
          letter-spacing: .07em; color: var(--pq-text-muted); margin-bottom: 6px;
        }
        .pq-filter select {
          font-size: clamp(.95rem, 1.3vw, 1.25rem); padding: 10px 14px; border-radius: 10px;
          background: var(--pq-select-bg); color: var(--pq-text); border: 1px solid var(--pq-select-border); min-width: 180px;
        }
        .pq-filter select:disabled { opacity: .5; }
        .pq-live-pill {
          margin-left: auto; display: flex; align-items: center; gap: 8px;
          font-size: clamp(.75rem, 1vw, 1rem); color: var(--pq-text-muted); font-variant-numeric: tabular-nums;
        }
        .pq-live-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--statut-vert-border); animation: pq-pulse 2s infinite; }

        .pq-main { flex: 1; padding: clamp(14px, 2.2vw, 32px) clamp(16px, 3vw, 40px) clamp(30px, 4vw, 60px); }
        .pq-empty { text-align: center; padding: 10vh 20px; color: var(--pq-muted-2); font-size: clamp(1rem, 1.6vw, 1.4rem); }
        .pq-error { background: var(--pq-error-bg); border: 1px solid var(--pq-error-border); color: var(--pq-error-text); padding: 14px 18px; border-radius: 10px; font-size: 1rem; }

        .pq-shift-range {
          text-align: center; color: var(--pq-text-muted);
          font-size: clamp(.8rem, 1.2vw, 1.15rem);
          margin-bottom: clamp(10px, 1.6vw, 18px);
        }
        .pq-shift-range strong { color: var(--pq-accent); font-weight: 800; letter-spacing: .02em; }

        .pq-lignes-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr));
          gap: clamp(14px, 2vw, 26px);
        }
        .pq-ligne-card {
          background: var(--pq-card-bg); border: 1px solid var(--pq-card-border);
          border-radius: 18px; padding: clamp(12px, 1.6vw, 20px);
          box-shadow: var(--pq-card-shadow);
        }
        .pq-ligne-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
        .pq-ligne-name { font-size: clamp(1.1rem, 2vw, 1.6rem); font-weight: 800; }
        .pq-ligne-badge {
          margin-left: auto;
          font-size: clamp(.7rem, .9vw, .9rem); font-weight: 700; padding: 4px 12px; border-radius: 99px;
          border: 1px solid; text-transform: uppercase; letter-spacing: .04em;
        }

        /* Total quantité/limite de la ligne — doit rester lisible de loin : c'est l'indicateur
           principal de la tuile, donc typo très large, couleur de statut et barre de progression. */
        .pq-ligne-total {
          display: flex; flex-direction: column; align-items: center; gap: clamp(2px, .5vw, 6px);
          margin: 0 0 14px; padding: clamp(8px, 1.4vw, 16px) clamp(10px, 2vw, 22px);
          border-radius: 16px; border: 2px solid;
          box-shadow: var(--pq-tile-shadow);
        }
        .pq-ligne-total-label {
          font-size: clamp(.65rem, .8vw, .8rem); font-weight: 700; text-transform: uppercase;
          letter-spacing: .1em; opacity: .75;
        }
        .pq-ligne-total-nums {
          display: flex; align-items: baseline; gap: clamp(3px, .5vw, 8px);
          font-variant-numeric: tabular-nums; line-height: 1;
        }
        .pq-ligne-total-qte { font-size: clamp(2.6rem, 6.5vw, 5.2rem); font-weight: 900; }
        .pq-ligne-total-sep { font-size: clamp(1.2rem, 2.4vw, 2.1rem); font-weight: 700; opacity: .5; }
        .pq-ligne-total-limite { font-size: clamp(1.3rem, 2.6vw, 2.3rem); font-weight: 700; opacity: .8; }
        .pq-ligne-total-bar {
          width: 100%; max-width: 340px; height: clamp(6px, .9vw, 10px); border-radius: 99px;
          background: rgba(127,127,127,.25); overflow: hidden; margin-top: 2px;
        }
        .pq-ligne-total-bar-fill {
          height: 100%; border-radius: inherit; background: currentColor; opacity: .8;
          transition: width .5s ease;
        }

        .pq-creneaux-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(clamp(110px, 14vw, 170px), 1fr));
          gap: clamp(8px, 1.2vw, 14px);
        }
        .pq-tile {
          position: relative; border: 2px solid; border-radius: 14px;
          padding: clamp(10px, 1.4vw, 16px) clamp(6px, 1vw, 10px);
          text-align: center; overflow: hidden;
          box-shadow: var(--pq-tile-shadow);
        }
        .pq-tile-creneau { font-size: clamp(.65rem, .85vw, .8rem); font-weight: 700; opacity: .9; white-space: nowrap; }
        .pq-tile-limite { font-size: clamp(.65rem, .85vw, .85rem); opacity: .85; margin-top: 2px; }
        .pq-tile-qte { font-size: clamp(1.8rem, 4.2vw, 3.4rem); font-weight: 900; line-height: 1.1; margin-top: 4px; }
        .pq-tile-warn { position: absolute; top: 6px; right: 8px; font-size: clamp(.9rem, 1.4vw, 1.3rem); }

        /* Couleurs de statut — mêmes classes dans les deux thèmes, valeurs pilotées par variables */
        .pq-tile.pq-statut-vert,   .pq-ligne-badge.pq-statut-vert,   .pq-ligne-total.pq-statut-vert   { background: var(--statut-vert-bg);   border-color: var(--statut-vert-border);   color: var(--statut-vert-text); }
        .pq-tile.pq-statut-orange, .pq-ligne-badge.pq-statut-orange, .pq-ligne-total.pq-statut-orange { background: var(--statut-orange-bg); border-color: var(--statut-orange-border); color: var(--statut-orange-text); }
        .pq-tile.pq-statut-rouge, .pq-ligne-badge.pq-statut-rouge, .pq-ligne-total.pq-statut-rouge { background: var(--statut-rouge-bg); border-color: var(--statut-rouge-border); color: var(--statut-rouge-text); }

        /* Flash très visible sur hausse de valeur — plus prononcé que le dashboard interne */
        .pq-tile-flash { animation: pq-tile-flash-kf ${FLASH_MS}ms ease-out; }
        @keyframes pq-tile-flash-kf {
          0%   { transform: scale(1.12); box-shadow: 0 0 0 rgba(0,0,0,0); filter: brightness(1); }
          15%  { transform: scale(1.16); box-shadow: 0 0 45px 10px var(--pq-flash-glow); filter: brightness(var(--pq-flash-brightness)); }
          100% { transform: scale(1);    box-shadow: var(--pq-tile-shadow); filter: brightness(1); }
        }

        /* Alerte brève au passage au rouge : bordure clignotante */
        .pq-tile-alert { animation: pq-tile-alert-kf 400ms ease-in-out ${Math.round(ALERT_MS / 400)}; }
        @keyframes pq-tile-alert-kf {
          0%, 100% { border-color: var(--statut-rouge-border); box-shadow: 0 0 0 rgba(0,0,0,0); }
          50%      { border-color: var(--pq-alert-peak-border); box-shadow: 0 0 40px 12px var(--statut-rouge-glow); }
        }
        /* Pulsation douce permanente tant que le créneau reste au rouge */
        .pq-tile-rouge-persist { animation: pq-tile-rouge-idle 2.4s ease-in-out infinite; }
        @keyframes pq-tile-rouge-idle {
          0%, 100% { box-shadow: var(--pq-tile-shadow); }
          50%      { box-shadow: 0 0 22px 3px var(--statut-rouge-glow-idle); }
        }

        .pq-anim-number { display: inline-block; font-variant-numeric: tabular-nums; }
        .pq-anim-number.value-increased { animation: pq-number-pulse 700ms ease-out; }
        @keyframes pq-number-pulse {
          0%   { transform: scale(1.4); }
          35%  { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        .pq-footer {
          display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;
          padding: clamp(8px, 1.2vw, 14px) clamp(16px, 3vw, 40px);
          border-top: 1px solid var(--pq-panel-border);
          background: var(--pq-panel-bg);
          color: var(--pq-text-muted);
          font-size: clamp(.65rem, .85vw, .8rem);
        }
        .pq-footer-sep { opacity: .6; }

        @keyframes pq-pulse { 0%,100%{opacity:1} 50%{opacity:.25} }

        @media (prefers-reduced-motion: reduce) {
          .pq-root { transition: none; }
          .pq-tile-flash, .pq-tile-alert, .pq-tile-rouge-persist, .pq-anim-number.value-increased, .pq-live-dot {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
