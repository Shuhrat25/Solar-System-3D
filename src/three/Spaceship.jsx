import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { flight, useStore } from '../store'
import { getTexture } from './textures'
import { quality } from '../quality'

/* Носовая часть смотрит в −Z, как и «вперёд» у камеры. */

const HULL = '#dfe7f2'
const HULL_DARK = '#8d9bb0'
const ACCENT = '#ff7a2f'
const GLASS = '#7fd8ff'

function Rocket({ glowRef, flameRef }) {
  const fins = useMemo(() => [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3], [])

  return (
    <group>
      {/* Корпус */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.36, 1.5, 24]} />
        <meshStandardMaterial color={HULL} metalness={0.45} roughness={0.42} />
      </mesh>

      {/* Обтекатель */}
      <mesh position={[0, 0, -1.1]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.3, 0.72, 24]} />
        <meshStandardMaterial color={HULL} metalness={0.45} roughness={0.38} />
      </mesh>

      {/* Оранжевые полосы */}
      <mesh position={[0, 0, -0.62]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.305, 0.305, 0.12, 24]} />
        <meshStandardMaterial color={ACCENT} metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.345, 0.345, 0.1, 24]} />
        <meshStandardMaterial color={ACCENT} metalness={0.4} roughness={0.4} />
      </mesh>

      {/* Кабина */}
      <mesh position={[0, 0.14, -0.42]} scale={[0.9, 0.7, 1.1]}>
        <sphereGeometry args={[0.23, 24, 16]} />
        <meshStandardMaterial
          color="#2f7fb8"
          metalness={0.6}
          roughness={0.18}
          emissive={GLASS}
          emissiveIntensity={0.12}
        />
      </mesh>

      {/* Стабилизаторы */}
      {fins.map((a, i) => (
        <group key={i} rotation={[0, 0, a]}>
          <mesh position={[0, -0.52, 0.5]} rotation={[0.3, 0, 0]} castShadow>
            <boxGeometry args={[0.055, 0.58, 0.78]} />
            <meshStandardMaterial color={HULL_DARK} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, -0.34, 0.1]}>
            <boxGeometry args={[0.05, 0.2, 0.62]} />
            <meshStandardMaterial color={ACCENT} metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* Сопло */}
      <mesh position={[0, 0, 0.9]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.32, 0.22, 0.3, 24, 1, true]} />
        <meshStandardMaterial color="#3c4453" metalness={0.9} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>

      {/* Факел двигателя */}
      <mesh ref={flameRef} position={[0, 0, 1.35]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.2, 1.5, 20, 1, true]} />
        <meshBasicMaterial
          color="#9fd8ff"
          transparent
          opacity={0.55}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <sprite ref={glowRef} position={[0, 0, 1.02]} scale={0.4}>
        <spriteMaterial
          map={getTexture('flame')}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      <pointLight position={[0, 0, 1.9]} color="#88c8ff" intensity={0.18} distance={3} decay={2} />
    </group>
  )
}

function Astronaut({ glowRef, flameRef }) {
  return (
    <group scale={0.85}>
      {/* Шлем и забрало */}
      <mesh position={[0, 0.62, -0.05]}>
        <sphereGeometry args={[0.33, 28, 20]} />
        <meshStandardMaterial color="#f2f5f8" metalness={0.25} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.62, -0.19]} scale={[1, 0.82, 0.6]}>
        <sphereGeometry args={[0.28, 24, 16]} />
        <meshStandardMaterial
          color="#16324f"
          metalness={1}
          roughness={0.06}
          emissive={GLASS}
          emissiveIntensity={0.28}
        />
      </mesh>

      {/* Торс */}
      <mesh position={[0, 0.08, 0]}>
        <capsuleGeometry args={[0.26, 0.4, 8, 20]} />
        <meshStandardMaterial color="#f4f6f8" metalness={0.1} roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.16, -0.24]}>
        <boxGeometry args={[0.3, 0.2, 0.06]} />
        <meshStandardMaterial color={ACCENT} roughness={0.5} />
      </mesh>

      {/* Ранец */}
      <mesh position={[0, 0.16, 0.28]}>
        <boxGeometry args={[0.44, 0.52, 0.24]} />
        <meshStandardMaterial color="#c9d2dd" metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Руки */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.34, 0.14, -0.06]} rotation={[0.5, 0, s * 0.5]}>
          <capsuleGeometry args={[0.1, 0.34, 6, 12]} />
          <meshStandardMaterial color="#eef1f5" roughness={0.7} />
        </mesh>
      ))}
      {/* Ноги */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.14, -0.4, 0.02]} rotation={[0.28, 0, s * 0.12]}>
          <capsuleGeometry args={[0.11, 0.4, 6, 12]} />
          <meshStandardMaterial color="#eef1f5" roughness={0.7} />
        </mesh>
      ))}

      {/* Струи ранцевого двигателя */}
      <mesh ref={flameRef} position={[0, 0.16, 0.85]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.16, 1.0, 16, 1, true]} />
        <meshBasicMaterial
          color="#bfe6ff"
          transparent
          opacity={0.75}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <sprite ref={glowRef} position={[0, 0.16, 0.46]} scale={0.34}>
        <spriteMaterial
          map={getTexture('flame')}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      <pointLight position={[0, 0.2, 1.1]} color="#9fd0ff" intensity={0.4} distance={4} decay={2} />
    </group>
  )
}

