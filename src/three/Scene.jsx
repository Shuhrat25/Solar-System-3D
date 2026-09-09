import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { PLANETS } from '../data/planets'
import Sun from './Sun'
import Planet from './Planet'
import Orbits from './Orbits'
import Starfield from './Starfield'
import Spaceship from './Spaceship'
import CameraRig from './CameraRig'
import { quality } from '../quality'

export default function Scene() {
  return (
    <>
      <color attach="background" args={['#02030a']} />
      {/* Слабая заливка, чтобы ночные стороны планет не проваливались в чёрный. */}
      <ambientLight intensity={0.11} color="#8fa8d8" />
      <hemisphereLight intensity={0.06} color="#6f8fd0" groundColor="#120a20" />

      <Starfield />
      <Sun />
      <Orbits />
      {PLANETS.map((body, i) => (
        <Planet key={body.id} body={body} index={i} />
      ))}

      <Spaceship />
      <CameraRig />

      <EffectComposer disableNormalPass multisampling={0}>
        {quality.bloom && (
          <Bloom
            mipmapBlur
            intensity={quality.bloomIntensity}
            luminanceThreshold={0.45}
            luminanceSmoothing={0.32}
            radius={0.74}
          />
        )}
        <Vignette offset={0.22} darkness={0.7} eskil={false} />
      </EffectComposer>
    </>
  )
}
