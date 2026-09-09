import { create } from 'zustand'
import * as THREE from 'three'

/**
 * Zustand хранит только «редкие» состояния (режим полёта, выбранная планета).
 * Всё, что меняется каждый кадр — скорость, позиция, дистанция — лежит
 * в обычном объекте `flight`, чтобы не дёргать React 60 раз в секунду.
 */
export const useStore = create((set, get) => ({
  /** loading -> cinematic -> flight */
  phase: 'loading',
  /** free | travel | orbit */
  mode: 'free',
  /** id тела, к которому летим или которое рассматриваем */
  target: null,
  /** id тела, чья карточка открыта */
  selected: null,
  hovered: null,
  vehicle: 'rocket', // rocket | astronaut
  showOrbits: true,
  showLabels: true,
  helpOpen: false,
  navOpen: true,
  progress: 0,
  progressLabel: '',
  arrived: false,

  setProgress: (progress, progressLabel) => set({ progress, progressLabel }),
  setPhase: (phase) => set({ phase }),
  setHovered: (hovered) => set({ hovered }),

  /** Начать автопилотный перелёт к телу. */
  travelTo: (id) => {
    if (!id) return
    set({ mode: 'travel', target: id, selected: null, arrived: false })
  },

  /** Автопилот прибыл — открываем карточку и переходим на орбиту. */
  arrive: () => {
    const { target } = get()
    set({ mode: 'orbit', selected: target, arrived: true })
  },

  /** Вернуться к свободному полёту. */
  release: () => set({ mode: 'free', selected: null, target: null, arrived: false }),

  closePanel: () => set({ selected: null }),
  openPanel: (id) => set({ selected: id }),
  toggleOrbits: () => set((s) => ({ showOrbits: !s.showOrbits })),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
  setVehicle: (vehicle) => set({ vehicle }),
}))

/** Мировые позиции тел, обновляются планетами каждый кадр. */
export const bodyPositions = new Map()

/** Данные полёта корабля, читаются HUD-ом через requestAnimationFrame. */
export const flight = {
  position: new THREE.Vector3(0, 26, 150),
  quaternion: new THREE.Quaternion(),
  velocity: new THREE.Vector3(),
  speed: 0,
  throttle: 0,
  boost: false,
  distanceToTarget: 0,
  travelProgress: 0,
  /** Дистанция до Солнца в «условных а.е.» для показаний приборов. */
  distanceToSun: 0,
}

/** Единица масштаба: 50 единиц сцены = 1 а.е. (орбита Земли). */
export const UNITS_PER_AU = 50
