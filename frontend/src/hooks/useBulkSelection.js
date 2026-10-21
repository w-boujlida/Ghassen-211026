import { useState, useCallback } from 'react'

/**
 * useBulkSelection(items, getKey)
 * - items:   array of current page items
 * - getKey:  function(item) → unique string key
 * Returns: { selected (Set), isSelected, toggle, toggleAll, clear }
 */
export function useBulkSelection(items, getKey) {
  const [selected, setSelected] = useState(new Set())

  const isSelected = useCallback((item) => selected.has(getKey(item)), [selected, getKey])

  const toggle = useCallback((item) => {
    const key = getKey(item)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [getKey])

  const toggleAll = useCallback(() => {
    setSelected(prev =>
      prev.size === items.length && items.every(i => prev.has(getKey(i)))
        ? new Set()
        : new Set(items.map(getKey))
    )
  }, [items, getKey])

  const clear = useCallback(() => setSelected(new Set()), [])

  const allSelected = items.length > 0 && items.every(i => selected.has(getKey(i)))
  const someSelected = selected.size > 0 && !allSelected

  return { selected, isSelected, toggle, toggleAll, clear, allSelected, someSelected }
}
