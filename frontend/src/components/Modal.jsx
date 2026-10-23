import { useEffect, useRef } from 'react'

/**
 * Premium modal component with animated open/close,
 * gradient header, consistent spacing and dark overlay.
 *
 * Props:
 *   title      — header text
 *   icon       — optional SVG element shown left of title
 *   accentColor — override gradient start color (default #15803d)
 *   onClose    — close handler
 *   footer     — optional footer JSX
 *   maxWidth   — optional max-width (default 520px)
 *   children   — body content
 */
export default function Modal({
  title,
  icon,
  accentColor = '#15803d',
  onClose,
  children,
  footer,
  maxWidth = 520,
}) {
  const panelRef = useRef(null)

  /* Auto-focus first input when opened */
  useEffect(() => {
    const el = panelRef.current?.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled])')
    el?.focus()
  }, [])

  const darkAccent = accentColor === '#15803d' ? '#166534' : accentColor

  return (
    <>
      <style>{`
        @keyframes modal-backdrop-in { from { opacity:0 } to { opacity:1 } }
        @keyframes modal-panel-in    { from { opacity:0; transform:scale(0.95) translateY(8px) } to { opacity:1; transform:scale(1) translateY(0) } }
        .modal-backdrop-overlay {
          animation: modal-backdrop-in 0.15s ease-out forwards;
        }
        .modal-panel {
          animation: modal-panel-in 0.18s ease-out forwards;
        }
        .modal-close-btn:hover { background: rgba(255,255,255,0.25) !important; }
        .modal-footer-btn-primary:hover { filter: brightness(0.9); }
        .modal-footer-btn-secondary:hover { background: #f1f5f9 !important; }
      `}</style>

      {/* Backdrop */}
      <div
        className="modal-backdrop-overlay"
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(10,14,30,0.72)',
          zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
          backdropFilter: 'blur(2px)',
        }}
      >
        {/* Panel */}
        <div
          ref={panelRef}
          className="modal-panel"
          style={{
            background: '#ffffff',
            borderRadius: 16,
            width: '100%',
            maxWidth,
            boxShadow: '0 20px 60px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column',
            maxHeight: '92vh',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            background: `linear-gradient(135deg, ${accentColor} 0%, ${darkAccent} 100%)`,
            padding: '18px 28px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {icon && (
                <div style={{
                  width: 36, height: 36,
                  background: 'rgba(255,255,255,0.18)',
                  borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {icon}
                </div>
              )}
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '0.01em' }}>
                {title}
              </span>
            </div>
            <button
              className="modal-close-btn"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                borderRadius: 8,
                width: 32, height: 32,
                cursor: 'pointer',
                color: '#fff',
                fontSize: 20, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.15s',
              }}
              aria-label="Fermer"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div style={{
            padding: '24px 28px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div style={{
              padding: '14px 28px',
              borderTop: '1px solid #e8ecf4',
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              flexShrink: 0,
              background: '#fafbfc',
            }}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ── Shared button helpers (import and use in pages) ──────────────────────── */

export function ModalBtn({ children, onClick, variant = 'primary', disabled = false, type = 'button', style = {} }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', border: 'none',
    fontFamily: 'inherit', transition: 'filter 0.15s, background 0.15s',
    opacity: disabled ? 0.55 : 1,
    ...style,
  }
  const variants = {
    primary:   { background: '#15803d', color: '#fff' },
    secondary: { background: '#f1f5f9', color: '#475569', border: '1.5px solid #e2e8f0' },
    danger:    { background: '#c92a2a', color: '#fff' },
    success:   { background: '#059669', color: '#fff' },
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`modal-footer-btn-${variant}`}
      style={{ ...base, ...variants[variant] }}
    >
      {children}
    </button>
  )
}

/* ── Shared form field helpers ─────────────────────────────────────────────── */

export function ModalField({ label, required, children, hint }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}{required && <span style={{ color: '#c92a2a', marginLeft: 3 }}>*</span>}
        </label>
      )}
      {children}
      {hint && <span style={{ fontSize: 11, color: '#94a3b8' }}>{hint}</span>}
    </div>
  )
}
