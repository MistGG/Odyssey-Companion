import { useEffect, useMemo, useState } from 'react'

import {
  CARDS_PER_PACK,
  DIGIMON_CARD_CATALOG,
  findOwnedCard,
  loadDigimonCardCollection,
  openDigimonCardPack,
  saveDigimonCardCollection,
  setDigimonCardShowcase,
  uniqueCatalogCount,
  type DigimonCardCollectionState,
  type DigimonCardInstance,
} from '../../lib/digimonCards'
import { DigimonCard } from './DigimonCard'

export function CardsCollectionPanel() {
  const [state, setState] = useState<DigimonCardCollectionState>(() => loadDigimonCardCollection())
  const [reveal, setReveal] = useState<DigimonCardInstance[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    // Re-load so one-time gifts (e.g. A+ starter cards) land even if the panel was already open.
    const next = loadDigimonCardCollection()
    setState(next)
  }, [])

  useEffect(() => {
    saveDigimonCardCollection(state)
  }, [state])

  useEffect(() => {
    if (!selectedId && state.showcaseInstanceId) {
      setSelectedId(state.showcaseInstanceId)
    }
  }, [selectedId, state.showcaseInstanceId])

  const showcase = useMemo(
    () => findOwnedCard(state, state.showcaseInstanceId),
    [state],
  )
  const selected = useMemo(
    () => findOwnedCard(state, selectedId) ?? showcase,
    [state, selectedId, showcase],
  )
  const uniqueCount = uniqueCatalogCount(state)
  const ownedSorted = useMemo(() => {
    return [...state.owned].sort((a, b) => b.pulledAt - a.pulledAt)
  }, [state.owned])

  function onOpenPack() {
    if (opening || state.packs < 1) return
    setOpening(true)
    const result = openDigimonCardPack(state)
    if (!result) {
      setOpening(false)
      return
    }
    setState(result.state)
    setReveal(result.pulled)
    setSelectedId(result.pulled[result.pulled.length - 1]?.instanceId ?? null)
    window.setTimeout(() => setOpening(false), 400)
  }

  function onSetShowcase(instanceId: string) {
    setSelectedId(instanceId)
    setState((prev) => setDigimonCardShowcase(prev, instanceId))
  }

  function onDismissReveal() {
    setReveal(null)
  }

  return (
    <section className="cards-collection" aria-labelledby="cards-collection-heading">
      <header className="cards-collection__header">
        <div className="cards-collection__stats">
          <h3 id="cards-collection-heading" className="themes-panel__section-title">
            Digimon card collection
          </h3>
          <p className="muted cards-collection__summary">
            {state.owned.length} cards · {uniqueCount}/{DIGIMON_CARD_CATALOG.length} digimon ·{' '}
            {state.packs} pack{state.packs === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          className="btn primary cards-collection__open-btn"
          disabled={state.packs < 1 || opening}
          onClick={onOpenPack}
        >
          {state.packs < 1 ? 'No packs left' : `Open pack (${CARDS_PER_PACK} cards)`}
        </button>
      </header>

      {reveal ? (
        <div className="cards-collection__reveal" role="dialog" aria-label="Pack reveal">
          <div className="cards-collection__reveal-head">
            <h4 className="cards-collection__reveal-title">Pack opened</h4>
            <button type="button" className="btn ghost" onClick={onDismissReveal}>
              Done
            </button>
          </div>
          <ul className="cards-collection__reveal-grid">
            {reveal.map((card, i) => (
              <li
                key={card.instanceId}
                className="cards-collection__reveal-item"
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <DigimonCard
                  card={card}
                  size="compact"
                  selected={selectedId === card.instanceId}
                  onSelect={() => onSetShowcase(card.instanceId)}
                />
              </li>
            ))}
          </ul>
          <p className="muted cards-collection__hint">Click a card to set it as your showcase.</p>
        </div>
      ) : null}

      <div className="cards-collection__body">
        <div className="cards-collection__showcase">
          <h4 className="cards-collection__subhead">Showcase</h4>
          {selected ? (
            <>
              <DigimonCard card={selected} size="showcase" />
              {state.showcaseInstanceId !== selected.instanceId ? (
                <button
                  type="button"
                  className="btn ghost cards-collection__showcase-set"
                  onClick={() => onSetShowcase(selected.instanceId)}
                >
                  Set as showcase
                </button>
              ) : (
                <p className="muted cards-collection__showcase-label">Pinned showcase</p>
              )}
            </>
          ) : (
            <p className="muted">Open a pack to start your album.</p>
          )}
        </div>

        <div className="cards-collection__album">
          <h4 className="cards-collection__subhead">Album</h4>
          {ownedSorted.length === 0 ? (
            <p className="muted">No cards yet — you have {state.packs} starter packs waiting.</p>
          ) : (
            <ul className="cards-collection__grid">
              {ownedSorted.map((card) => (
                <li key={card.instanceId}>
                  <DigimonCard
                    card={card}
                    size="compact"
                    selected={selectedId === card.instanceId}
                    onSelect={() => setSelectedId(card.instanceId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
