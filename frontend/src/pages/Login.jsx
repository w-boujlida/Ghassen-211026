import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { authApi } from '../api/auth.api.js'

export default function Login() {
  const [form, setForm]       = useState({ matricule: '', password: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const { login }             = useAuth()
  const navigate              = useNavigate()

  const clearError = () => setError('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    if (!form.matricule || !form.password) {
      setError('Veuillez remplir tous les champs.')
      return
    }
    setLoading(true)
    try {
      const data = await authApi.login(form.matricule, form.password)
      login(data)
      navigate('/home')
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Identifiants incorrects')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (hasError) => ({
    width: '100%', padding: '10px 14px 10px 38px',
    border: `1.5px solid ${hasError ? '#fca5a5' : '#e2e8f0'}`,
    borderRadius: 9, fontFamily: "'Inter', sans-serif", fontSize: 13.5,
    color: '#1e293b', background: hasError ? '#fef2f2' : '#f8fafc',
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color .18s, box-shadow .18s',
  })

  const features = [
    'Contrôle Firewall & CSL',
    'Tableaux de bord temps réel',
    'Traçabilité opérateurs',
    'Rapports de qualité',
  ]

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0d1f16',
      position: 'relative', overflow: 'hidden',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* bg-glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: [
          'radial-gradient(ellipse 65% 55% at 18% 50%, rgba(21,128,61,.16) 0%, transparent 65%)',
          'radial-gradient(ellipse 45% 45% at 82% 18%, rgba(22,101,52,.10) 0%, transparent 60%)',
          'radial-gradient(ellipse 50% 50% at 55% 88%, rgba(21,128,61,.07) 0%, transparent 60%)',
        ].join(', '),
      }} />
      {/* bg-grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: [
          'linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)',
        ].join(', '),
        backgroundSize: '48px 48px',
      }} />
      <img
        src="/sage-logo.png"
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute', width: 'min(64vw, 820px)', height: 'auto',
          left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          opacity: 0.1, pointerEvents: 'none',
        }}
      />

      {/* login-wrap */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', width: 940, minHeight: 550,
        borderRadius: 22, overflow: 'hidden',
        boxShadow: '0 40px 100px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.06)',
      }}>

        {/* ── Left panel ── */}
        <div style={{
          flex: 1,
          background: 'linear-gradient(150deg, #183328 0%, #1c3a2a 55%, #183328 100%)',
          padding: '52px 46px', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', position: 'relative', overflow: 'hidden',
          borderRight: '1px solid rgba(255,255,255,.06)',
        }}>
          {/* decorative circles */}
          <div style={{ position: 'absolute', top: -80, right: -80, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(21,128,61,.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -70, left: -70, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(22,101,52,.10) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '45%', left: '60%', width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(21,128,61,.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <img
            src="/sage-logo.png"
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute', width: '115%', height: 'auto',
              right: '-32%', top: '35%', opacity: 0.055,
              pointerEvents: 'none',
            }}
          />

          {/* Brand */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <img
              src="/sage-logo.png"
              alt="SAGE Automotive Interiors"
              style={{ display: 'block', width: 'min(100%, 310px)', height: 124, objectFit: 'contain', objectPosition: 'left center' }}
            />
          </div>

          {/* Body */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.5px', margin: '0 0 16px' }}>
              Quality<br /><span style={{ color: '#4ade80' }}>Control</span><br />System
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', lineHeight: 1.8, maxWidth: 280, margin: 0 }}>
              Système de gestion de la qualité pour le contrôle Firewall &amp; CSL des coiffes de siège automobile.
            </p>
          </div>

          {/* Features */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 11 }}>
            {features.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,.62)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', flexShrink: 0, boxShadow: '0 0 8px rgba(74,222,128,.8)', display: 'inline-block' }} />
                {f}
              </div>
            ))}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{
          width: 420, flexShrink: 0, background: '#ffffff',
          padding: '52px 44px', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', gap: 26,
        }}>
          <div>
            <h2 style={{ fontSize: 23, fontWeight: 800, color: '#1e293b', letterSpacing: '-0.5px', margin: '0 0 6px' }}>Connexion</h2>
            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.55, margin: 0 }}>
              Entrez vos identifiants pour accéder au système
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Matricule */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10.5, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Matricule</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none', display: 'flex' }}>
                  <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, stroke: 'currentColor', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </span>
                <input
                  type="text" placeholder="Votre matricule"
                  value={form.matricule}
                  autoFocus
                  onChange={e => { setForm(f => ({ ...f, matricule: e.target.value })); clearError() }}
                  style={inputStyle(!!error)}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10.5, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Mot de passe</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none', display: 'flex' }}>
                  <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, stroke: 'currentColor', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  type={showPwd ? 'text' : 'password'} placeholder="••••••••"
                  value={form.password}
                  onChange={e => { setForm(f => ({ ...f, password: e.target.value })); clearError() }}
                  style={{ ...inputStyle(!!error), paddingRight: 40 }}
                />
                <button
                  type="button" onClick={() => setShowPwd(v => !v)}
                  style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                >
                  {showPwd ? (
                    <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, stroke: 'currentColor', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, stroke: 'currentColor', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#991b1b' }}>
                <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 2, flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '12px 0', background: '#15803d', color: '#fff',
                border: 'none', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: loading ? 0.65 : 1,
                boxShadow: '0 4px 18px rgba(21,128,61,.4)',
                transition: 'all .2s',
                letterSpacing: '0.2px',
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = '#166534'; e.currentTarget.style.boxShadow = '0 6px 22px rgba(21,128,61,.48)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
              onMouseLeave={e => { e.currentTarget.style.background = '#15803d'; e.currentTarget.style.boxShadow = '0 4px 18px rgba(21,128,61,.4)'; e.currentTarget.style.transform = 'none' }}
            >
              {loading ? (
                <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin .6s linear infinite' }} />
              ) : (
                <>
                  <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, stroke: 'currentColor', fill: 'none', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                  </svg>
                  Se connecter
                </>
              )}
            </button>
          </form>

          <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', letterSpacing: '0.3px' }}>
            SAGE Quality System &mdash; v1.0
          </div>
        </div>
      </div>
    </div>
  )
}
