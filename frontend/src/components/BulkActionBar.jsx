import React from 'react'

/**
 * BulkActionBar — floating bar that appears when items are selected.
 * Props:
 *  - count:   number of selected items
 *  - onClear: callback to clear selection
 *  - children: action buttons / selects to render
 */
export default function BulkActionBar({ count, onClear, children }) {
  if (!count) return null
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', alignItems: 'center', gap: 12,
      background: '#1e293b', color: '#fff', borderRadius: 14,
      padding: '10px 20px', boxShadow: '0 8px 32px rgba(0,0,0,.35)',
      fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <span style={{ background: '#15803d', borderRadius: 99, padding: '2px 10px', fontSize: 12 }}>
        {count} sélectionné{count > 1 ? 's' : ''}
      </span>
      {children}
      <button
        onClick={onClear}
        style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', borderRadius: 8,
          padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
        Annuler
      </button>
    </div>
  )
}
