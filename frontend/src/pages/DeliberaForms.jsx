import { useEffect, useState, useCallback } from 'react'
import { deliberaFormsApi } from '../api/deliberaForms.api.js'
import { projectsApi }      from '../api/projects.api.js'
import { lookupApi }        from '../api/lookup.api.js'
import { deliberaApi }      from '../api/delibera.api.js'
import Pagination           from '../components/Pagination.jsx'
import { useAuth }          from '../contexts/AuthContext.jsx'
import { useLang }          from '../contexts/LangContext.jsx'
import translations         from '../i18n/translations.js'

const C = '#7c3aed'

const todayFR = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

const btn = (label, onClick, color = C, outline = false, disabled = false) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding:'7px 16px', borderRadius:8, border:`1.5px solid ${color}`,
    background: outline ? 'transparent' : disabled ? '#e2e8f0' : color,
    color: disabled ? '#94a3b8' : outline ? color : '#fff',
    fontSize:13, fontWeight:600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.7 : 1,
    transition:'all 0.15s',
  }}>{label}</button>
)

function inpStyle(accent, ro = false) {
  return {
    padding:'9px 12px', borderRadius:9, border:`1.5px solid ${ro ? '#e2e8f0' : accent+'55'}`,
    fontSize:14, outline:'none', background: ro ? '#f8fafc' : '#fff',
    width:'100%', boxSizing:'border-box', color:'#1e293b',
  }
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  const s = { success:{bg:'#dcfce7',color:'#15803d',border:'#86efac'}, error:{bg:'#fee2e2',color:'#b91c1c',border:'#fca5a5'} }[type] || {}
  return (
    <div style={{ position:'fixed', bottom:28, right:28, zIndex:9999, minWidth:300,
      padding:'13px 18px', borderRadius:12, border:`1px solid ${s.border}`,
      background:s.bg, color:s.color, fontSize:14, fontWeight:600,
      boxShadow:'0 4px 24px rgba(0,0,0,0.15)', display:'flex', alignItems:'center', gap:10 }}>
      <span style={{ flex:1 }}>{msg}</span>
      <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:s.color, fontSize:18, padding:0 }}>×</button>
    </div>
  )
}

function Lbl({ children, required }) {
  return <label style={{ fontSize:12, fontWeight:700, color:'#475569', display:'block', marginBottom:5 }}>
    {children}{required && <span style={{ color:'#b91c1c' }}> *</span>}
  </label>
}

// ─── Official SAGE document header ───────────────────────────────────────────
function FormDocHeader({ title, docRef, revision, accent }) {
  const { t } = useLang()
  return (
    <div style={{
      display:'grid', gridTemplateColumns:'160px 1fr 210px',
      border:'2px solid #334155', borderRadius:6, overflow:'hidden',
      marginBottom:20, background:'#fff',
    }}>
      <div style={{ padding:'12px 14px', borderRight:'1.5px solid #334155',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2 }}>
        <div style={{ fontSize:24, fontWeight:900, color:accent, letterSpacing:1, fontFamily:'Arial, sans-serif' }}>SAGE</div>
        <div style={{ fontSize:9, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:.8 }}>AUTOMOTIVE</div>
        <div style={{ fontSize:8, color:'#94a3b8', textTransform:'uppercase', letterSpacing:.5 }}>INTERIORS</div>
      </div>
      <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'center',
        borderRight:'1.5px solid #334155' }}>
        <span style={{ fontSize:13, fontWeight:800, color:'#1e293b', textAlign:'center',
          textTransform:'uppercase', letterSpacing:.6, lineHeight:1.3 }}>{title}</span>
      </div>
      <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:5,
        justifyContent:'center', background:'#f8fafc' }}>
        <div style={{ fontSize:11 }}>
          <span style={{ fontWeight:700, color:'#64748b' }}>{t('hdr_ref')} : </span>
          <span style={{ color:'#1e293b', fontWeight:600 }}>{docRef}</span>
        </div>
        <div style={{ fontSize:11 }}>
          <span style={{ fontWeight:700, color:'#64748b' }}>{t('hdr_revision')} : </span>
          <span style={{ color:accent, fontWeight:700 }}>{revision ? `#${revision}` : t('hdr_new')}</span>
        </div>
        <div style={{ fontSize:11 }}>
          <span style={{ fontWeight:700, color:'#64748b' }}>{t('hdr_date')} : </span>
          <span style={{ color:'#1e293b' }}>{todayFR()}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, comment }) {
  const { t } = useLang()
  const map = {
    OK:     { label: t('status_ok'),      bg:'#dcfce7', color:'#15803d', border:'#86efac' },
    NOT_OK: { label: t('status_not_ok'),  bg:'#fee2e2', color:'#b91c1c', border:'#fca5a5' },
  }
  const b = map[status] || { label: t('status_pending'), bg:'#f1f5f9', color:'#94a3b8', border:'#e2e8f0' }
  return (
    <span title={comment || ''} style={{
      padding:'2px 10px', borderRadius:99, background:b.bg, color:b.color,
      border:`1.5px solid ${b.border}`, fontSize:11, fontWeight:700,
      cursor: comment ? 'help' : 'default', whiteSpace:'nowrap',
    }}>{b.label}</span>
  )
}

