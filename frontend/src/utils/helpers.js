import * as XLSX from 'xlsx'

/** Build query string from a filters object, skipping blank values. */
export function buildQuery(params) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, v)
  })
  return q.toString() ? '?' + q.toString() : ''
}

/** Simple debounce utility. */
export function debounce(fn, ms = 300) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

/** Export a JS array of objects to Excel (.xlsx). */
export function exportToExcel(data, filename = 'export.xlsx', sheetName = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

/** Parse an Excel/CSV file → array of row objects. */
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        resolve(rows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsBinaryString(file)
  })
}

/** Format a date string for display. */
export function formatDate(str) {
  if (!str) return ''
  return str.substring(0, 16).replace('T', ' ')
}

/** Capitalize first letter. */
export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}
