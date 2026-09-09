import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { getTexture } from './textures'
import { orbitSpeed } from '../data/planets'
import { useStore, bodyPositions } from '../store'
import { input } from '../hooks/useInput'
import { quality } from '../quality'

/** Допуск смещения, при котором нажатие ещё считается тапом, а не штурвалом. */
const TAP_SLOP = 14

const DEG = Math.PI / 180

/* ------------------------------------------------------------------ */
/* Атмосферный ореол                                                   */
/* ------------------------------------------------------------------ */

const atmoVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const atmoFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  uniform float uStrength;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    // Солнце в начале координат, поэтому направление на свет — просто -vWorld.
    vec3 sunDir = normalize(-vWorld);
    float lit = max(dot(n, sunDir), 0.0);
    float rim = pow(1.0 - abs(dot(n, viewDir)), uPower);
    float a = rim * (0.12 + 0.88 * lit) * uStrength;
    gl_FragColor = vec4(uColor * a, a);
  }
`

function Atmosphere({ radius, color, power = 3.4, strength = 0.85 }) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power },
      uStrength: { value: strength },
    }),
    [color, power, strength]
  )
  return (
    <mesh scale={radius * 1.09}>
      <sphereGeometry args={[1, 48, 32]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={atmoVertex}
        fragmentShader={atmoFragment}
        transparent
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* Кольца                                                              */
/* ------------------------------------------------------------------ */

function Rings({ body }) {
  const geometry = useMemo(() => {
    const inner = body.radius * body.ring.inner
    const outer = body.radius * body.ring.outer
    const geo = new THREE.RingGeometry(inner, outer, 180, 1)
    // Переразметка UV: u идёт по радиусу, чтобы текстура читалась как полосы.
    const pos = geo.attributes.position
    const uv = geo.attributes.uv
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const r = v.length()
      uv.setXY(i, (r - inner) / (outer - inner), 0.5)
    }
    uv.needsUpdate = true
    return geo
  }, [body])

  const map = getTexture(`${body.id}:ring`)

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <meshBasicMaterial
        map={map}
        side={THREE.DoubleSide}
        transparent
        depthWrite={false}
        opacity={0.94}
      />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* Спутники                                                            */
/* ------------------------------------------------------------------ */

function Moon({ planetId, moon, index }) {
  const pivot = useRef()
  const phase = useMemo(() => index * 1.9 + planetId.length, [index, planetId])
  const map = getTexture(`moon:${planetId}:${moon.name}:map`)
  const bump = getTexture(`moon:${planetId}:${moon.name}:bump`)

  useFrame((state) => {
    if (pivot.current) pivot.current.rotation.y = phase + state.clock.elapsedTime * moon.speed
  })

  return (
    <group rotation={[moon.tilt ?? 0, 0, 0]}>
      <group ref={pivot}>
        <mesh position={[moon.distance, 0, 0]} castShadow receiveShadow>
          <sphereGeometry args={[moon.radius, quality.moonSegments[0], quality.moonSegments[1]]} />
          <meshStandardMaterial
            map={map}
            bumpMap={bump}
            bumpScale={moon.radius * 0.12}
            roughness={0.95}
            metalness={0}
          />
        </mesh>
      </group>
      {/* Тонкая траектория спутника */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[moon.distance - 0.008, moon.distance + 0.008, 96]} />
        <meshBasicMaterial
          color="#8fb6e8"
          transparent
          opacity={0.14}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Планета                                                             */
/* ------------------------------------------------------------------ */

export default function Planet({ body, index }) {
  const pivot = useRef()
  const anchor = useRef()
  const surface = useRef()
  const clouds = useRef()
  const labelRef = useRef()
  const haloRef = useRef()

  const setHovered = useStore((s) => s.setHovered)
  const travelTo = useStore((s) => s.travelTo)
  const showLabels = useStore((s) => s.showLabels)

  const speed = useMemo(() => orbitSpeed(body.orbitRadius), [body.orbitRadius])
  const phase = useMemo(() => (index * 2.399963) % (Math.PI * 2), [index])
  const spin = useMemo(() => (Math.PI * 2) / body.rotationPeriod, [body.rotationPeriod])
  const worldPos = useMemo(() => new THREE.Vector3(), [])

  const segments = body.radius > 2.4 ? quality.bigPlanetSegments : quality.planetSegments
  const map = getTexture(`${body.id}:map`)
  const bump = getTexture(`${body.id}:bump`)
  const cloudMap = body.clouds ? getTexture(`${body.id}:clouds`) : null

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    if (pivot.current) pivot.current.rotation.y = phase - t * speed
    if (surface.current) surface.current.rotation.y += delta * spin
    if (clouds.current) clouds.current.rotation.y += delta * spin * 1.22

    if (anchor.current) {
      anchor.current.getWorldPosition(worldPos)
      let stored = bodyPositions.get(body.id)
      if (!stored) {
        stored = new THREE.Vector3()
        bodyPositions.set(body.id, stored)
      }
      stored.copy(worldPos)

      // Подпись гаснет вдалеке и у самой поверхности, чтобы не мешать.
      if (labelRef.current) {
        const d = state.camera.position.distanceTo(worldPos)
        const near = body.radius * 3.2
        const far = 520
        const o =
          d < near ? 0 : d > far ? 0 : Math.min(1, (d - near) / (near * 1.6)) * (1 - Math.max(0, (d - far * 0.6) / (far * 0.4)))
        labelRef.current.style.opacity = showLabels ? String(Math.max(0, Math.min(1, o))) : '0'
      }
    }

    if (haloRef.current) {
      const hovered = useStore.getState().hovered === body.id
      const target = hovered ? 1 : 0
      haloRef.current.material.opacity += (target * 0.55 - haloRef.current.material.opacity) * Math.min(1, delta * 8)
      haloRef.current.visible = haloRef.current.material.opacity > 0.01
    }
  })

  const handleClick = (e) => {
    e.stopPropagation()
    if (input.dragDistance > TAP_SLOP) return
    travelTo(body.id)
  }

  return (
    <group rotation={[body.orbitTilt ?? 0, 0, 0]}>
      <group ref={pivot}>
        <group ref={anchor} position={[body.orbitRadius, 0, 0]}>
          <group rotation={[0, 0, (body.axialTilt ?? 0) * DEG]}>
            <mesh
              ref={surface}
              castShadow
              receiveShadow
              onPointerOver={(e) => {
                e.stopPropagation()
                setHovered(body.id)
                document.body.style.cursor = 'pointer'
              }}
              onPointerOut={() => {
                setHovered(null)
                document.body.style.cursor = ''
              }}
              onClick={handleClick}
            >
              <sphereGeometry args={[body.radius, segments[0], segments[1]]} />
              <meshStandardMaterial
                map={map}
                bumpMap={bump}
                bumpScale={body.surface === 'rocky' || body.surface === 'earth' ? body.radius * 0.06 : body.radius * 0.015}
                roughness={body.surface === 'gas' || body.surface === 'ice' ? 0.85 : 0.96}
                metalness={0.02}
              />
            </mesh>

            {cloudMap && (
              <mesh ref={clouds} scale={1.017}>
                <sphereGeometry args={[body.radius, 48, 32]} />
                <meshStandardMaterial
                  map={cloudMap}
                  transparent
                  opacity={0.72}
                  depthWrite={false}
                  roughness={1}
                />
              </mesh>
            )}

            {body.ring && <Rings body={body} />}

            {body.moons?.map((moon, i) => (
              <Moon key={moon.name} planetId={body.id} moon={moon} index={i} />
            ))}
          </group>

          {body.atmosphere && <Atmosphere radius={body.radius} color={body.atmosphere} />}

          {/* Подсветка при наведении курсора */}
          <mesh ref={haloRef} scale={body.radius * 1.32} visible={false}>
            <sphereGeometry args={[1, 32, 24]} />
            <meshBasicMaterial
              color={body.accent}
              transparent
              opacity={0}
              side={THREE.BackSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          <Html
            center
            position={[0, body.radius * 1.9 + 0.6, 0]}
            zIndexRange={[8, 0]}
            style={{ pointerEvents: 'none', transition: 'opacity .25s' }}
          >
            <div className="planet-label" ref={labelRef}>
              <span className="planet-label__dot" style={{ background: body.color }} />
              <span className="planet-label__name">{body.name}</span>
            </div>
          </Html>
        </group>
      </group>
    </group>
  )
}