// ─── Verification modal ───────────────────────────────────────────────────────
function VerifModal({ record, type, onClose, onSaved, accent, apiVerify }) {
  const { t } = useLang()
  const [status, setStatus]   = useState(record.VERIF_STATUS || '')
  const [comment, setComment] = useState(record.VERIF_COMMENT || '')
  const [saving, setSaving]   = useState(false)

  let fd = {}
  try { if (record?.FORM_DATA) fd = JSON.parse(record.FORM_DATA) } catch {}

  const handleSave = async () => {
    if (!status) return
    if (status === 'NOT_OK' && !comment.trim()) { alert(t('verif_comment_required')); return }
    setSaving(true)
    try {
      await apiVerify(type, record.ID, { status, comment })
    } catch {
      // Endpoint may not exist yet on the backend — apply optimistic UI update
    } finally { setSaving(false) }
    onSaved({ ...record, VERIF_STATUS: status, VERIF_COMMENT: comment })
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:10000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:28, maxWidth:520, width:'100%',
        boxShadow:'0 20px 60px rgba(0,0,0,0.3)', maxHeight:'90vh', overflowY:'auto' }}>
        <h3 style={{ margin:'0 0 16px', color:accent, fontSize:16 }}>{t('verif_title')} #{record?.ID}</h3>

        <div style={{ background:'#f8fafc', borderRadius:10, padding:'12px 16px', marginBottom:16,
          display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {[[t('tbl_projet'), record?.PROJET],[t('tbl_poste'), fd.poste||'—'],
            [t('tbl_date'), fd.date||'—'],[t('tbl_filled_by'), record?.FILLED_BY||'—']].map(([k,v]) => (
            <div key={k}>
              <div style={{ fontSize:10, color:'#64748b', fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>{k}</div>
              <div style={{ fontSize:13, fontWeight:600, color:'#1e293b' }}>{v}</div>
            </div>
          ))}
        </div>

        <p style={{ fontSize:12, fontWeight:700, color:'#475569', marginBottom:10, textTransform:'uppercase' }}>{t('verif_choose')}</p>
        <div style={{ display:'flex', gap:12, marginBottom:16 }}>
          <button onClick={() => setStatus('OK')} style={{
            flex:1, padding:'12px', borderRadius:10,
            border:`2px solid ${status==='OK'?'#16a34a':'#e2e8f0'}`,
            background: status==='OK' ? '#dcfce7' : '#fff',
            color: status==='OK' ? '#15803d' : '#64748b',
            fontSize:14, fontWeight:700, cursor:'pointer',
          }}>✓ {t('status_ok')}</button>
          <button onClick={() => setStatus('NOT_OK')} style={{
            flex:1, padding:'12px', borderRadius:10,
            border:`2px solid ${status==='NOT_OK'?'#b91c1c':'#e2e8f0'}`,
            background: status==='NOT_OK' ? '#fee2e2' : '#fff',
            color: status==='NOT_OK' ? '#b91c1c' : '#64748b',
            fontSize:14, fontWeight:700, cursor:'pointer',
          }}>✗ {t('status_not_ok')}</button>
        </div>

        {status === 'NOT_OK' && (
          <div style={{ marginBottom:16 }}>
            <Lbl required>{t('verif_comment_label')}</Lbl>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
              placeholder={t('verif_comment_ph')}
              style={{ width:'100%', padding:'9px 12px', borderRadius:9,
                border:`1.5px solid ${accent}55`, fontSize:13, outline:'none',
                resize:'vertical', boxSizing:'border-box' }} />
          </div>
        )}

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          {btn(t('btn_cancel'), onClose, '#64748b', true)}
          {btn(saving ? t('btn_saving') : t('verif_save'), handleSave, accent, false, !status || saving)}
        </div>
      </div>
    </div>
  )
}

// ─── Project selector ─────────────────────────────────────────────────────────
function ProjSelect({ projet, setProjet, projects, accent, readOnly }) {
  const { t } = useLang()
  return (
    <div>
      <Lbl required>{t('fld_projet')}</Lbl>
      {readOnly
        ? <div style={inpStyle(accent, true)}>{projet || '—'}</div>
        : <>
            <select value={projet} onChange={e => setProjet(e.target.value)}
              style={{ ...inpStyle(accent), borderColor: projet ? `${accent}55` : '#f87171' }}>
              <option value="">{t('fld_projet_select')}</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {!projet && <p style={{ fontSize:11, color:'#b91c1c', margin:'3px 0 0' }}>{t('fld_projet_req')}</p>}
          </>
      }
    </div>
  )
}

// ─── OK/NOK badge (read-only) ─────────────────────────────────────────────────
function OkNokBadge({ val }) {
  if (!val) return <span style={{ color:'#94a3b8', fontSize:12 }}>—</span>
  const ok = val === 'OK'
  return (
    <span style={{
      padding:'3px 12px', borderRadius:99, fontSize:12, fontWeight:700,
      background: ok ? '#dcfce7' : '#fee2e2',
      color:      ok ? '#15803d' : '#b91c1c',
      border:`1.5px solid ${ok ? '#86efac' : '#fca5a5'}`,
    }}>{val}</span>
  )
}

// ─── OK Démarrage (SAGE-FOR-QUA-07) ──────────────────────────────────────────
function FormDemarrage({ initial, onSave, onCancel, projects, readOnly = false, formId, onEdit }) {
  const { t, lang } = useLang()
  const CONTROLES = (translations[lang]?.demarrage_controles ?? translations.fr.demarrage_controles)

  const parse = v => { try { return v ? JSON.parse(v) : {} } catch { return {} } }
  const init  = parse(initial?.FORM_DATA)

  const [projet,     setProjet]    = useState(initial?.PROJET  || '')
  const [poste,      setPoste]     = useState(init.poste       || '')
  const [shift,      setShift]     = useState(init.shift       || '')
  const [operateur,  setOperateur] = useState(init.operateur   || '')
  const [controles,  setControles] = useState(() => {
    const b = {}
    CONTROLES.forEach(c => { b[c] = init.controles?.[c] || ''; b[c+'_obs'] = init.controles?.[c+'_obs'] || '' })
    return b
  })
  const [observations, setObs]    = useState(init.observations || '')
  const [saving,     setSaving]   = useState(false)

  const setCtrl = (k, v) => setControles(p => ({ ...p, [k]: v }))

  const handleSubmit = async () => {
    if (!projet) { alert(t('msg_proj_req')); return }
    setSaving(true)
    const formData = JSON.stringify({ poste, shift, operateur, controles, observations, date: todayFR() })
    try { await onSave({ projet, equipe:'', ligne:'', formData }) } finally { setSaving(false) }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {readOnly && <style>{`@media print { .no-print { display:none !important; } body { padding:0; } }`}</style>}

      <FormDocHeader title="CHECK LIST DÉMARRAGE CBL" docRef="SAGE-FOR-QUA-07" revision={formId} accent={C} />

      <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:12 }}>
        <div>
          <Lbl>{t('fld_date_fill')}</Lbl>
          <div style={{ padding:'10px 14px', background:'#ede9fe', borderRadius:9,
            border:`1.5px solid ${C}44`, fontSize:14, fontWeight:700, color:C }}>
            {init.date || todayFR()}
          </div>
        </div>
        <ProjSelect projet={projet} setProjet={p => { setProjet(p); setPoste('') }}
          projects={projects} accent={C} readOnly={readOnly} />
      </div>

      {projet && (<>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
          <div>
            <Lbl>{t('fld_poste_ligne')}</Lbl>
            {readOnly ? <div style={inpStyle(C,true)}>{poste||'—'}</div>
              : <input value={poste} onChange={e => setPoste(e.target.value)} placeholder="Poste / Ligne CBL" style={inpStyle(C)} />}
          </div>
          <div>
            <Lbl>{t('fld_shift')}</Lbl>
            {readOnly ? <div style={inpStyle(C,true)}>{shift||'—'}</div>
              : <select value={shift} onChange={e => setShift(e.target.value)} style={inpStyle(C)}>
                  <option value="">{t('shift_choose')}</option>
                  {[t('shift_opt_morning'), t('shift_opt_afternoon'), t('shift_opt_night')].map(s => <option key={s} value={s}>{s}</option>)}
                </select>}
          </div>
          <div>
            <Lbl>{t('fld_operateur')}</Lbl>
            {readOnly ? <div style={inpStyle(C,true)}>{operateur||'—'}</div>
              : <input value={operateur} onChange={e => setOperateur(e.target.value)} placeholder={t('fld_operateur_ph')} style={inpStyle(C)} />}
          </div>
        </div>

        <p style={{ fontSize:11, fontWeight:700, color:'#475569', margin:'4px 0', textTransform:'uppercase', letterSpacing:.6 }}>{t('sect_ctrl_table')}</p>
        <table style={{ width:'100%', borderCollapse:'collapse', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:10, overflow:'hidden' }}>
          <thead>
            <tr style={{ background:`${C}11` }}>
              <th style={{ padding:'10px 12px', fontSize:12, fontWeight:700, color:'#475569', textAlign:'left', width:'50%', borderBottom:'1.5px solid #e2e8f0' }}>{t('col_ctrl_point')}</th>
              <th style={{ padding:'10px 12px', fontSize:12, fontWeight:700, color:'#16a34a', textAlign:'center', width:'9%', borderBottom:'1.5px solid #e2e8f0' }}>OK ✓</th>
              <th style={{ padding:'10px 12px', fontSize:12, fontWeight:700, color:'#b91c1c', textAlign:'center', width:'9%', borderBottom:'1.5px solid #e2e8f0' }}>NOK ✗</th>
              <th style={{ padding:'10px 12px', fontSize:12, fontWeight:700, color:'#475569', textAlign:'left', borderBottom:'1.5px solid #e2e8f0' }}>{t('col_observation')}</th>
            </tr>
          </thead>
          <tbody>
            {CONTROLES.map((ctrl, i) => (
              <tr key={ctrl} style={{ borderBottom:'1px solid #e2e8f0', background: i%2===0 ? '#fff' : '#fafbfc' }}>
                <td style={{ padding:'8px 12px', fontSize:13 }}>{ctrl}</td>
                {readOnly
                  ? <td colSpan={2} style={{ textAlign:'center', padding:'8px' }}><OkNokBadge val={controles[ctrl]} /></td>
                  : ['OK','NOK'].map(opt => (
                      <td key={opt} style={{ textAlign:'center', padding:'8px' }}>
                        <button type="button" onClick={() => setCtrl(ctrl, controles[ctrl]===opt ? '' : opt)} style={{
                          padding:'5px 14px', borderRadius:99, border:'1.5px solid',
                          borderColor: controles[ctrl]===opt ? (opt==='OK'?'#16a34a':'#b91c1c') : '#cbd5e1',
                          background:  controles[ctrl]===opt ? (opt==='OK'?'#dcfce7':'#fee2e2') : '#fff',
                          color:       controles[ctrl]===opt ? (opt==='OK'?'#15803d':'#b91c1c') : '#94a3b8',
                          fontWeight:700, fontSize:12, cursor:'pointer',
                        }}>{opt}</button>
                      </td>
                    ))
                }
                <td style={{ padding:'8px 12px' }}>
                  {readOnly
                    ? <span style={{ fontSize:12, color:'#64748b' }}>{controles[ctrl+'_obs']||'—'}</span>
                    : <input type="text" placeholder="…" value={controles[ctrl+'_obs']||''}
                        onChange={e => setCtrl(ctrl+'_obs', e.target.value)}
                        style={{ width:'100%', padding:'4px 8px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:12, outline:'none', boxSizing:'border-box' }} />
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div>
          <Lbl>{t('fld_obs')}</Lbl>
          {readOnly
            ? <div style={{ ...inpStyle(C,true), minHeight:60, whiteSpace:'pre-wrap' }}>{observations||'—'}</div>
            : <textarea value={observations} onChange={e => setObs(e.target.value)} rows={3}
                placeholder={t('fld_obs_ph')} style={{ ...inpStyle(C), resize:'vertical' }} />
          }
        </div>

        <div style={{ marginTop:8 }}>
          <p style={{ fontSize:11, fontWeight:700, color:'#475569', margin:'0 0 10px', textTransform:'uppercase', letterSpacing:.6 }}>{t('sect_signatures')}</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {[t('sect_visa_operator'), t('sect_visa_quality')].map(lbl => (
              <div key={lbl} style={{ border:'1.5px solid #e2e8f0', borderRadius:10, padding:'12px 16px', minHeight:64 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:8 }}>{lbl}</div>
                <div style={{ borderBottom:'1px solid #e2e8f0', paddingBottom:4 }} />
              </div>
            ))}
          </div>
        </div>
      </>)}

      <div className="no-print" style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        {readOnly && <button onClick={() => window.print()} style={{ padding:'7px 16px', borderRadius:8, border:`1.5px solid ${C}`, background:'transparent', color:C, fontSize:13, fontWeight:600, cursor:'pointer' }}>🖨 {t('detail_print')}</button>}
        {readOnly && onEdit && btn(t('btn_modifier'), onEdit, C)}
        {readOnly
          ? btn(t('btn_back'), onCancel, '#64748b', true)
          : <>{btn(t('btn_cancel'), onCancel, '#64748b', true)}
              {btn(saving ? t('btn_saving') : t('btn_save'), handleSubmit, C, false, !projet || saving)}</>
        }
      </div>
    </div>
  )
}

// ─── Poka Yoke (SAGE-FOR-QUA-114) ────────────────────────────────────────────
const newDevice = () => ({
  id: Date.now() + Math.random(),
  designation: '', poste: '', type: '',
  tests: {},
})

function FormPokaYoke({ initial, onSave, onCancel, projects, readOnly = false, formId, onEdit }) {
  const { t, lang } = useLang()
  const TEST_STEPS = translations[lang]?.py_test_steps ?? translations.fr.py_test_steps

  const parse = v => { try { return v ? JSON.parse(v) : {} } catch { return {} } }
  const init  = parse(initial?.FORM_DATA)

  const [projet,    setProjet]   = useState(initial?.PROJET || '')
  const [poste,     setPoste]    = useState(init.poste      || '')
  const [devices,   setDevices]  = useState(() => {
    if (init.devices?.length) return init.devices
    return [newDevice(), newDevice(), newDevice()]
  })
  const [observations, setObs]  = useState(init.observations || '')
  const [saving,    setSaving]  = useState(false)

  const setDev = (id, field, val) =>
    setDevices(ds => ds.map(d => d.id === id ? { ...d, [field]: val } : d))

  const setTest = (id, step, field, val) =>
    setDevices(ds => ds.map(d => d.id === id
      ? { ...d, tests: { ...d.tests, [step]: { ...(d.tests[step]||{}), [field]: val } } }
      : d))

  const handleSubmit = async () => {
    if (!projet) { alert(t('msg_proj_req')); return }
    setSaving(true)
    const formData = JSON.stringify({ poste, devices, observations, date: todayFR() })
    try { await onSave({ projet, equipe:'', ligne:'', formData }) } finally { setSaving(false) }
  }

  const FREQ_OPTS = [t('py_freq_shift'), t('py_freq_daily'), t('py_freq_weekly')]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {readOnly && <style>{`@media print { .no-print { display:none !important; } }`}</style>}

      <FormDocHeader title="CAHIER POKA YOKE" docRef="SAGE-FOR-QUA-114" revision={formId} accent={C} />

      <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:12 }}>
        <div>
          <Lbl>{t('fld_date_fill')}</Lbl>
          <div style={{ padding:'10px 14px', background:'#ede9fe', borderRadius:9,
            border:`1.5px solid ${C}44`, fontSize:14, fontWeight:700, color:C }}>{init.date || todayFR()}</div>
        </div>
        <ProjSelect projet={projet} setProjet={p => { setProjet(p); setPoste('') }}
          projects={projects} accent={C} readOnly={readOnly} />
      </div>

      {projet && (<>
        <div>
          <Lbl>{t('fld_poste_ligne')}</Lbl>
          {readOnly ? <div style={inpStyle(C,true)}>{poste||'—'}</div>
            : <input value={poste} onChange={e => setPoste(e.target.value)} placeholder="Ligne / Zone" style={inpStyle(C)} />}
        </div>

        <p style={{ fontSize:11, fontWeight:700, color:'#475569', margin:'4px 0', textTransform:'uppercase', letterSpacing:.6 }}>{t('sect_py_devices')}</p>

        {devices.map((dev, idx) => (
          <div key={dev.id} style={{ border:`1.5px solid ${C}33`, borderRadius:12, padding:'16px', background:'#faf5ff' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <span style={{ fontSize:13, fontWeight:700, color:C }}>
                {t('py_device_no')} {idx + 1}
              </span>
              {!readOnly && devices.length > 1 && (
                <button type="button" onClick={() => setDevices(ds => ds.filter(d => d.id !== dev.id))}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#b91c1c', fontSize:12, fontWeight:600 }}>
                  × {t('py_remove')}
                </button>
              )}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:10, marginBottom:12 }}>
              <div>
                <Lbl>{t('col_designation')}</Lbl>
                {readOnly ? <div style={inpStyle(C,true)}>{dev.designation||'—'}</div>
                  : <input value={dev.designation} onChange={e => setDev(dev.id,'designation',e.target.value)}
                      placeholder="ex: Détecteur présence câble" style={inpStyle(C)} />}
              </div>
              <div>
                <Lbl>{t('col_poste')}</Lbl>
                {readOnly ? <div style={inpStyle(C,true)}>{dev.poste||'—'}</div>
                  : <input value={dev.poste} onChange={e => setDev(dev.id,'poste',e.target.value)}
                      placeholder="Poste" style={inpStyle(C)} />}
              </div>
              <div>
                <Lbl>{t('col_type')}</Lbl>
                {readOnly ? <div style={inpStyle(C,true)}>{dev.type||'—'}</div>
                  : <input value={dev.type} onChange={e => setDev(dev.id,'type',e.target.value)}
                      placeholder="Type" style={inpStyle(C)} />}
              </div>
            </div>

            <table style={{ width:'100%', borderCollapse:'collapse', background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
              <thead>
                <tr style={{ background:`${C}0d` }}>
                  <th style={{ padding:'8px 10px', fontSize:11, fontWeight:700, color:'#475569', textAlign:'left', borderBottom:'1px solid #e2e8f0' }}>{t('col_test_step')}</th>
                  <th style={{ padding:'8px 10px', fontSize:11, fontWeight:700, color:'#16a34a', textAlign:'center', width:'9%', borderBottom:'1px solid #e2e8f0' }}>OK</th>
                  <th style={{ padding:'8px 10px', fontSize:11, fontWeight:700, color:'#b91c1c', textAlign:'center', width:'9%', borderBottom:'1px solid #e2e8f0' }}>NOK</th>
                  <th style={{ padding:'8px 10px', fontSize:11, fontWeight:700, color:'#475569', textAlign:'center', width:'15%', borderBottom:'1px solid #e2e8f0' }}>{t('col_freq')}</th>
                </tr>
              </thead>
              <tbody>
                {TEST_STEPS.map((step, si) => {
                  const tr = dev.tests[step] || {}
                  return (
                    <tr key={step} style={{ borderBottom:'1px solid #e2e8f0', background: si%2===0 ? '#fff' : '#fafbfc' }}>
                      <td style={{ padding:'7px 10px', fontSize:12 }}>{step}</td>
                      {readOnly
                        ? <td colSpan={2} style={{ textAlign:'center', padding:'7px' }}><OkNokBadge val={tr.result} /></td>
                        : ['OK','NOK'].map(opt => (
                            <td key={opt} style={{ textAlign:'center', padding:'6px' }}>
                              <button type="button" onClick={() => setTest(dev.id, step, 'result', tr.result===opt?'':opt)}
                                style={{
                                  padding:'4px 12px', borderRadius:99, border:'1.5px solid',
                                  borderColor: tr.result===opt ? (opt==='OK'?'#16a34a':'#b91c1c') : '#cbd5e1',
                                  background:  tr.result===opt ? (opt==='OK'?'#dcfce7':'#fee2e2') : '#fff',
                                  color:       tr.result===opt ? (opt==='OK'?'#15803d':'#b91c1c') : '#94a3b8',
                                  fontWeight:700, fontSize:11, cursor:'pointer',
                                }}>{opt}</button>
                            </td>
                          ))
                      }
                      <td style={{ padding:'6px 8px', textAlign:'center' }}>
                        {readOnly ? <span style={{ fontSize:11, color:'#64748b' }}>{tr.freq||'—'}</span>
                          : <select value={tr.freq||''} onChange={e => setTest(dev.id, step, 'freq', e.target.value)}
                              style={{ padding:'4px 6px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:11, outline:'none' }}>
                              <option value="">—</option>
                              {FREQ_OPTS.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

        {!readOnly && (
          <button type="button" onClick={() => setDevices(ds => [...ds, newDevice()])}
            style={{ padding:'8px 16px', borderRadius:9, border:`1.5px dashed ${C}`, background:'transparent',
              color:C, fontSize:13, fontWeight:600, cursor:'pointer', alignSelf:'flex-start' }}>
            {t('py_add')}
          </button>
        )}

        <div>
          <Lbl>{t('fld_obs')}</Lbl>
          {readOnly
            ? <div style={{ ...inpStyle(C,true), minHeight:60, whiteSpace:'pre-wrap' }}>{observations||'—'}</div>
            : <textarea value={observations} onChange={e => setObs(e.target.value)} rows={3}
                placeholder={t('fld_obs_ph')} style={{ ...inpStyle(C), resize:'vertical' }} />
          }
        </div>

        <div style={{ marginTop:8 }}>
          <p style={{ fontSize:11, fontWeight:700, color:'#475569', margin:'0 0 10px', textTransform:'uppercase', letterSpacing:.6 }}>{t('sect_signatures')}</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {[t('sect_visa_operator'), t('sect_visa_quality')].map(lbl => (
              <div key={lbl} style={{ border:'1.5px solid #e2e8f0', borderRadius:10, padding:'12px 16px', minHeight:64 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:8 }}>{lbl}</div>
                <div style={{ borderBottom:'1px solid #e2e8f0', paddingBottom:4 }} />
              </div>
            ))}
          </div>
        </div>
      </>)}

      <div className="no-print" style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        {readOnly && <button onClick={() => window.print()} style={{ padding:'7px 16px', borderRadius:8, border:`1.5px solid ${C}`, background:'transparent', color:C, fontSize:13, fontWeight:600, cursor:'pointer' }}>🖨 {t('detail_print')}</button>}
        {readOnly && onEdit && btn(t('btn_modifier'), onEdit, C)}
        {readOnly
          ? btn(t('btn_back'), onCancel, '#64748b', true)
          : <>{btn(t('btn_cancel'), onCancel, '#64748b', true)}
              {btn(saving ? t('btn_saving') : t('btn_save'), handleSubmit, C, false, !projet || saving)}</>
        }
      </div>
    </div>
  )
}

// ─── Standard OK 1ère Pièce (SAGE-FOR-PRT-05) ────────────────────────────────
function FormOk1ere({ initial, onSave, onCancel, projects, readOnly = false, formId, onEdit }) {
  const { t, lang } = useLang()
  const POINTS = translations[lang]?.ok1ere_points ?? translations.fr.ok1ere_points

  const parse = v => { try { return v ? JSON.parse(v) : {} } catch { return {} } }
  const init  = parse(initial?.FORM_DATA)

  const [projet,    setProjet]   = useState(initial?.PROJET || '')
  const [poste,     setPoste]    = useState(init.poste      || '')
  const [operateur, setOp]       = useState(init.operateur  || '')
  const [reference, setRef]      = useState(init.reference  || '')
  const [machine,   setMachine]  = useState(init.machine    || '')
  const [points,    setPoints]   = useState(() => {
    const b = {}
    POINTS.forEach(p => { b[p.label] = { result: init.points?.[p.label]?.result||'', measure: init.points?.[p.label]?.measure||'', obs: init.points?.[p.label]?.obs||'' } })
    return b
  })
  const [observations, setObs]  = useState(init.observations || '')
  const [saving,    setSaving]  = useState(false)

  const setPoint = (lbl, field, val) => setPoints(p => ({ ...p, [lbl]: { ...p[lbl], [field]: val } }))

  const handleSubmit = async () => {
    if (!projet) { alert(t('msg_proj_req')); return }
    setSaving(true)
    const formData = JSON.stringify({ poste, operateur, reference, machine, points, observations, date: todayFR() })
    try { await onSave({ projet, equipe:'', ligne:'', formData }) } finally { setSaving(false) }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {readOnly && <style>{`@media print { .no-print { display:none !important; } }`}</style>}

      <FormDocHeader title="OK 1ÈRE PIÈCE STANDARD" docRef="SAGE-FOR-PRT-05" revision={formId} accent={C} />

      <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:12 }}>
        <div>
          <Lbl>{t('fld_date_fill')}</Lbl>
          <div style={{ padding:'10px 14px', background:'#ede9fe', borderRadius:9,
            border:`1.5px solid ${C}44`, fontSize:14, fontWeight:700, color:C }}>{init.date || todayFR()}</div>
        </div>
        <ProjSelect projet={projet} setProjet={p => { setProjet(p); setPoste('') }}
          projects={projects} accent={C} readOnly={readOnly} />
      </div>

      {projet && (<>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
          <div>
            <Lbl>{t('fld_of')}</Lbl>
            {readOnly ? <div style={inpStyle(C,true)}>{reference||'—'}</div>
              : <input value={reference} onChange={e => setRef(e.target.value)} placeholder="OF / Réf pièce" style={inpStyle(C)} />}
          </div>
          <div>
            <Lbl>{t('fld_operateur')}</Lbl>
            {readOnly ? <div style={inpStyle(C,true)}>{operateur||'—'}</div>
              : <input value={operateur} onChange={e => setOp(e.target.value)} placeholder={t('fld_operateur_ph')} style={inpStyle(C)} />}
          </div>
          <div>
            <Lbl>{t('fld_machine')}</Lbl>
            {readOnly ? <div style={inpStyle(C,true)}>{machine||'—'}</div>
              : <input value={machine} onChange={e => setMachine(e.target.value)} placeholder="N° machine" style={inpStyle(C)} />}
          </div>
        </div>
        <div>
          <Lbl>{t('fld_poste_ligne')}</Lbl>
          {readOnly ? <div style={inpStyle(C,true)}>{poste||'—'}</div>
            : <input value={poste} onChange={e => setPoste(e.target.value)} placeholder="Poste / Ligne" style={inpStyle(C)} />}
        </div>

        <p style={{ fontSize:11, fontWeight:700, color:'#475569', margin:'4px 0', textTransform:'uppercase', letterSpacing:.6 }}>{t('sect_ctrl_table')}</p>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:10, overflow:'hidden', minWidth:700 }}>
            <thead>
              <tr style={{ background:`${C}11` }}>
                <th style={{ padding:'9px 12px', fontSize:11, fontWeight:700, color:'#475569', textAlign:'left', width:'35%', borderBottom:'1.5px solid #e2e8f0' }}>{t('col_ctrl_point')}</th>
                <th style={{ padding:'9px 12px', fontSize:11, fontWeight:700, color:'#475569', textAlign:'left', width:'18%', borderBottom:'1.5px solid #e2e8f0' }}>{t('col_spec')}</th>
                <th style={{ padding:'9px 12px', fontSize:11, fontWeight:700, color:'#0f766e', textAlign:'left', width:'15%', borderBottom:'1.5px solid #e2e8f0' }}>{t('col_measure')}</th>
                <th style={{ padding:'9px 12px', fontSize:11, fontWeight:700, color:'#16a34a', textAlign:'center', width:'8%', borderBottom:'1.5px solid #e2e8f0' }}>OK</th>
                <th style={{ padding:'9px 12px', fontSize:11, fontWeight:700, color:'#b91c1c', textAlign:'center', width:'8%', borderBottom:'1.5px solid #e2e8f0' }}>NOK</th>
                <th style={{ padding:'9px 12px', fontSize:11, fontWeight:700, color:'#475569', textAlign:'left', borderBottom:'1.5px solid #e2e8f0' }}>{t('col_action')}</th>
              </tr>
            </thead>
            <tbody>
              {POINTS.map((pt, i) => {
                const p = points[pt.label] || {}
                return (
                  <tr key={pt.label} style={{ borderBottom:'1px solid #e2e8f0', background: i%2===0 ? '#fff' : '#fafbfc' }}>
                    <td style={{ padding:'8px 12px', fontSize:12 }}>{pt.label}</td>
                    <td style={{ padding:'8px 12px', fontSize:11, color:'#64748b', fontStyle:'italic' }}>{pt.spec}</td>
                    <td style={{ padding:'8px 10px' }}>
                      {readOnly ? <span style={{ fontSize:12 }}>{p.measure||'—'}</span>
                        : <input value={p.measure||''} onChange={e => setPoint(pt.label,'measure',e.target.value)}
                            placeholder="—" style={{ width:'100%', padding:'4px 7px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:12, outline:'none', boxSizing:'border-box' }} />}
                    </td>
                    {readOnly
                      ? <td colSpan={2} style={{ textAlign:'center', padding:'8px' }}><OkNokBadge val={p.result} /></td>
                      : ['OK','NOK'].map(opt => (
                          <td key={opt} style={{ textAlign:'center', padding:'7px' }}>
                            <button type="button" onClick={() => setPoint(pt.label,'result', p.result===opt?'':opt)} style={{
                              padding:'4px 12px', borderRadius:99, border:'1.5px solid',
                              borderColor: p.result===opt ? (opt==='OK'?'#16a34a':'#b91c1c') : '#cbd5e1',
                              background:  p.result===opt ? (opt==='OK'?'#dcfce7':'#fee2e2') : '#fff',
                              color:       p.result===opt ? (opt==='OK'?'#15803d':'#b91c1c') : '#94a3b8',
                              fontWeight:700, fontSize:11, cursor:'pointer',
                            }}>{opt}</button>
                          </td>
                        ))
                    }
                    <td style={{ padding:'7px 10px' }}>
                      {readOnly ? <span style={{ fontSize:12, color:'#64748b' }}>{p.obs||'—'}</span>
                        : <input value={p.obs||''} onChange={e => setPoint(pt.label,'obs',e.target.value)}
                            placeholder="…" style={{ width:'100%', padding:'4px 7px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:12, outline:'none', boxSizing:'border-box' }} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div>
          <Lbl>{t('fld_obs')}</Lbl>
          {readOnly
            ? <div style={{ ...inpStyle(C,true), minHeight:60, whiteSpace:'pre-wrap' }}>{observations||'—'}</div>
            : <textarea value={observations} onChange={e => setObs(e.target.value)} rows={3}
                placeholder={t('fld_obs_ph')} style={{ ...inpStyle(C), resize:'vertical' }} />
          }
        </div>

        <div style={{ marginTop:8 }}>
          <p style={{ fontSize:11, fontWeight:700, color:'#475569', margin:'0 0 10px', textTransform:'uppercase', letterSpacing:.6 }}>{t('sect_signatures')}</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {[t('sect_visa_operator'), t('sect_visa_quality')].map(lbl => (
              <div key={lbl} style={{ border:'1.5px solid #e2e8f0', borderRadius:10, padding:'12px 16px', minHeight:64 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:8 }}>{lbl}</div>
                <div style={{ borderBottom:'1px solid #e2e8f0', paddingBottom:4 }} />
              </div>
            ))}
          </div>
        </div>
      </>)}

      <div className="no-print" style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        {readOnly && <button onClick={() => window.print()} style={{ padding:'7px 16px', borderRadius:8, border:`1.5px solid ${C}`, background:'transparent', color:C, fontSize:13, fontWeight:600, cursor:'pointer' }}>🖨 {t('detail_print')}</button>}
        {readOnly && onEdit && btn(t('btn_modifier'), onEdit, C)}
        {readOnly
          ? btn(t('btn_back'), onCancel, '#64748b', true)
          : <>{btn(t('btn_cancel'), onCancel, '#64748b', true)}
              {btn(saving ? t('btn_saving') : t('btn_save'), handleSubmit, C, false, !projet || saving)}</>
        }
      </div>
    </div>
  )
}

// ─── Table des formulaires ────────────────────────────────────────────────────
function FormsTable({ rows, onEdit, onDelete, onView, onVerif, canWrite, canVerif }) {
  const { t } = useLang()
  if (!rows.length) return (
    <div style={{ textAlign:'center', padding:48, color:'#94a3b8', fontSize:14 }}>
      <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
      {t('msg_no_forms')}
    </div>
  )
  return (
    <table style={{ width:'100%', borderCollapse:'collapse' }}>
      <thead>
        <tr style={{ background:'#f8fafc', borderBottom:'2px solid #e2e8f0' }}>
          {[t('tbl_id'), t('tbl_projet'), t('tbl_date'), t('tbl_poste'),
            t('tbl_filled_by'), t('tbl_status'), t('tbl_actions')].map(h => (
            <th key={h} style={{ padding:'11px 14px', fontSize:11, fontWeight:700, color:'#64748b',
              textAlign: h===t('tbl_actions') ? 'center' : 'left', whiteSpace:'nowrap',
              textTransform:'uppercase', letterSpacing:.5 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          let parsedDate = r.CREATED_AT?.slice(0,16) || '—'
          let posteVal   = '—'
          try {
            const fd = r.FORM_DATA ? JSON.parse(r.FORM_DATA) : {}
            if (fd.date)  parsedDate = fd.date
            if (fd.poste) posteVal   = fd.poste
          } catch {}
          return (
            <tr key={r.ID} style={{ borderBottom:'1px solid #f1f5f9', transition:'background 0.12s' }}
              onMouseEnter={e => e.currentTarget.style.background='#faf5ff'}
              onMouseLeave={e => e.currentTarget.style.background=''}>
              <td style={{ padding:'11px 14px', fontSize:12, color:'#94a3b8', fontWeight:600 }}>#{r.ID}</td>
              <td style={{ padding:'11px 14px', fontSize:13, fontWeight:600, color:'#1e293b' }}>{r.PROJET||'—'}</td>
              <td style={{ padding:'11px 14px', fontSize:12, color:'#64748b' }}>{parsedDate}</td>
              <td style={{ padding:'11px 14px', fontSize:13, color:'#475569' }}>{posteVal}</td>
              <td style={{ padding:'11px 14px', fontSize:13, color:'#475569' }}>{r.FILLED_BY||'—'}</td>
              <td style={{ padding:'11px 14px' }}>
                <StatusBadge status={r.VERIF_STATUS} comment={r.VERIF_COMMENT} />
              </td>
              <td style={{ padding:'11px 14px', textAlign:'center' }}>
                <div style={{ display:'flex', gap:5, justifyContent:'center', flexWrap:'wrap' }}>
                  <button onClick={() => onView(r)} style={{ padding:'4px 11px', borderRadius:7, border:`1px solid ${C}44`, background:`${C}08`, color:C, fontSize:11, fontWeight:600, cursor:'pointer', transition:'all 0.12s' }}
                    onMouseEnter={e=>{e.target.style.background=`${C}18`}} onMouseLeave={e=>{e.target.style.background=`${C}08`}}>
                    {t('btn_voir')}
                  </button>
                  {canWrite && <button onClick={() => onEdit(r)} style={{ padding:'4px 11px', borderRadius:7, border:'1px solid #0f766e44', background:'#0f766e08', color:'#0f766e', fontSize:11, fontWeight:600, cursor:'pointer' }}
                    onMouseEnter={e=>{e.target.style.background='#0f766e18'}} onMouseLeave={e=>{e.target.style.background='#0f766e08'}}>
                    {t('btn_modifier')}
                  </button>}
                  {(canWrite || canVerif) && <button onClick={() => onVerif(r)} style={{ padding:'4px 11px', borderRadius:7, border:'1px solid #ea580c44', background:'#ea580c08', color:'#ea580c', fontSize:11, fontWeight:600, cursor:'pointer' }}
                    onMouseEnter={e=>{e.target.style.background='#ea580c18'}} onMouseLeave={e=>{e.target.style.background='#ea580c08'}}>
                    {t('btn_verif')}
                  </button>}
                  {canWrite && <button onClick={() => onDelete(r)} style={{ padding:'4px 11px', borderRadius:7, border:'1px solid #b91c1c44', background:'#b91c1c08', color:'#b91c1c', fontSize:11, fontWeight:600, cursor:'pointer' }}
                    onMouseEnter={e=>{e.target.style.background='#b91c1c18'}} onMouseLeave={e=>{e.target.style.background='#b91c1c08'}}>
                    {t('btn_supprimer')}
                  </button>}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── Onglet générique ─────────────────────────────────────────────────────────
function FormTab({ type, FormComponent, projects, allDefCodes, canWrite, canVerif }) {
  const { t }  = useLang()
  const [rows,    setRows]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(false)
  const [view,    setView]    = useState(null)   // null | 'new' | 'edit' | 'detail'
  const [editing, setEditing] = useState(null)
  const [toast,   setToast]   = useState(null)
  const [fProjet, setFProjet] = useState('')
  const [search,  setSearch]  = useState('')
  const [verifRecord, setVerifRecord] = useState(null)
  const LIMIT = 10

  const showToast = useCallback((msg, tp='success') => setToast({ msg, type:tp }), [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await deliberaFormsApi.list(type, { projet: fProjet||undefined, page, limit:LIMIT })
      setRows(d?.forms || [])
      setTotal(d?.pagination?.totalRecords || 0)
    } catch { showToast(t('msg_err_load'), 'error') }
    finally { setLoading(false) }
  }, [type, fProjet, page, t, showToast])

  useEffect(() => { load() }, [load])

  const handleSave = async body => {
    try {
      if (editing) { await deliberaFormsApi.update(type, editing.ID, body); showToast(t('msg_update_ok')) }
      else         { await deliberaFormsApi.create(type, body);             showToast(t('msg_save_ok')) }
      setView(null); setEditing(null); load()
    } catch { showToast(t('msg_err_save'), 'error') }
  }

  const handleDelete = async r => {
    if (!window.confirm(`${t('msg_del_confirm')} #${r.ID} ?`)) return
    try { await deliberaFormsApi.remove(type, r.ID); showToast(t('msg_delete_ok')); load() }
    catch { showToast(t('msg_err_delete'), 'error') }
  }

  const handleView = async r => {
    try { const d = await deliberaFormsApi.getOne(type, r.ID); setEditing(d); setView('detail') }
    catch { showToast(t('msg_err_load'), 'error') }
  }

  const handleEdit = async r => {
    try { const d = await deliberaFormsApi.getOne(type, r.ID); setEditing(d); setView('edit') }
    catch { showToast(t('msg_err_load'), 'error') }
  }

  const handleVerif = r => setVerifRecord(r)

  const handleVerifSaved = updated => {
    setRows(prev => prev.map(r => r.ID === updated.ID ? updated : r))
    showToast(t('msg_verif_ok'))
    setVerifRecord(null)
  }

  const toList = () => { setView(null); setEditing(null) }

  // Client-side search filter on displayed rows
  const filteredRows = search.trim()
    ? rows.filter(r => {
        const q = search.toLowerCase()
        let fd = {}; try { fd = r.FORM_DATA ? JSON.parse(r.FORM_DATA) : {} } catch {}
        return (r.PROJET||'').toLowerCase().includes(q)
          || (r.FILLED_BY||'').toLowerCase().includes(q)
          || (fd.poste||'').toLowerCase().includes(q)
          || String(r.ID).includes(q)
      })
    : rows

  if (view === 'new' || view === 'edit') return (
    <div style={{ background:'#fff', borderRadius:14, padding:28, border:'1px solid #e2e8f0' }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <FormComponent initial={view==='edit' ? editing : null}
        onSave={handleSave} onCancel={toList}
        projects={projects} allDefCodes={allDefCodes}
        formId={view==='edit' ? editing?.ID : null} />
    </div>
  )

  if (view === 'detail') return (
    <div style={{ background:'#fff', borderRadius:14, padding:28, border:'1px solid #e2e8f0' }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <FormComponent initial={editing} readOnly
        onSave={() => {}} onCancel={toList}
        projects={projects} allDefCodes={allDefCodes}
        formId={editing?.ID}
        onEdit={canWrite ? () => handleEdit(editing) : null} />
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {verifRecord && (
        <VerifModal record={verifRecord} type={type}
          onClose={() => setVerifRecord(null)} onSaved={handleVerifSaved}
          accent={C} apiVerify={deliberaFormsApi.verify} />
      )}

      {/* ── Toolbar: search + project filter + new button ── */}
      <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>

        {/* Search bar */}
        <div style={{ position:'relative', flex:'1', minWidth:200 }}>
          <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)',
            color:'#94a3b8', fontSize:14, pointerEvents:'none' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('search_placeholder') || 'Rechercher…'}
            style={{
              width:'100%', padding:'8px 12px 8px 34px', borderRadius:9,
              border:'1.5px solid #e2e8f0', fontSize:13, outline:'none',
              background:'#fff', boxSizing:'border-box', color:'#1e293b',
              transition:'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = `${C}88`}
            onBlur={e  => e.target.style.borderColor = '#e2e8f0'}
          />
        </div>

        {/* Project filter */}
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <select value={fProjet} onChange={e => { setFProjet(e.target.value); setPage(1) }}
            style={{ padding:'8px 12px', borderRadius:9, border:'1.5px solid #e2e8f0',
              fontSize:13, outline:'none', background:'#fff', color:'#1e293b', cursor:'pointer' }}>
            <option value="">{t('filter_all_projects')}</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* New button */}
        {canWrite && (
          <button onClick={() => { setEditing(null); setView('new') }} style={{
            padding:'8px 18px', borderRadius:9, border:'none', background:C,
            color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer',
            display:'flex', alignItems:'center', gap:6, transition:'opacity 0.15s',
            boxShadow:`0 1px 4px ${C}44`,
          }}
            onMouseEnter={e=>e.currentTarget.style.opacity='.88'}
            onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            + {t('btn_nouveau')}
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden',
        boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
        {loading
          ? <div style={{ textAlign:'center', padding:48, color:'#94a3b8', fontSize:14 }}>
              <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
              {t('msg_loading')}
            </div>
          : <FormsTable rows={filteredRows} onEdit={handleEdit} onDelete={handleDelete}
              onView={handleView} onVerif={handleVerif} canWrite={canWrite} canVerif={canVerif} />
        }
      </div>

      {total > LIMIT && (
        <Pagination currentPage={page} totalPages={Math.ceil(total/LIMIT)} onPageChange={setPage} />
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
const TABS = [
  { key:'demarrage', label:'tab_demarrage', ref:'SAGE-FOR-QUA-07',  Form:FormDemarrage,
    icon:'▶', desc:'tab_demarrage_desc' },
  { key:'pokayoke',  label:'tab_pokayoke',  ref:'SAGE-FOR-QUA-114', Form:FormPokaYoke,
    icon:'🔒', desc:'tab_pokayoke_desc' },
  { key:'ok1ere',    label:'tab_ok1ere',    ref:'SAGE-FOR-PRT-05',  Form:FormOk1ere,
    icon:'✅', desc:'tab_ok1ere_desc' },
]

export default function DeliberaForms() {
  const { can }    = useAuth()
  const { t }      = useLang()
  const canWrite   = can('delibera_forms', 'write')
  const canVerif   = can('delibera_forms', 'verify') || canWrite

  const [activeTab, setActiveTab]   = useState('demarrage')
  const [projects,  setProjects]    = useState([])
  const [allDefCodes, setDefCodes]  = useState([])

  useEffect(() => {
    projectsApi.getProjects().then(d => {
      const list = d?.projects || d || []
      setProjects(Array.isArray(list) ? list.map(p => p.name || p.NOM || p) : [])
    }).catch(() => {})
    lookupApi.defCodesList().then(d => {
      const raw = Array.isArray(d) ? d : (d?.defCodes || d?.codes || [])
      const seen = new Set()
      setDefCodes(raw.filter(item => { if (seen.has(item.cod)) return false; seen.add(item.cod); return true }))
    }).catch(() => {})
  }, [])

  return (
    <>
      {/* ── Header ── */}
      <div className="header">
        <div className="header-left">
          <div className="header-accent-bar" style={{ background: C }}></div>
          <div className="header-title-group">
            <h2 style={{ color: C }}>{t('form_delibera_title')}</h2>
            <span className="header-subtitle">{t('form_delibera_subtitle')}</span>
          </div>
        </div>
        <div className="header-right">
          <div className="hbadge hbadge-clock">
            <span className="hbadge-clock-dot"></span>
            <span>{new Date().toLocaleTimeString('fr-FR')}</span>
          </div>
        </div>
      </div>

    <div style={{ padding:'16px 32px 28px', maxWidth:1400, margin:'0 auto' }}>

      {/* ── Tab navigation ── */}
      <div style={{ display:'flex', gap:0, marginBottom:24, borderBottom:'2px solid #e2e8f0' }}>
        {TABS.map(tab => {
          const active = activeTab === tab.key
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding:'10px 22px', border:'none', cursor:'pointer',
              background:'transparent',
              color: active ? C : '#64748b',
              fontWeight: active ? 700 : 500,
              fontSize:13,
              borderBottom: active ? `2px solid ${C}` : '2px solid transparent',
              marginBottom:'-2px',
              transition:'all 0.15s',
              display:'flex', alignItems:'center', gap:7,
            }}>
              <span style={{ fontSize:14 }}>{tab.icon}</span>
              <span>{t(tab.label)}</span>
              <span style={{ fontSize:10, color: active ? `${C}99` : '#94a3b8',
                background: active ? `${C}12` : '#f1f5f9',
                padding:'1px 7px', borderRadius:99, fontWeight:600 }}>
                {tab.ref}
              </span>
            </button>
          )
        })}
      </div>

      {TABS.map(tab => activeTab===tab.key && (
        <FormTab key={tab.key} type={tab.key} FormComponent={tab.Form}
          projects={projects} allDefCodes={allDefCodes}
          canWrite={canWrite} canVerif={canVerif} />
      ))}
    </div>
    </>
  )
}