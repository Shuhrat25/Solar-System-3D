import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getBody, PLANETS } from '../data/planets'
import { useStore } from '../store'
import { useIsMobile } from '../hooks/useIsMobile'

const spring = { type: 'spring', stiffness: 190, damping: 26, mass: 0.9 }

export default function PlanetPanel() {
  const selected = useStore((s) => s.selected)
  const closePanel = useStore((s) => s.closePanel)
  const release = useStore((s) => s.release)
  const travelTo = useStore((s) => s.travelTo)
  const [expanded, setExpanded] = useState(false)
  const mobile = useIsMobile()

  const body = selected ? getBody(selected) : null

  useEffect(() => {
    setExpanded(false)
  }, [selected])

  const nextBody = (() => {
    if (!body || body.id === 'sun') return PLANETS[0]
    const i = PLANETS.findIndex((p) => p.id === body.id)
    return PLANETS[(i + 1) % PLANETS.length]
  })()

  return (
    <AnimatePresence>
      {body && (
        <motion.aside
          className={`planet-panel ${mobile ? 'planet-panel--sheet' : ''}`}
          initial={mobile ? { y: '104%' } : { x: '-108%', opacity: 0 }}
          animate={mobile ? { y: 0 } : { x: 0, opacity: 1 }}
          exit={mobile ? { y: '104%' } : { x: '-108%', opacity: 0 }}
          transition={spring}
          style={{ '--accent': body.accent, '--body-color': body.color }}
        >
          <div className="planet-panel__glow" />
          {mobile && <span className="planet-panel__grip" />}

          <header className="planet-panel__head">
            <div>
              <p className="planet-panel__kind">{body.kind}</p>
              <h2 className="planet-panel__name">{body.name}</h2>
              <p className="planet-panel__latin">{body.latin}</p>
            </div>
            <button className="planet-panel__close" onClick={closePanel} aria-label="Закрыть">
              ×
            </button>
          </header>

          <div className="planet-panel__body">
            <p className="planet-panel__short">{body.short}</p>

            <ul className="facts">
              {Object.entries(body.facts).map(([label, value], i) => (
                <motion.li
                  key={label}
                  className="fact"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + i * 0.045, duration: 0.35 }}
                >
                  <span className="fact__label">{label}</span>
                  <span className="fact__value">{value}</span>
                </motion.li>
              ))}
            </ul>

            <button className="disclosure" onClick={() => setExpanded((v) => !v)}>
              <span>{expanded ? 'Свернуть' : 'Подробнее о планете'}</span>
              <motion.span
                className="disclosure__arrow"
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.25 }}
              >
                ▾
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  className="details"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                >
                  {body.details.map((text, i) => (
                    <p key={i}>{text}</p>
                  ))}
                  {body.moons?.length > 0 && (
                    <div className="moon-chips">
                      <span className="moon-chips__label">Спутники в сцене</span>
                      <div>
                        {body.moons.map((m) => (
                          <span key={m.name} className="chip">
                            {m.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <footer className="planet-panel__foot">
            <button className="btn btn--primary" onClick={release}>
              Продолжить полёт
            </button>
            <button className="btn btn--ghost" onClick={() => travelTo(nextBody.id)}>
              Дальше: {nextBody.name} →
            </button>
          </footer>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
