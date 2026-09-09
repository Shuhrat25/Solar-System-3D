import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { AnimatePresence, motion } from 'framer-motion'
import Scene from './three/Scene'
import { generateAllTextures } from './three/textures'
import { BODIES } from './data/planets'
import { useStore } from './store'
import { useInput } from './hooks/useInput'
import Hud from './ui/Hud'
import PlanetPanel from './ui/PlanetPanel'
import { LoadingScreen, IntroOverlay, TouchControls } from './ui/Overlays'
import { quality } from './quality'

export default function App() {
  const wrapRef = useRef(null)
  const [ready, setReady] = useState(false)
  const phase = useStore((s) => s.phase)
  const setProgress = useStore((s) => s.setProgress)
  const setPhase = useStore((s) => s.setPhase)

  useInput(wrapRef)

  // Текстуры рисуются на canvas до старта сцены: так ничего не «мигает».
  useEffect(() => {
    let cancelled = false
    generateAllTextures(BODIES, (p, label) => {
      if (!cancelled) setProgress(p, label)
    }).then(() => {
      if (cancelled) return
      setProgress(1, 'готово')
      setReady(true)
      // Небольшая пауза, чтобы полоса успела дойти до конца.
      setTimeout(() => !cancelled && setPhase('cinematic'), 500)
    })
    return () => {
      cancelled = true
    }
  }, [setProgress, setPhase])

  return (
    <div className="app">
      <div className="canvas-wrap" ref={wrapRef}>
        {ready && (
          <Canvas
            dpr={quality.dpr}
            camera={{ fov: 58, near: 0.05, far: 9000, position: [0, 330, 760] }}
            gl={{
              antialias: false,
              alpha: false,
              powerPreference: 'high-performance',
            }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping
              gl.toneMappingExposure = 1.05
            }}
          >
            <Scene />
          </Canvas>
        )}
      </div>

      <AnimatePresence>
        {phase === 'loading' && <LoadingScreen key="loader" />}
      </AnimatePresence>

      <IntroOverlay />

      <AnimatePresence>
        {phase === 'flight' && (
          <motion.div
            key="hud"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
          >
            <Hud />
            <TouchControls />
          </motion.div>
        )}
      </AnimatePresence>

      <PlanetPanel />
    </div>
  )
}
