import React from 'react'

export default function Pagination({ page, totalPages, total, limit, onPage }) {
  if (totalPages <= 1) return null
  return (
    <div className="pagination">
      <span className="page-info">
        {(page - 1) * limit + 1}–{Math.min(page * limit, total)} / {total}
      </span>
      <button className="page-btn" disabled={page <= 1} onClick={() => onPage(1)}>«</button>
      <button className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
        const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
        return (
          <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => onPage(p)}>
            {p}
          </button>
        )
      })}
      <button className="page-btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>›</button>
      <button className="page-btn" disabled={page >= totalPages} onClick={() => onPage(totalPages)}>»</button>
    </div>
  )
}
