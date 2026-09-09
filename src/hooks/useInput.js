import { useEffect } from 'react'

/**
 * Глобальное состояние управления. Живёт вне React, потому что читается
 * из useFrame каждый кадр.
 */
export const input = {
  thrust: 0, // -1 назад … +1 вперёд
  yaw: 0, // рыскание, -1 … 1
  pitch: 0, // тангаж, -1 … 1
  roll: 0, // крен, -1 … 1
  boost: false,
  brake: false,
  dragging: false,
  dragDistance: 0,
  /** Виртуальный стик (сенсорный экран). */
  stick: { x: 0, y: 0, active: false },
  /** Кнопки тяги на сенсорном экране. */
  touchThrust: 0,
  touchBoost: false,
}

export function resetInput() {
  input.thrust = 0
  input.yaw = 0
  input.pitch = 0
  input.roll = 0
  input.boost = false
  input.brake = false
}

const KEYS = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyQ: 'rollL',
  KeyE: 'rollR',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
  Space: 'brake',
}

const down = new Set()

/**
 * Подключает клавиатуру и «мышиный стик»: зажатая ЛКМ работает как
 * джойстик — чем дальше от точки нажатия, тем резче манёвр.
 */
export function useInput(canvasRef, { enabled = true } = {}) {
  useEffect(() => {
    const onKeyDown = (e) => {
      const action = KEYS[e.code]
      if (!action) return
      if (e.code === 'Space') e.preventDefault()
      down.add(action)
    }
    const onKeyUp = (e) => {
      const action = KEYS[e.code]
      if (action) down.delete(action)
    }
    const onBlur = () => down.clear()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      down.clear()
    }
  }, [])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return

    let originX = 0
    let originY = 0
    let pointerId = null
    let mouseYaw = 0
    let mousePitch = 0

    const apply = () => {
      input.mouseYaw = mouseYaw
      input.mousePitch = mousePitch
    }

    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0 && e.button !== 2) return
      pointerId = e.pointerId
      originX = e.clientX
      originY = e.clientY
      input.dragging = true
      input.dragDistance = 0
      el.setPointerCapture?.(e.pointerId)
    }

    const onMove = (e) => {
      if (pointerId !== e.pointerId) return
      const dx = e.clientX - originX
      const dy = e.clientY - originY
      input.dragDistance = Math.max(input.dragDistance, Math.hypot(dx, dy))
      // Мёртвая зона 12 px, затем плавное нарастание до предела в 220 px.
      const range = 220
      const dead = 12
      const norm = (v) => {
        const a = Math.abs(v)
        if (a < dead) return 0
        const t = Math.min(1, (a - dead) / (range - dead))
        return Math.sign(v) * t * t * (3 - 2 * t)
      }
      mouseYaw = -norm(dx)
      mousePitch = -norm(dy)
      apply()
    }

    const onUp = (e) => {
      if (pointerId !== e.pointerId) return
      pointerId = null
      input.dragging = false
      mouseYaw = 0
      mousePitch = 0
      apply()
      el.releasePointerCapture?.(e.pointerId)
    }

    const onContext = (e) => e.preventDefault()

    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    el.addEventListener('contextmenu', onContext)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      el.removeEventListener('contextmenu', onContext)
    }
  }, [canvasRef, enabled])
}

/** Сводит клавиатуру, мышь и сенсорный стик в один набор осей. */
export function sampleInput() {
  const keyYaw = (down.has('left') ? 1 : 0) - (down.has('right') ? 1 : 0)
  const keyPitch = 0
  const thrustKey = (down.has('up') ? 1 : 0) - (down.has('down') ? 1 : 0)

  const stickX = input.stick.active ? input.stick.x : 0
  const stickY = input.stick.active ? input.stick.y : 0

  input.yaw = clamp(keyYaw + (input.mouseYaw || 0) - stickX, -1, 1)
  input.pitch = clamp(keyPitch + (input.mousePitch || 0) - stickY, -1, 1)
  input.roll = (down.has('rollL') ? 1 : 0) - (down.has('rollR') ? 1 : 0)
  input.thrust = clamp(thrustKey + input.touchThrust, -1, 1)
  input.boost = down.has('boost') || input.touchBoost
  input.brake = down.has('brake')
  return input
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
