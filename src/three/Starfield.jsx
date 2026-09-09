import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getTexture } from './textures'
import { flight } from '../store'

/** Спектральные классы звёзд — от голубых гигантов до красных карликов. */
const STAR_COLORS = [
  [0.62, 0.72, 1.0],
  [0.78, 0.85, 1.0],
  [1.0, 1.0, 1.0],
  [1.0, 0.96, 0.86],
  [1.0, 0.86, 0.66],
  [1.0, 0.72, 0.52],
]

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

/** Дальние звёзды: сфера-оболочка плюс уплотнение вдоль «Млечного Пути». */
function Stars({ count = 9000 }) {
  const group = useRef()

  const geometry = useMemo(() => {
    const rnd = mulberry(20240517)
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      // Треть звёзд собирается в полосу — получается силуэт галактики.
      const inBand = i % 3 === 0
      const u = rnd() * 2 - 1
      const theta = rnd() * Math.PI * 2
      let y = u
      if (inBand) y = (rnd() + rnd() + rnd() - 1.5) * 0.16
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      const radius = 1400 + rnd() * 1500
      positions[i * 3] = Math.cos(theta) * r * radius
      positions[i * 3 + 1] = y * radius
      positions[i * 3 + 2] = Math.sin(theta) * r * radius

      const c = STAR_COLORS[(rnd() * STAR_COLORS.length) | 0]
      const b = 0.45 + rnd() * 0.55
      colors[i * 3] = c[0] * b
      colors[i * 3 + 1] = c[1] * b
      colors[i * 3 + 2] = c[2] * b

      const t = rnd()
      sizes[i] = 6 + t * t * t * 34
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    return geo
  }, [count])

  // Кастомный материал: размер задаётся атрибутом, мерцание — временем.
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: getTexture('star') },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        varying vec3 vColor;
        varying float vTwinkle;
        uniform float uTime;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * (300.0 / -mv.z);
          vTwinkle = 0.78 + 0.22 * sin(uTime * 1.6 + position.x * 0.05 + position.y * 0.03);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor * vTwinkle, 1.0) * tex;
          if (gl_FragColor.a < 0.01) discard;
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    })
  }, [])

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    if (group.current) group.current.rotation.y = state.clock.elapsedTime * 0.0012
  })

  return (
    <group ref={group}>
      <points geometry={geometry} material={material} frustumCulled={false} />
    </group>
  )
}

/** Далёкие туманности — крупные аддитивные пятна, дают глубину и цвет. */
function Nebulae() {
  const group = useRef()
  const clouds = useMemo(() => {
    const rnd = mulberry(777)
    return Array.from({ length: 7 }, (_, i) => {
      const theta = rnd() * Math.PI * 2
      const y = (rnd() - 0.5) * 900
      const radius = 1500 + rnd() * 900
      return {
        key: i,
        texture: getTexture(`nebula${i % 3}`),
        position: [Math.cos(theta) * radius, y, Math.sin(theta) * radius],
        scale: 900 + rnd() * 1500,
        opacity: 0.2 + rnd() * 0.28,
        rotation: rnd() * Math.PI,
      }
    })
  }, [])

  useFrame((state) => {
    if (group.current) group.current.rotation.y = state.clock.elapsedTime * 0.0009
  })

  return (
    <group ref={group}>
      {clouds.map((c) => (
        <sprite key={c.key} position={c.position} scale={c.scale} renderOrder={-1}>
          <spriteMaterial
            map={c.texture}
            transparent
            opacity={c.opacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            rotation={c.rotation}
          />
        </sprite>
      ))}
    </group>
  )
}

/**
 * Близкая пыль вокруг камеры. Частицы «заворачиваются» в кубе вокруг
 * наблюдателя — благодаря параллаксу появляется ощущение скорости.
 */
function SpaceDust({ count = 500, range = 45 }) {
  const ref = useRef()

  const geometry = useMemo(() => {
    const rnd = mulberry(4242)
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count * 3; i++) positions[i] = (rnd() * 2 - 1) * range
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [count, range])

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.5,
        map: getTexture('star'),
        color: new THREE.Color('#cfe2ff'),
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    []
  )

  useFrame((state) => {
    const cam = state.camera.position
    const arr = geometry.attributes.position.array
    const span = range * 2
    for (let i = 0; i < arr.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const d = arr[i + a] - cam.getComponent(a)
        if (d > range) arr[i + a] -= span
        else if (d < -range) arr[i + a] += span
      }
    }
    geometry.attributes.position.needsUpdate = true
    // Чем быстрее летим, тем заметнее пыль.
    material.opacity = 0.12 + Math.min(0.5, flight.speed / 90)
    if (ref.current) ref.current.visible = material.opacity > 0.02
  })

  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} />
}

export default function Starfield() {
  return (
    <>
      <Stars />
      <Nebulae />
      <SpaceDust />
    </>
  )
}