/**
 * Выхлоп: частицы живут в мировых координатах, поэтому шлейф остаётся
 * позади корабля даже на резких манёврах.
 */
function Exhaust({ count = quality.exhaust }) {
  const pointsRef = useRef()
  const cursor = useRef(0)
  const state = useMemo(() => {
    return {
      positions: new Float32Array(count * 3),
      velocities: new Float32Array(count * 3),
      ages: new Float32Array(count).fill(999),
      lifetimes: new Float32Array(count).fill(1),
      sizes: new Float32Array(count),
      alphas: new Float32Array(count),
    }
  }, [count])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(state.positions, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(state.sizes, 1))
    geo.setAttribute('alpha', new THREE.BufferAttribute(state.alphas, 1))
    return geo
  }, [state])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: getTexture('flame') } },
        vertexShader: /* glsl */ `
          attribute float size;
          attribute float alpha;
          varying float vAlpha;
          void main() {
            vAlpha = alpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = size * (260.0 / max(0.001, -mv.z));
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          varying float vAlpha;
          void main() {
            vec4 tex = texture2D(uMap, gl_PointCoord);
            gl_FragColor = vec4(tex.rgb, tex.a * vAlpha);
            if (gl_FragColor.a < 0.01) discard;
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  )

  const forward = useMemo(() => new THREE.Vector3(), [])
  const emitPoint = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const { positions, velocities, ages, lifetimes, sizes, alphas } = state

    // Сколько частиц выпустить в этом кадре — зависит от тяги.
    const power = Math.max(0, flight.throttle) * (flight.boost ? 1.8 : 1)
    const emit = Math.floor(power * 5 + (power > 0.02 ? 1 : 0))

    forward.set(0, 0, -1).applyQuaternion(flight.quaternion)
    emitPoint.copy(flight.position).addScaledVector(forward, -0.28)

    for (let e = 0; e < emit; e++) {
      const i = cursor.current
      cursor.current = (cursor.current + 1) % count
      const i3 = i * 3
      positions[i3] = emitPoint.x + (Math.random() - 0.5) * 0.05
      positions[i3 + 1] = emitPoint.y + (Math.random() - 0.5) * 0.05
      positions[i3 + 2] = emitPoint.z + (Math.random() - 0.5) * 0.05
      const spread = 0.5
      velocities[i3] = -forward.x * 5 * power + (Math.random() - 0.5) * spread
      velocities[i3 + 1] = -forward.y * 5 * power + (Math.random() - 0.5) * spread
      velocities[i3 + 2] = -forward.z * 5 * power + (Math.random() - 0.5) * spread
      ages[i] = 0
      lifetimes[i] = 0.5 + Math.random() * 0.5
    }

    for (let i = 0; i < count; i++) {
      if (ages[i] > lifetimes[i]) {
        alphas[i] = 0
        continue
      }
      ages[i] += dt
      const i3 = i * 3
      positions[i3] += velocities[i3] * dt
      positions[i3 + 1] += velocities[i3 + 1] * dt
      positions[i3 + 2] += velocities[i3 + 2] * dt
      const t = ages[i] / lifetimes[i]
      alphas[i] = Math.max(0, (1 - t) * 0.8)
      sizes[i] = 0.1 + t * 0.42
    }

    geometry.attributes.position.needsUpdate = true
    geometry.attributes.size.needsUpdate = true
    geometry.attributes.alpha.needsUpdate = true
  })

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
}

export default function Spaceship() {
  const root = useRef()
  const bob = useRef()
  const glowRef = useRef()
  const flameRef = useRef()
  const vehicle = useStore((s) => s.vehicle)

  useFrame((clockState, delta) => {
    if (!root.current) return
    root.current.position.copy(flight.position)
    root.current.quaternion.copy(flight.quaternion)

    // Лёгкое «дыхание» корпуса, чтобы корабль не выглядел приклеенным.
    if (bob.current) {
      const t = clockState.clock.elapsedTime
      bob.current.position.y = Math.sin(t * 1.4) * 0.02
      bob.current.rotation.z = Math.sin(t * 0.9) * 0.03
    }

    const power = Math.max(0, flight.throttle) * (flight.boost ? 1.6 : 1)
    const flicker = 0.85 + Math.random() * 0.3
    if (flameRef.current) {
      const s = power * flicker
      flameRef.current.scale.set(0.6 + s * 0.5, Math.max(0.001, s * 1.25), 0.6 + s * 0.5)
      flameRef.current.visible = power > 0.02
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar((0.16 + power * 0.42) * flicker)
      glowRef.current.material.opacity = Math.min(0.34, 0.04 + power * 0.24)
    }
  }, -1)

  return (
    <>
      <group ref={root}>
        <group ref={bob} scale={0.26}>
          {vehicle === 'rocket' ? (
            <Rocket glowRef={glowRef} flameRef={flameRef} />
          ) : (
            <Astronaut glowRef={glowRef} flameRef={flameRef} />
          )}
        </group>
      </group>
      <Exhaust />
    </>
  )
}
