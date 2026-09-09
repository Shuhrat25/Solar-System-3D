import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { flight, bodyPositions, useStore, UNITS_PER_AU } from '../store'
import { getBody } from '../data/planets'
import { input, sampleInput, consumePointerDelta } from '../hooks/useInput'
import { isMobileLayout } from '../hooks/useIsMobile'

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const LOCAL_Z = new THREE.Vector3(0, 0, 1)

/** Кадронезависимое сглаживание: за время 1/rate невязка падает в e раз. */
const damp = (rate, dt) => 1 - Math.exp(-rate * dt)
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

const _lookMatrix = new THREE.Matrix4()
/**
 * Кватернион «смотреть из eye на target».
 * Object3D.lookAt здесь не подходит: он направляет на цель +Z, а у камеры и
 * корабля «вперёд» — это −Z, из-за чего ориентация переворачивалась.
 * Matrix4.lookAt строит именно камерный базис.
 */
function lookRotation(out, eye, target, up = WORLD_UP) {
  _lookMatrix.lookAt(eye, target, up)
  return out.setFromRotationMatrix(_lookMatrix)
}

/** Дистанция «зависания» у тела: чем крупнее объект, тем дальше стоим. */
export function standoffFor(body) {
  if (!body) return 12
  return body.id === 'sun' ? body.radius * 2.4 + 14 : body.radius * 3.4 + 3.2
}

/** Точки пролёта вступительной анимации. */
const INTRO_POINTS = [
  new THREE.Vector3(0, 330, 760),
  new THREE.Vector3(190, 210, 560),
  new THREE.Vector3(150, 92, 360),
  new THREE.Vector3(80, 54, 208),
  new THREE.Vector3(46, 30, 140),
  new THREE.Vector3(30, 18, 96),
]
const INTRO_DURATION = 9

