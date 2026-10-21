import React from 'react'

export default function SourceTabs({ projects, source, onChange }) {
  return (
    <div className="source-tabs">
      {projects.map(p => (
        <button
          key={p}
          className={`source-tab${source === p.toLowerCase() ? ' active' : ''}`}
          onClick={() => onChange(p.toLowerCase())}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
