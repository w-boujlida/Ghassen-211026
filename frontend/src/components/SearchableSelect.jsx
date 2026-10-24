import { useEffect, useId, useMemo, useRef, useState } from 'react'

/**
 * Searchable dropdown (combobox) — replaces a long native <select>
 * with a text input that filters options as you type.
 *
 * Props:
 *   options     — [{ value: string, label: string }]
 *   value       — selected option value, or null when nothing is selected
 *   onChange    — (value: string | null) => void
 *   placeholder — shown when nothing is selected (default 'Choisir…')
 *   disabled    — disable the control
 *   ariaLabel   — accessibility label
 */
export default function SearchableSelect({ options, value, onChange, placeholder = 'Choisir…', disabled = false, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef(null)
  const listRef = useRef(null)
  const id = useId()
  const selected = options.find(o => o.value === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options
  }, [options, query])

  /* Close on click outside */
  useEffect(() => {
    if (!open) return
    const onDown = e => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  /* Reset highlight when the filtered list changes */
  useEffect(() => { setHighlight(0) }, [query, options])

  /* Keep the highlighted option visible while navigating with the keyboard */
  useEffect(() => {
    if (open) listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  const select = opt => {
    onChange(opt ? opt.value : null)
    setQuery('')
    setOpen(false)
  }

  const onKeyDown = e => {
    if (disabled) return
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') { e.preventDefault(); setOpen(true) }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlight]) select(filtered[highlight]) }
    else if (e.key === 'Escape') { e.stopPropagation(); setQuery(''); setOpen(false) }
  }

  return (
    <div ref={rootRef} className="searchable-select">
      <style>{`
        .searchable-select { position: relative; }
        .searchable-select .ss-input-wrap { position: relative; }
        .searchable-select .ss-input { padding-right: 30px; }
        .searchable-select .ss-chevron {
          position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
          color: #94a3b8; pointer-events: none; font-size: 10px;
        }
        .searchable-select .ss-clear {
          position: absolute; right: 26px; top: 50%; transform: translateY(-50%);
          border: none; background: none; color: #94a3b8; cursor: pointer;
          font-size: 14px; line-height: 1; padding: 2px 4px; border-radius: 4px;
        }
        .searchable-select .ss-clear:hover { color: #dc2626; background: #fef2f2; }
        .searchable-select .ss-list {
          position: absolute; z-index: 10000; top: calc(100% + 4px); left: 0; right: 0;
          max-height: 220px; overflow-y: auto; margin: 0; padding: 4px; list-style: none;
          background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
          box-shadow: 0 10px 30px rgba(15,23,42,.15);
        }
        .searchable-select .ss-option {
          padding: 8px 10px; border-radius: 6px; cursor: pointer;
          font-size: 13.5px; color: #0f172a; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis;
        }
        .searchable-select .ss-option.ss-active { background: #15803d; color: #fff; }
        .searchable-select .ss-option.ss-selected:not(.ss-active) { background: #f0fdf4; color: #15803d; font-weight: 600; }
        .searchable-select .ss-empty { padding: 10px; color: #94a3b8; font-size: 13px; text-align: center; }
      `}</style>
      <div className="ss-input-wrap">
        <input
          className="form-input ss-input"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${id}-list`}
          aria-activedescendant={open && filtered[highlight] ? `${id}-opt-${highlight}` : undefined}
          aria-label={ariaLabel}
          disabled={disabled}
          placeholder={selected ? selected.label : placeholder}
          value={open ? query : (selected?.label ?? '')}
          onChange={e => { setQuery(e.target.value); if (!open) setOpen(true) }}
          onFocus={() => { setQuery(''); setOpen(true) }}
          onBlur={e => { if (!rootRef.current?.contains(e.relatedTarget)) setOpen(false) }}
          onKeyDown={onKeyDown}
        />
        {selected && !disabled && (
          <button type="button" className="ss-clear" aria-label="Effacer la sélection" title="Effacer la sélection"
            onMouseDown={e => e.preventDefault()}
            onClick={() => { onChange(null); setQuery('') }}>×</button>
        )}
        <span className="ss-chevron">▼</span>
      </div>
      {open && !disabled && (
        <ul className="ss-list" role="listbox" id={`${id}-list`} ref={listRef}>
          {filtered.length === 0 && <li className="ss-empty">Aucun résultat pour « {query.trim()} »</li>}
          {filtered.map((o, i) => (
            <li key={o.value} id={`${id}-opt-${i}`} role="option" aria-selected={o.value === value}
              className={`ss-option${i === highlight ? ' ss-active' : ''}${o.value === value ? ' ss-selected' : ''}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => select(o)}
              onMouseEnter={() => setHighlight(i)}>
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
