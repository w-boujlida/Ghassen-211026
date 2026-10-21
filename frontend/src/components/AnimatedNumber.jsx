import { useEffect, useRef, useState } from 'react'

const DEFAULT_DURATION_MS = 600

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Affiche un nombre entier avec un effet de "count-up" (défilement progressif) quand la valeur
 * augmente par rapport au rendu précédent. Diminution ou valeur inchangée = mise à jour directe,
 * sans animation. Réutilisable partout où une quantité change en temps réel (polling/WebSocket).
 */
export default function AnimatedNumber({ value, duration = DEFAULT_DURATION_MS, className = '', style }) {
  const [display, setDisplay] = useState(value)
  const [pulsing, setPulsing] = useState(false)
  const prevValueRef = useRef(value)
  const rafRef = useRef(null)
  const pulseTimeoutRef = useRef(null)

  useEffect(() => {
    const from = prevValueRef.current
    if (value === from) return

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current)

    prevValueRef.current = value

    if (value < from || prefersReducedMotion()) {
      setDisplay(value)
      return
    }

    setPulsing(false)
    // Force le redémarrage du keyframe même si une pulsation précédente est encore visible.
    requestAnimationFrame(() => setPulsing(true))
    pulseTimeoutRef.current = setTimeout(() => setPulsing(false), duration)

    const start = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration)
      setDisplay(Math.round(from + (value - from) * easeOutCubic(t)))
      rafRef.current = t < 1 ? requestAnimationFrame(step) : null
    }
    rafRef.current = requestAnimationFrame(step)

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, duration])

  useEffect(() => () => {
    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current)
  }, [])

  const pulseStyle = pulsing ? { ...style, animationDuration: `${duration}ms` } : style

  return (
    <span className={`animated-number${pulsing ? ' value-increased' : ''}${className ? ' ' + className : ''}`} style={pulseStyle}>
      {display}
    </span>
  )
}
