import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getTexture } from './textures'
import { SUN } from '../data/planets'
import { useStore, bodyPositions } from '../store'
import { input } from '../hooks/useInput'

const vertexShader = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vPos = position;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCore;
  uniform vec3 uMid;
  uniform vec3 uEdge;
  varying vec3 vPos;
  varying vec3 vNormalW;
  varying vec3 vWorld;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  float fbm(vec3 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amp * noise(p);
      p *= 2.03;
      amp *= 0.5;
    }
    return sum;
  }

  void main() {
    vec3 p = normalize(vPos);
    // Два слоя конвекции, плывущие с разной скоростью.
    float a = fbm(p * 3.4 + vec3(0.0, uTime * 0.035, uTime * 0.02));
    float b = fbm(p * 9.0 - vec3(uTime * 0.06, 0.0, uTime * 0.04));
    float h = a * 0.62 + b * 0.38;

    vec3 col = mix(uEdge, uMid, smoothstep(0.22, 0.55, h));
    col = mix(col, uCore, smoothstep(0.52, 0.86, h));

    // Потемнение к краю диска — как у настоящей звезды.
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float mu = max(dot(normalize(vNormalW), viewDir), 0.0);
    col *= 0.55 + 0.45 * pow(mu, 0.45);
    // …и тонкий раскалённый ободок сверху.
    col += uCore * pow(1.0 - mu, 3.0) * 0.6;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export default function Sun() {
  const coronaRef = useRef()
  const flareRef = useRef()
  const meshRef = useRef()
  const setHovered = useStore((s) => s.setHovered)
  const travelTo = useStore((s) => s.travelTo)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCore: { value: new THREE.Color('#fff6d8').multiplyScalar(1.6) },
      uMid: { value: new THREE.Color('#ffb43c') },
      uEdge: { value: new THREE.Color('#e05a12') },
    }),
    []
  )

  const glow = getTexture('glow')

  useFrame((state, delta) => {
    uniforms.uTime.value += delta
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.02
      bodyPositions.set('sun', meshRef.current.getWorldPosition(new THREE.Vector3()))
    }
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 0.55) * 0.03
    if (coronaRef.current) coronaRef.current.scale.setScalar(SUN.radius * 5.4 * pulse)
    if (flareRef.current) {
      flareRef.current.scale.setScalar(SUN.radius * 11 * (2 - pulse))
    }
  })

  return (
    <group>
      <mesh
        ref={meshRef}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered('sun')
        }}
        onPointerOut={() => setHovered(null)}
        onClick={(e) => {
          e.stopPropagation()
          if (input.dragDistance > 14) return
          travelTo('sun')
        }}
      >
        <sphereGeometry args={[SUN.radius, 96, 64]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
        />
      </mesh>

      {/* Корона и дальний ореол — аддитивные билборды. */}
      <sprite ref={coronaRef} scale={SUN.radius * 5.4}>
        <spriteMaterial
          map={glow}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0.85}
        />
      </sprite>
      <sprite ref={flareRef} scale={SUN.radius * 11}>
        <spriteMaterial
          map={glow}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0.22}
        />
      </sprite>

      <pointLight intensity={2.6} decay={0} color="#fff3dd" />
      <pointLight intensity={1.1} decay={0} distance={0} color="#ffb066" />
    </group>
  )
}
