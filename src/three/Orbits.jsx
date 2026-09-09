import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PLANETS } from '../data/planets'
import { useStore } from '../store'
import { quality } from '../quality'

/** Кольцевая линия орбиты, подсвечивается при наведении и выборе цели. */
function OrbitLine({ body }) {
  const lineRef = useRef()

  const geometry = useMemo(() => {
    const points = []
    const segments = 256
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2
      points.push(new THREE.Vector3(Math.cos(a) * body.orbitRadius, 0, Math.sin(a) * body.orbitRadius))
    }
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [body.orbitRadius])

  useFrame((_, delta) => {
    if (!lineRef.current) return
    const { hovered, target, selected } = useStore.getState()
    const active = hovered === body.id || target === body.id || selected === body.id
    const want = active ? 0.7 : 0.16
    const m = lineRef.current.material
    m.opacity += (want - m.opacity) * Math.min(1, delta * 6)
  })

  return (
    <group rotation={[body.orbitTilt ?? 0, 0, 0]}>
      <line ref={lineRef} geometry={geometry}>
        <lineBasicMaterial color={body.color} transparent opacity={0.16} depthWrite={false} />
      </line>
    </group>
  )
}

function mulberry(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Пояс астероидов на инстансах: один вызов отрисовки на тысячи камней.
 * Матрицы считаются один раз, вращается только родительская группа.
 */
function Belt({ count, inner, outer, thickness, minScale, maxScale, seed, color }) {
  const meshRef = useRef()
  const group = useRef()

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const rnd = mulberry(seed)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const base = new THREE.Color(color)
    const tint = new THREE.Color()

    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2
      // Плотность выше в середине пояса.
      const t = (rnd() + rnd()) / 2
      const r = inner + (outer - inner) * t
      pos.set(Math.cos(a) * r, (rnd() - 0.5) * thickness, Math.sin(a) * r)
      e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI)
      q.setFromEuler(e)
      const s = minScale + rnd() * (maxScale - minScale)
      scl.set(s, s * (0.6 + rnd() * 0.7), s * (0.7 + rnd() * 0.6))
      m.compose(pos, q, scl)
      mesh.setMatrixAt(i, m)
      tint.copy(base).multiplyScalar(0.55 + rnd() * 0.6)
      mesh.setColorAt(i, tint)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [count, inner, outer, thickness, minScale, maxScale, seed, color])

  useFrame((state) => {
    if (group.current) group.current.rotation.y = -state.clock.elapsedTime * 0.012
  })

  return (
    <group ref={group}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={1} metalness={0} />
      </instancedMesh>
    </group>
  )
}

export default function Orbits() {
  const showOrbits = useStore((s) => s.showOrbits)

  return (
    <>
      {showOrbits && PLANETS.map((body) => <OrbitLine key={body.id} body={body} />)}

      {/* Главный пояс астероидов между Марсом и Юпитером */}
      <Belt
        count={quality.beltMain}
        inner={76}
        outer={92}
        thickness={3.2}
        minScale={0.06}
        maxScale={0.34}
        seed={1010}
        color="#8b7d6b"
      />
      {/* Разрежённый пояс Койпера за Плутоном */}
      <Belt
        count={quality.beltKuiper}
        inner={262}
        outer={310}
        thickness={9}
        minScale={0.08}
        maxScale={0.3}
        seed={2020}
        color="#6f7f96"
      />
    </>
  )
}
