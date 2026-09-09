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
  /** Отклонение «мышиного стика», −1 … 1. */
  mouseYaw: 0,
  mousePitch: 0,
  /** Виртуальный стик (сенсорный экран). */
  stick: { x: 0, y: 0, active: false },
  /** Кнопки тяги на сенсорном экране. */
  touchThrust: 0,
  touchBoost: false,
  /** Сырое смещение указателя за кадр — нужно для орбитального осмотра. */
  dragDeltaX: 0,
  dragDeltaY: 0,
  /** Прокрутка колеса за кадр — приближение на орбите. */
  wheelDelta: 0,
}

/** Забирает накопленные дельты указателя и обнуляет их. */
export function consumePointerDelta() {
  const dx = input.dragDeltaX
  const dy = input.dragDeltaY
  const wheel = input.wheelDelta
  input.dragDeltaX = 0
  input.dragDeltaY = 0
  input.wheelDelta = 0
  return { dx, dy, wheel }
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
  KeyR: 'pitchUp',
  KeyF: 'pitchDown',
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
    let lastX = 0
    let lastY = 0
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
      originX = lastX = e.clientX
      originY = lastY = e.clientY
      input.dragging = true
      input.dragDistance = 0
      // Никакого setPointerCapture: захват увёл бы событие click на обёртку,
      // и R3F перестал бы получать клики по планетам. Движение и отпускание
      // и так слушаются на window.
    }

    const onMove = (e) => {
      if (pointerId !== e.pointerId) return
      const dx = e.clientX - originX
      const dy = e.clientY - originY
      input.dragDeltaX += e.clientX - lastX
      input.dragDeltaY += e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
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
    }

    // Если указатель ушёл за пределы окна, штурвал нужно отпустить.
    const onLostPointer = () => {
      pointerId = null
      input.dragging = false
      mouseYaw = 0
      mousePitch = 0
      apply()
    }

    const onContext = (e) => e.preventDefault()
    const onWheel = (e) => {
      e.preventDefault()
      input.wheelDelta += e.deltaY
    }

    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    el.addEventListener('contextmenu', onContext)
    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('blur', onLostPointer)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      el.removeEventListener('contextmenu', onContext)
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('blur', onLostPointer)
    }
  }, [canvasRef, enabled])
}

/** Сводит клавиатуру, мышь и сенсорный стик в один набор осей. */
export function sampleInput() {
  const keyYaw = (down.has('left') ? 1 : 0) - (down.has('right') ? 1 : 0)
  const keyPitch = (down.has('pitchUp') ? 1 : 0) - (down.has('pitchDown') ? 1 : 0)
  const thrustKey = (down.has('up') ? 1 : 0) - (down.has('down') ? 1 : 0)

  const stickX = input.stick.active ? input.stick.x : 0
  const stickY = input.stick.active ? input.stick.y : 0

  input.yaw = clamp(keyYaw + input.mouseYaw - stickX, -1, 1)
  input.pitch = clamp(keyPitch + input.mousePitch - stickY, -1, 1)
  input.roll = (down.has('rollL') ? 1 : 0) - (down.has('rollR') ? 1 : 0)
  input.thrust = clamp(thrustKey + input.touchThrust, -1, 1)
  input.boost = down.has('boost') || input.touchBoost
  input.brake = down.has('brake')
  return input
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
