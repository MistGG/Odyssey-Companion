import { useEffect, useState, type CSSProperties } from 'react'
import MapleDamageSkinImage from './MapleDamageSkinImage'

const ACTION_DIGIT_FRAME_MS = 80

type Props = {
  frameUrls: string[]
  alt: string
  style?: CSSProperties
}

export default function MapleDamageSkinAnimatedDigit({ frameUrls, alt, style }: Props) {
  const [frame, setFrame] = useState(0)
  const activeUrl = frameUrls[frame] ?? frameUrls[0] ?? ''

  useEffect(() => {
    setFrame(0)
  }, [frameUrls])

  useEffect(() => {
    if (frameUrls.length <= 1) return
    const id = window.setInterval(() => {
      setFrame((current) => (current + 1) % frameUrls.length)
    }, ACTION_DIGIT_FRAME_MS)
    return () => window.clearInterval(id)
  }, [frameUrls])

  if (!activeUrl) return null

  return <MapleDamageSkinImage apiUrl={activeUrl} alt={alt} style={style} />
}
