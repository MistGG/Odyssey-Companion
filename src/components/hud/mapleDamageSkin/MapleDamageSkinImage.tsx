import { useEffect, useState, type CSSProperties } from 'react'
import {
  getMapleImageCache,
  loadMapleImage,
  subscribeMapleImageCache,
} from '../../../lib/mapleDamageSkin/imageCache'

type Props = {
  apiUrl: string
  alt: string
  style?: CSSProperties
  className?: string
}

export default function MapleDamageSkinImage({ apiUrl, alt, style, className }: Props) {
  const [src, setSrc] = useState(() => getMapleImageCache(apiUrl) ?? '')

  useEffect(() => {
    const cached = getMapleImageCache(apiUrl)
    if (cached) {
      setSrc(cached)
      return
    }

    let cancelled = false
    void loadMapleImage(apiUrl).then((next: string) => {
      if (!cancelled && next) setSrc(next)
    })

    const unsubscribe = subscribeMapleImageCache(() => {
      const hit = getMapleImageCache(apiUrl)
      if (hit) setSrc(hit)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [apiUrl])

  if (!src) return null

  return (
    <img
      className={className}
      draggable={false}
      alt={alt}
      src={src}
      style={style}
      onError={() => setSrc('')}
    />
  )
}
