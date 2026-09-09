import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store'
import { input } from '../hooks/useInput'

/* ------------------------------------------------------------------ */
/* Экран загрузки                                                      */
/* ------------------------------------------------------------------ */

export function LoadingScreen() {
  const progress = useStore((s) => s.progress)
  const label = useStore((s) => s.progressLabel)
  const pct = Math.round(progress * 100)

  return (
    <motion.div className="loader" exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
      <div className="loader__orbit">
        <span className="loader__sun" />
        <span className="loader__ring loader__ring--1">
          <i />
        </span>
        <span className="loader__ring loader__ring--2">
          <i />
        </span>
        <span className="loader__ring loader__ring--3">
          <i />
        </span>
      </div>
      <h1 className="loader__title">Космический исследователь</h1>
      <p className="loader__sub">Строим планеты · {label || 'подготовка'}</p>
      <div className="loader__bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <span className="loader__pct">{pct}%</span>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Заставка поверх вступительного пролёта                              */
/* ------------------------------------------------------------------ */

export function IntroOverlay() {
  const phase = useStore((s) => s.phase)
  const setPhase = useStore((s) => s.setPhase)

  return (
    <AnimatePresence>
      {phase === 'cinematic' && (
        <motion.div
          className="intro"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, filter: 'blur(6px)' }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            className="intro__inner"
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 1 }}
          >
            <p className="intro__eyebrow">Миссия «Солнечная система»</p>
            <h1 className="intro__title">
              <span>Космический</span>
              <b>исследователь</b>
            </h1>
            <p className="intro__text">
              Вы за штурвалом. Девять миров, кольца Сатурна, пояс астероидов и Койпера —
              летите куда захотите и слушайте истории планет.
            </p>
          </motion.div>

          <motion.button
            className="intro__skip"
            onClick={() => setPhase('flight')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6 }}
          >
            Взять управление →
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/* Сенсорное управление                                                */
/* ------------------------------------------------------------------ */

export function TouchControls() {
  const [isTouch, setIsTouch] = useState(false)
  const padRef = useRef(null)
  const knobRef = useRef(null)

  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  useEffect(() => {
    if (!isTouch) return
    const pad = padRef.current
    const knob = knobRef.current
    if (!pad || !knob) return

    let id = null
    const radius = 52

    const move = (e) => {
      if (id !== e.pointerId) return
      const rect = pad.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      let dx = e.clientX - cx
      let dy = e.clientY - cy
      const len = Math.hypot(dx, dy)
      if (len > radius) {
        dx = (dx / len) * radius
        dy = (dy / len) * radius
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`
      input.stick.x = -dx / radius
      input.stick.y = -dy / radius
      input.stick.active = true
    }
    const down = (e) => {
      id = e.pointerId
      pad.setPointerCapture(e.pointerId)
      move(e)
    }
    const up = (e) => {
      if (id !== e.pointerId) return
      id = null
      knob.style.transform = 'translate(0px, 0px)'
      input.stick.x = 0
      input.stick.y = 0
      input.stick.active = false
    }

    pad.addEventListener('pointerdown', down)
    pad.addEventListener('pointermove', move)
    pad.addEventListener('pointerup', up)
    pad.addEventListener('pointercancel', up)
    return () => {
      pad.removeEventListener('pointerdown', down)
      pad.removeEventListener('pointermove', move)
      pad.removeEventListener('pointerup', up)
      pad.removeEventListener('pointercancel', up)
    }
  }, [isTouch])

  if (!isTouch) return null

  const hold = (setter) => ({
    onPointerDown: (e) => {
      e.preventDefault()
      setter(true)
    },
    onPointerUp: () => setter(false),
    onPointerLeave: () => setter(false),
    onPointerCancel: () => setter(false),
  })

  return (
    <div className="touch">
      <div className="touch__pad" ref={padRef}>
        <span className="touch__knob" ref={knobRef} />
      </div>
      <div className="touch__buttons">
        <button
          className="touch__btn touch__btn--boost"
          {...hold((v) => {
            input.touchBoost = v
            input.touchThrust = v ? 1 : 0
          })}
        >
          ФОРСАЖ
        </button>
        <button
          className="touch__btn"
          {...hold((v) => {
            input.touchThrust = v ? 1 : 0
          })}
        >
          ТЯГА
        </button>
      </div>
    </div>
  )
}
