import { useEffect, useState } from 'react'

/**
 * Реактивная проверка «мобильной» вёрстки. В отличие от `isMobile` из
 * quality.js этот хук пересчитывается при повороте экрана и изменении
 * размеров окна — им управляется компоновка интерфейса.
 */
const QUERY = '(max-width: 680px), (pointer: coarse) and (max-width: 940px)'

/** Та же проверка вне React — нужна в кадровом цикле камеры. */
const mql = typeof window !== 'undefined' ? window.matchMedia(QUERY) : null
export const isMobileLayout = () => !!mql?.matches

export function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  )

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = (e) => setMobile(e.matches)
    setMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return mobile
}
