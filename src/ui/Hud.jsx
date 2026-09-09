import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PLANETS, SUN, getBody } from '../data/planets'
import { flight, useStore } from '../store'
import { useIsMobile } from '../hooks/useIsMobile'

/** Условный перевод игровых единиц в «человеческие» показания приборов. */
const KM_PER_UNIT = 3 // млн км
const KMS_PER_UNIT = 1.5 // км/с

function Telemetry() {
  const speedRef = useRef(null)
  const barRef = useRef(null)
  const sunRef = useRef(null)
  const targetRef = useRef(null)
  const targetRowRef = useRef(null)
  const boostRef = useRef(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const speed = flight.speed * KMS_PER_UNIT
      if (speedRef.current) speedRef.current.textContent = speed.toFixed(1)
      if (barRef.current) {
        const pct = Math.min(100, (flight.speed / 160) * 100)
        barRef.current.style.width = `${pct}%`
      }
      if (boostRef.current) boostRef.current.dataset.on = flight.boost ? 'yes' : 'no'
      if (sunRef.current) sunRef.current.textContent = flight.distanceToSun.toFixed(2)
      const t = useStore.getState().target ?? useStore.getState().selected
      if (targetRowRef.current) targetRowRef.current.style.opacity = t ? '1' : '0.28'
      if (targetRef.current) {
        targetRef.current.textContent = t
          ? `${(flight.distanceToTarget * KM_PER_UNIT).toFixed(1)}`
          : '—'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="panel panel--telemetry">
      <div className="telemetry__speed">
        <span className="telemetry__value" ref={speedRef}>
          0.0
        </span>
        <span className="telemetry__unit">км/с</span>
        <span className="telemetry__boost" ref={boostRef} data-on="no">
          ФОРСАЖ
        </span>
      </div>
      <div className="telemetry__bar">
        <i ref={barRef} />
      </div>
      <dl className="telemetry__rows">
        <div className="telemetry__row">
          <dt>До Солнца</dt>
          <dd>
            <span ref={sunRef}>0.00</span> а.е.
          </dd>
        </div>
        <div className="telemetry__row" ref={targetRowRef}>
          <dt>До цели</dt>
          <dd>
            <span ref={targetRef}>—</span> млн км
          </dd>
        </div>
      </dl>
    </div>
  )
}

const BODIES = [SUN, ...PLANETS]

/** На телефоне список превращается в горизонтальную ленту «фишек». */
function NavList({ mobile }) {
  const navOpen = useStore((s) => s.navOpen)
  const toggleNav = useStore((s) => s.toggleNav)
  const travelTo = useStore((s) => s.travelTo)
  const setHovered = useStore((s) => s.setHovered)
  const target = useStore((s) => s.target)

  const items = BODIES.map((body) => (
    <li key={body.id}>
      <button
        className={`nav-item ${target === body.id ? 'is-active' : ''}`}
        onClick={() => travelTo(body.id)}
        onMouseEnter={() => setHovered(body.id)}
        onMouseLeave={() => setHovered(null)}
      >
        <span className="nav-item__dot" style={{ background: body.color }} />
        <span className="nav-item__name">{body.name}</span>
        <span className="nav-item__au">{body.au}</span>
      </button>
    </li>
  ))

  if (mobile) {
    return (
      <nav className="panel panel--nav panel--strip" aria-label="Маршрут">
        <ul className="nav-list">{items}</ul>
      </nav>
    )
  }

  return (
    <div className={`panel panel--nav ${navOpen ? 'is-open' : 'is-closed'}`}>
      <button className="panel__head" onClick={toggleNav}>
        <span className="panel__title">Маршрут</span>
        <span className="panel__chevron">{navOpen ? '▾' : '▸'}</span>
      </button>
      <AnimatePresence initial={false}>
        {navOpen && (
          <motion.ul
            className="nav-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {items}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

function ModeBadge() {
  const mode = useStore((s) => s.mode)
  const target = useStore((s) => s.target)
  const body = target ? getBody(target) : null

  const label =
    mode === 'travel'
      ? `Автопилот → ${body?.name ?? ''}`
      : mode === 'orbit'
      ? `Орбита: ${body?.name ?? ''}`
      : 'Свободный полёт'

  return (
    <motion.div
      className="mode-badge"
      data-mode={mode}
      key={label}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <span className="mode-badge__pulse" />
      <span className="mode-badge__text">{label}</span>
    </motion.div>
  )
}

function TravelProgress() {
  const mode = useStore((s) => s.mode)
  const ref = useRef(null)

  useEffect(() => {
    if (mode !== 'travel') return
    let raf = 0
    const tick = () => {
      if (ref.current) ref.current.style.transform = `scaleX(${flight.travelProgress})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode])

  return (
    <AnimatePresence>
      {mode === 'travel' && (
        <motion.div
          className="travel-progress"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <i ref={ref} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Toolbar() {
  const vehicle = useStore((s) => s.vehicle)
  const showOrbits = useStore((s) => s.showOrbits)
  const showLabels = useStore((s) => s.showLabels)
  const helpOpen = useStore((s) => s.helpOpen)
  const toggleOrbits = useStore((s) => s.toggleOrbits)
  const toggleLabels = useStore((s) => s.toggleLabels)
  const setVehicle = useStore((s) => s.setVehicle)
  const toggleHelp = useStore((s) => s.toggleHelp)

  return (
    <div className="toolbar">
      <button
        className={`tool ${vehicle === 'rocket' ? 'is-on' : ''}`}
        onClick={() => setVehicle(vehicle === 'rocket' ? 'astronaut' : 'rocket')}
        title="Сменить аппарат"
        aria-label="Сменить аппарат"
      >
        <span className="tool__icon">{vehicle === 'rocket' ? '🚀' : '👨‍🚀'}</span>
        <span className="tool__label">{vehicle === 'rocket' ? 'Ракета' : 'Космонавт'}</span>
      </button>
      <button
        className={`tool ${showOrbits ? 'is-on' : ''}`}
        onClick={toggleOrbits}
        title="Орбиты"
        aria-label="Орбиты"
      >
        <span className="tool__icon">◎</span>
        <span className="tool__label">Орбиты</span>
      </button>
      <button
        className={`tool ${showLabels ? 'is-on' : ''}`}
        onClick={toggleLabels}
        title="Подписи"
        aria-label="Подписи"
      >
        <span className="tool__icon">⌗</span>
        <span className="tool__label">Подписи</span>
      </button>
      <button
        className={`tool ${helpOpen ? 'is-on' : ''}`}
        onClick={toggleHelp}
        title="Управление"
        aria-label="Управление"
      >
        <span className="tool__icon">?</span>
        <span className="tool__label">Управление</span>
      </button>
    </div>
  )
}

const CONTROLS = [
  ['W / ↑', 'тяга вперёд'],
  ['S / ↓', 'тормозной импульс'],
  ['A · D / ← →', 'поворот'],
  ['R · F', 'тангаж вверх и вниз'],
  ['Q · E', 'крен'],
  ['Мышь', 'зажать и вести — штурвал'],
  ['Shift', 'форсаж'],
  ['Пробел', 'гашение скорости'],
  ['Клик по планете', 'автопилот к ней'],
  ['Esc', 'вернуться к свободному полёту'],
]

const TOUCH_CONTROLS = [
  ['Стик', 'поворот и тангаж'],
  ['ТЯГА', 'двигатель вперёд'],
  ['ФОРСАЖ', 'разгон на полную'],
  ['Тап по планете', 'автопилот к ней'],
  ['Лента сверху', 'выбор цели'],
  ['Свайп по небу', 'штурвал'],
  ['На орбите', 'свайп — осмотр планеты'],
]

function HelpCard({ mobile }) {
  const helpOpen = useStore((s) => s.helpOpen)
  const toggleHelp = useStore((s) => s.toggleHelp)
  const rows = mobile ? TOUCH_CONTROLS : CONTROLS

  return (
    <AnimatePresence>
      {helpOpen && (
        <motion.div
          className="panel panel--help"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="panel__head panel__head--static">
            <span className="panel__title">Управление</span>
            <button className="panel__close" onClick={toggleHelp} aria-label="Закрыть">
              ×
            </button>
          </div>
          <ul className="help-list">
            {rows.map(([key, desc]) => (
              <li key={key}>
                <kbd>{key}</kbd>
                <span>{desc}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Crosshair() {
  const mode = useStore((s) => s.mode)
  return (
    <AnimatePresence>
      {mode === 'free' && (
        <motion.div
          className="crosshair"
          initial={{ opacity: 0, scale: 1.4 }}
          animate={{ opacity: 0.75, scale: 1 }}
          exit={{ opacity: 0, scale: 1.4 }}
          transition={{ duration: 0.3 }}
        >
          <span className="crosshair__ring" />
          <span className="crosshair__dot" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function Hud() {
  const mode = useStore((s) => s.mode)
  const release = useStore((s) => s.release)
  const mobile = useIsMobile()

  return (
    <div className={`hud ${mobile ? 'hud--mobile' : ''}`}>
      <header className="hud__top">
        <div className="brand">
          <span className="brand__mark" />
          <span className="brand__text">
            Космический<b>исследователь</b>
          </span>
        </div>
        <ModeBadge />
        <Toolbar />
      </header>

      {mobile && (
        <div className="hud__strip">
          <NavList mobile />
        </div>
      )}

      <Crosshair />
      <TravelProgress />

      <div className="hud__left">
        <Telemetry />
        <AnimatePresence>
          {mode === 'orbit' && (
            <motion.button
              className="btn btn--ghost btn--undock"
              onClick={release}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
            >
              ← Отстыковаться
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {!mobile && (
        <div className="hud__right">
          <NavList mobile={false} />
        </div>
      )}

      <div className="hud__bottom">
        <HelpCard mobile={mobile} />
        <p className="hud__hint">
          <kbd>W</kbd> тяга · <kbd>A</kbd>/<kbd>D</kbd> поворот · <kbd>Shift</kbd> форсаж · зажатая
          мышь — штурвал · клик по планете — автопилот
        </p>
      </div>
    </div>
  )
}
