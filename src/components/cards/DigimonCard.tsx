import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

import {
  digimonCardArtUrl,
  digimonCardCatalogEntry,
  digimonCardDisplayLabel,
  digimonCardIsPlus,
  type DigimonCardInstance,
} from '../../lib/digimonCards'
import {
  digimonCardAttributeIconUrl,
  digimonCardRarityIconUrl,
} from '../../lib/digimonCardIcons'

type DigimonCardProps = {
  card: DigimonCardInstance
  size?: 'compact' | 'showcase'
  selected?: boolean
  interactive?: boolean
  className?: string
  onSelect?: () => void
}

export function DigimonCard({
  card,
  size = 'compact',
  selected = false,
  interactive = true,
  className = '',
  onSelect,
}: DigimonCardProps) {
  const entry = digimonCardCatalogEntry(card.catalogId)
  const artUrl = digimonCardArtUrl(card.catalogId)
  const rootRef = useRef<HTMLElement | null>(null)
  const [tilt, setTilt] = useState({ mx: 0.5, my: 0.5, active: false })

  const setRootRef = useCallback((node: HTMLElement | null) => {
    rootRef.current = node
  }, [])

  const onPointerMove = useCallback((e: PointerEvent) => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const mx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const my = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    setTilt({ mx, my, active: true })
  }, [])

  const onPointerLeave = useCallback(() => {
    setTilt({ mx: 0.5, my: 0.5, active: false })
  }, [])

  if (!entry) return null

  const isPlus = digimonCardIsPlus(card)
  const label = digimonCardDisplayLabel(card)
  const attributeIconUrl = digimonCardAttributeIconUrl(entry.attribute)
  const rarityIconUrl = digimonCardRarityIconUrl(card)
  const style = {
    '--mx': String(tilt.mx),
    '--my': String(tilt.my),
    '--card-accent': entry.accent,
    '--rx': tilt.active ? `${(tilt.my - 0.5) * -14}deg` : '0deg',
    '--ry': tilt.active ? `${(tilt.mx - 0.5) * 18}deg` : '0deg',
  } as CSSProperties

  const classes = [
    'digimon-card',
    `digimon-card--grade-${card.grade.toLowerCase()}`,
    `digimon-card--finish-${card.finish}`,
    isPlus ? 'digimon-card--plus' : '',
    size === 'showcase' ? 'digimon-card--showcase' : 'digimon-card--compact',
    selected ? 'digimon-card--selected' : '',
    tilt.active ? 'digimon-card--tilting' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const body = (
    <>
      <div className="digimon-card__frame" aria-hidden />
      {isPlus && artUrl ? (
        <div className="digimon-card__bleed" aria-hidden>
          <img className="digimon-card__bleed-img" src={artUrl} alt="" draggable={false} />
        </div>
      ) : null}
      <div className="digimon-card__art">
        {artUrl ? (
          <img className="digimon-card__art-img" src={artUrl} alt="" draggable={false} />
        ) : (
          <div className="digimon-card__art-fallback" aria-hidden>
            {entry.name.slice(0, 1)}
          </div>
        )}
      </div>
      {isPlus ? <div className="digimon-card__scrim" aria-hidden /> : null}
      <div className="digimon-card__foil" aria-hidden />
      <div className="digimon-card__glare" aria-hidden />
      <div className="digimon-card__sparkle" aria-hidden />
      {card.grade === 'SSS' ? (
        <div className="digimon-card__data" aria-hidden>
          <div className="digimon-card__data-grid" />
          <div className="digimon-card__data-scan" />
          <div className="digimon-card__data-beam" />
          <div className="digimon-card__data-ring" />
        </div>
      ) : null}
      {card.grade === 'SSS' ? (
        <div className="digimon-card__data-stream" aria-hidden>
          <span>LINK ID</span>
          <span>
            {card.serial != null
              ? String(card.serial).padStart(4, '0')
              : card.catalogId.toUpperCase()}
          </span>
        </div>
      ) : null}
      <div className="digimon-card__meta">
        <span className="digimon-card__attr" title={entry.attribute}>
          {attributeIconUrl ? (
            <img
              className="digimon-card__attr-icon"
              src={attributeIconUrl}
              alt={entry.attribute}
              draggable={false}
            />
          ) : (
            entry.attribute
          )}
        </span>
        <span className="digimon-card__rarity" title={label}>
          {rarityIconUrl ? (
            <img
              className="digimon-card__rarity-icon"
              src={rarityIconUrl}
              alt={label}
              draggable={false}
            />
          ) : (
            label
          )}
        </span>
      </div>
      <div className="digimon-card__footer">
        <strong className="digimon-card__name">{entry.name}</strong>
        <span className="digimon-card__domain">{entry.domain}</span>
        {card.serial != null ? (
          <span className="digimon-card__serial">#{String(card.serial).padStart(4, '0')}</span>
        ) : null}
      </div>
    </>
  )

  const pointerProps = interactive
    ? { onPointerMove, onPointerLeave }
    : ({} as Record<string, never>)

  if (onSelect) {
    return (
      <button
        type="button"
        ref={setRootRef}
        className={classes}
        style={style}
        {...pointerProps}
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${entry.name} · ${label}`}
      >
        {body}
      </button>
    )
  }

  return (
    <div
      ref={setRootRef}
      className={classes}
      style={style}
      {...pointerProps}
      role="img"
      aria-label={`${entry.name} · ${label}`}
    >
      {body}
    </div>
  )
}