export default function CameraRig() {
  const { camera } = useThree()

  const phase = useStore((s) => s.phase)
  const mode = useStore((s) => s.mode)
  const target = useStore((s) => s.target)

  const state = useRef({
    introT: 0,
    travelT: 0,
    travelDuration: 3,
    travelStart: new THREE.Vector3(),
    travelDir: new THREE.Vector3(1, 0, 0),
    travelArc: new THREE.Vector3(0, 1, 0),
    travelDistance: 0,
    orbitTheta: 0,
    orbitPhi: Math.PI / 2.6,
    orbitRadius: 20,
    orbitShipAngle: 0,
    smoothThrottle: 0,
    fov: 58,
  }).current

  const curve = useMemo(() => new THREE.CatmullRomCurve3(INTRO_POINTS, false, 'catmullrom', 0.4), [])

  const tmp = useMemo(
    () => ({
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Vector3(),
      d: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      up: new THREE.Vector3(),
      right: new THREE.Vector3(),
      desired: new THREE.Vector3(),
      q1: new THREE.Quaternion(),
      q2: new THREE.Quaternion(),
      euler: new THREE.Euler(0, 0, 0, 'YXZ'),
    }),
    []
  )

  /* Escape возвращает к свободному полёту. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Escape') useStore.getState().release()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* Подготовка перелёта при смене цели. */
  useEffect(() => {
    if (mode !== 'travel' || !target) return
    const planetPos = bodyPositions.get(target) ?? new THREE.Vector3()
    state.travelStart.copy(flight.position)
    state.travelDir.copy(flight.position).sub(planetPos)
    if (state.travelDir.lengthSq() < 1e-4) state.travelDir.set(1, 0, 0)
    state.travelDistance = state.travelDir.length()
    state.travelDir.normalize()
    // Дуга поднимается перпендикулярно направлению подлёта — путь читается как манёвр.
    state.travelArc.crossVectors(state.travelDir, WORLD_UP)
    if (state.travelArc.lengthSq() < 1e-4) state.travelArc.set(1, 0, 0)
    state.travelArc.crossVectors(state.travelArc, state.travelDir).normalize()
    state.travelT = 0
    state.travelDuration = THREE.MathUtils.clamp(
      Math.sqrt(state.travelDistance) * 0.42,
      2.0,
      7.5
    )
    state.orbitShipAngle = 0
  }, [mode, target, state])

  /* Инициализация орбитального осмотра от текущего положения камеры. */
  useEffect(() => {
    if (mode !== 'orbit' || !target) return
    const body = getBody(target)
    const planetPos = bodyPositions.get(target) ?? new THREE.Vector3()
    const offset = new THREE.Vector3().copy(camera.position).sub(planetPos)
    const standoff = standoffFor(body)
    // Радиус берём от текущего положения камеры, но держим в разумных рамках:
    // если камера отстала на подлёте, планета иначе осталась бы точкой.
    const r = THREE.MathUtils.clamp(offset.length(), standoff * 1.05, standoff * 2.2)
    state.orbitRadius = r
    const len = offset.length() || 1
    state.orbitTheta = Math.atan2(offset.z, offset.x)
    state.orbitPhi = THREE.MathUtils.clamp(Math.acos(offset.y / len), 0.25, Math.PI - 0.25)
  }, [mode, target, camera, state])

  useFrame((rootState, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const store = useStore.getState()
    if (import.meta.env?.DEV && window.__space) window.__space.camera = camera

    if (phase === 'cinematic') {
      runCinematic(dt)
    } else if (store.mode === 'travel') {
      runTravel(dt, store)
    } else if (store.mode === 'orbit') {
      runOrbit(dt, store)
    } else {
      runFree(dt)
    }

    updateTelemetry(store)
  }, -2)

  /* ---------------------------------------------------------------- */

  function runCinematic(dt) {
    state.introT = Math.min(1, state.introT + dt / INTRO_DURATION)
    const t = easeInOut(state.introT)
    curve.getPointAt(t, tmp.a)
    camera.position.copy(tmp.a)

    // Взгляд плавно переходит с Солнца на курс полёта.
    // Взгляд держится на Солнце и к финалу уходит на курс мимо него.
    tmp.b.set(0, 0, 0).lerp(tmp.c.set(-20, 2, 12), easeInOut(Math.max(0, (state.introT - 0.4) / 0.6)))
    lookRotation(tmp.q1, camera.position, tmp.b)
    // К концу пролёта доводка ускоряется, чтобы передать управление ровно по курсу.
    camera.quaternion.slerp(tmp.q1, damp(5 + state.introT * 26, dt))

    placeShipInFrontOfCamera()
    flight.throttle = 0.55
    flight.boost = state.introT < 0.55

    if (state.introT >= 1) finishIntro()
  }

  /** Корабль держится там, где его ожидает камера преследования. */
  function placeShipInFrontOfCamera() {
    tmp.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion)
    tmp.up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    flight.position.copy(camera.position).addScaledVector(tmp.fwd, 3.1).addScaledVector(tmp.up, -0.72)
    flight.quaternion.copy(camera.quaternion)
  }

  function finishIntro() {
    tmp.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion)
    flight.velocity.copy(tmp.fwd).multiplyScalar(10)
    useStore.getState().setPhase('flight')
  }

  /* ---------------------------------------------------------------- */

  function runFree(dt) {
    const inp = sampleInput()

    // Угловые скорости сглаживаются, поэтому корабль не дёргается.
    const rate = 1.5
    state.yawRate = THREE.MathUtils.lerp(state.yawRate ?? 0, inp.yaw * rate, damp(7, dt))
    state.pitchRate = THREE.MathUtils.lerp(state.pitchRate ?? 0, inp.pitch * rate, damp(7, dt))
    state.rollRate = THREE.MathUtils.lerp(state.rollRate ?? 0, inp.roll * rate * 1.4, damp(7, dt))

    tmp.euler.set(state.pitchRate * dt, state.yawRate * dt, state.rollRate * dt, 'YXZ')
    tmp.q1.setFromEuler(tmp.euler)
    flight.quaternion.multiply(tmp.q1).normalize()

    // Автогоризонт: если игрок не кренит вручную, корабль сам выравнивается.
    if (Math.abs(inp.roll) < 0.02) autoLevel(dt, 1.4)

    tmp.fwd.set(0, 0, -1).applyQuaternion(flight.quaternion)

    const boost = inp.boost
    const accel = (boost ? 96 : 30) * Math.max(0, inp.thrust) + (inp.thrust < 0 ? inp.thrust * 22 : 0)
    if (Math.abs(inp.thrust) > 0.01) flight.velocity.addScaledVector(tmp.fwd, accel * dt)
    if (inp.brake) flight.velocity.multiplyScalar(Math.exp(-3.4 * dt))
    flight.velocity.multiplyScalar(Math.exp(-0.32 * dt))

    const maxSpeed = boost ? 160 : 52
    const sp = flight.velocity.length()
    if (sp > maxSpeed) flight.velocity.multiplyScalar(maxSpeed / sp)

    flight.position.addScaledVector(flight.velocity, dt)
    avoidCollisions()
    flight.boost = boost && inp.thrust > 0

    const wanted = Math.max(0, inp.thrust) * (boost ? 1 : 0.72)
    state.smoothThrottle = THREE.MathUtils.lerp(state.smoothThrottle, wanted, damp(9, dt))
    flight.throttle = state.smoothThrottle

    followShip(dt, boost)
  }

  /**
   * Мягкое отталкивание от тел: сквозь планету и Солнце пролететь нельзя,
   * корабль скользит вдоль невидимой сферы безопасности.
   */
  function avoidCollisions() {
    for (const [id, p] of bodyPositions) {
      const body = getBody(id)
      if (!body) continue
      const safe = body.radius * (id === 'sun' ? 1.6 : 1.35) + 0.5
      tmp.a.copy(flight.position).sub(p)
      const d = tmp.a.length()
      if (d > safe || d < 1e-4) continue
      tmp.a.divideScalar(d)
      flight.position.copy(p).addScaledVector(tmp.a, safe)
      // Гасим только ту часть скорости, что направлена внутрь тела.
      const inward = flight.velocity.dot(tmp.a)
      if (inward < 0) flight.velocity.addScaledVector(tmp.a, -inward * 1.15)
    }
  }

  /** Плавно докручивает крен, чтобы «верх» корабля смотрел в мировой зенит. */
  function autoLevel(dt, strength) {
    tmp.fwd.set(0, 0, -1).applyQuaternion(flight.quaternion)
    tmp.up.set(0, 1, 0).applyQuaternion(flight.quaternion)
    tmp.right.set(1, 0, 0).applyQuaternion(flight.quaternion)

    tmp.a.crossVectors(tmp.fwd, WORLD_UP)
    if (tmp.a.lengthSq() < 1e-5) return // смотрим точно вверх или вниз — крен не определён
    tmp.a.normalize()
    tmp.b.crossVectors(tmp.a, tmp.fwd).normalize() // желаемый «верх»

    const angle = Math.atan2(tmp.b.dot(tmp.right), tmp.b.dot(tmp.up))
    tmp.q1.setFromAxisAngle(LOCAL_Z, -angle * Math.min(1, dt * strength))
    flight.quaternion.multiply(tmp.q1).normalize()
  }

  /** Камера преследования: позиция и ориентация догоняют корабль с запаздыванием. */
  function followShip(dt, boost) {
    tmp.desired.set(0, 1.12, 3.15).applyQuaternion(flight.quaternion).add(flight.position)
    camera.position.lerp(tmp.desired, damp(boost ? 7 : 5.5, dt))

    // Поворот вокруг локальной оси X положителен «вверх», поэтому чтобы
    // смотреть на корабль сверху вниз, угол берётся со знаком минус.
    tmp.euler.set(-0.16, 0, 0, 'YXZ')
    tmp.q2.setFromEuler(tmp.euler)
    tmp.q1.copy(flight.quaternion).multiply(tmp.q2)
    camera.quaternion.slerp(tmp.q1, damp(6, dt))

    // На скорости поле зрения расширяется — классический эффект разгона.
    const speedRatio = Math.min(1, flight.velocity.length() / 150)
    const wantFov = 58 + speedRatio * 16
    state.fov = THREE.MathUtils.lerp(state.fov, wantFov, damp(3, dt))
    if (Math.abs(camera.fov - state.fov) > 0.01) {
      camera.fov = state.fov
      camera.updateProjectionMatrix()
    }
  }

  /* ---------------------------------------------------------------- */

  function runTravel(dt, store) {
    const body = getBody(store.target)
    const planetPos = bodyPositions.get(store.target)
    if (!body || !planetPos) {
      store.release()
      return
    }

    state.travelT = Math.min(1, state.travelT + dt / state.travelDuration)
    const t = easeInOut(state.travelT)

    // Точка прибытия считается каждый кадр: планета продолжает двигаться.
    const standoff = standoffFor(body)
    tmp.a.copy(planetPos).addScaledVector(state.travelDir, standoff).addScaledVector(WORLD_UP, standoff * 0.22)

    tmp.b.copy(state.travelStart).lerp(tmp.a, t)
    const arc = Math.sin(Math.PI * t) * Math.min(state.travelDistance * 0.1, 26)
    tmp.b.addScaledVector(state.travelArc, arc)

    // Направление движения берём из разницы позиций — корабль смотрит по курсу.
    tmp.c.copy(tmp.b).sub(flight.position)
    const moved = tmp.c.length()
    if (moved > 1e-4) {
      flight.velocity.copy(tmp.c).divideScalar(Math.max(dt, 1e-4))
      tmp.d.copy(tmp.b).add(tmp.c)
      lookRotation(tmp.q1, tmp.b, tmp.d)
      flight.quaternion.slerp(tmp.q1, damp(4.5, dt))
    }
    flight.position.copy(tmp.b)

    flight.throttle = state.travelT < 0.72 ? 1 : Math.max(0.12, 1 - (state.travelT - 0.72) / 0.28)
    flight.boost = state.travelT < 0.6
    flight.travelProgress = state.travelT

    followShip(dt, true)

    if (state.travelT >= 1) {
      // Запоминаем, под каким углом встали, чтобы дальше красиво кружить.
      tmp.d.copy(flight.position).sub(planetPos)
      state.orbitShipAngle = Math.atan2(tmp.d.z, tmp.d.x)
      useStore.getState().arrive()
    }
  }

  /* ---------------------------------------------------------------- */

  function runOrbit(dt, store) {
    const body = getBody(store.target)
    const planetPos = bodyPositions.get(store.target)
    if (!body || !planetPos) {
      store.release()
      return
    }

    const { dx, dy, wheel } = consumePointerDelta()
    if (input.dragging) {
      state.orbitTheta -= dx * 0.005
      state.orbitPhi = THREE.MathUtils.clamp(state.orbitPhi - dy * 0.005, 0.18, Math.PI - 0.18)
    } else {
      state.orbitTheta += dt * 0.045 // лёгкий облёт, когда пользователь ничего не трогает
    }
    if (wheel !== 0) {
      const min = standoffFor(body) * 0.55
      const max = standoffFor(body) * 4.5
      state.orbitRadius = THREE.MathUtils.clamp(
        state.orbitRadius * (1 + wheel * 0.0012),
        min,
        max
      )
    }

    const sinPhi = Math.sin(state.orbitPhi)
    tmp.desired.set(
      planetPos.x + state.orbitRadius * sinPhi * Math.cos(state.orbitTheta),
      planetPos.y + state.orbitRadius * Math.cos(state.orbitPhi),
      planetPos.z + state.orbitRadius * sinPhi * Math.sin(state.orbitTheta)
    )
    camera.position.lerp(tmp.desired, damp(5, dt))

    // На телефоне карточка занимает низ экрана, поэтому смотрим чуть ниже
    // планеты — она поднимается в верхнюю треть кадра и остаётся видна.
    const hidden = store.selected && isMobileLayout()
    tmp.b.copy(planetPos)
    if (hidden) tmp.b.y -= state.orbitRadius * 0.26
    lookRotation(tmp.q1, camera.position, tmp.b)
    camera.quaternion.slerp(tmp.q1, damp(6, dt))

    if (Math.abs(camera.fov - 58) > 0.05) {
      state.fov = THREE.MathUtils.lerp(state.fov, 58, damp(3, dt))
      camera.fov = state.fov
      camera.updateProjectionMatrix()
    }

    // Корабль неспешно кружит вокруг планеты, оставаясь в кадре.
    const shipR = standoffFor(body) * 0.82
    state.orbitShipAngle += dt * 0.16
    tmp.a.set(
      planetPos.x + Math.cos(state.orbitShipAngle) * shipR,
      planetPos.y + Math.sin(state.orbitShipAngle * 0.7) * shipR * 0.14,
      planetPos.z + Math.sin(state.orbitShipAngle) * shipR
    )
    tmp.c.copy(tmp.a).sub(flight.position)
    flight.velocity.copy(tmp.c).divideScalar(Math.max(dt, 1e-4))
    flight.position.copy(tmp.a)

    // Нос по касательной к облёту.
    tmp.b.set(-Math.sin(state.orbitShipAngle), 0, Math.cos(state.orbitShipAngle))
    tmp.d.copy(flight.position).add(tmp.b)
    lookRotation(tmp.q1, flight.position, tmp.d)
    flight.quaternion.slerp(tmp.q1, damp(3, dt))

    flight.throttle = THREE.MathUtils.lerp(flight.throttle, 0.16, damp(3, dt))
    flight.boost = false
  }

  /* ---------------------------------------------------------------- */

  function updateTelemetry(store) {
    flight.speed = flight.velocity.length()
    flight.distanceToSun = flight.position.length() / UNITS_PER_AU
    const targetId = store.target ?? store.selected
    const p = targetId ? bodyPositions.get(targetId) : null
    if (p) {
      const body = getBody(targetId)
      flight.distanceToTarget = Math.max(
        0,
        flight.position.distanceTo(p) - (body?.radius ?? 0)
      )
    } else {
      flight.distanceToTarget = 0
    }
  }

  return null
}
