/**
 * Профиль качества сцены.
 *
 * На телефоне и слабый GPU, и медленный CPU: текстуры генерируются
 * процедурно, поэтому их размер напрямую влияет на время загрузки.
 * Профиль вычисляется один раз при старте — менять его на лету нельзя,
 * иначе пришлось бы пересобирать всю сцену.
 */

const hasWindow = typeof window !== 'undefined'

const coarsePointer = hasWindow && window.matchMedia('(pointer: coarse)').matches
const shortSide = hasWindow ? Math.min(window.innerWidth, window.innerHeight) : 1080
const smallScreen = shortSide < 760
const fewCores = hasWindow && (navigator.hardwareConcurrency || 8) <= 4
const lowMemory = hasWindow && (navigator.deviceMemory || 8) <= 4

/** Телефон или планшет: сенсорный ввод либо просто маленький экран. */
export const isTouch = coarsePointer
export const isMobile = coarsePointer || smallScreen
/** Совсем слабое устройство — режем ещё сильнее. */
export const isLowEnd = isMobile && (fewCores || lowMemory)

export const quality = isMobile
  ? {
      dpr: isLowEnd ? [1, 1.2] : [1, 1.6],
      stars: isLowEnd ? 2200 : 3600,
      dust: isLowEnd ? 120 : 220,
      nebulae: 4,
      beltMain: isLowEnd ? 420 : 800,
      beltKuiper: isLowEnd ? 260 : 480,
      exhaust: 90,
      // Текстуры вдвое меньше по стороне — вчетверо меньше пикселей и времени.
      textureScale: isLowEnd ? 0.25 : 0.5,
      planetSegments: [40, 28],
      bigPlanetSegments: [48, 34],
      moonSegments: [18, 12],
      bloom: !isLowEnd,
      bloomIntensity: 0.55,
    }
  : {
      dpr: [1, 1.8],
      stars: 9000,
      dust: 500,
      nebulae: 7,
      beltMain: 2200,
      beltKuiper: 1400,
      exhaust: 160,
      textureScale: 1,
      planetSegments: [48, 32],
      bigPlanetSegments: [64, 48],
      moonSegments: [24, 16],
      bloom: true,
      bloomIntensity: 0.7,
    }
