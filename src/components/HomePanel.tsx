import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchForumTeaser, type ForumTeaser } from '../lib/forumTeaser'
import {
  patchNoteDisplayParts,
  patchNoteKind,
  type PatchNoteEntry,
} from '../lib/patchNotes'
import { fetchPatchNote, fetchPatchNotes } from '../lib/patchNotesApi'

const PATCH_NOTES_URL = 'https://thedigitalodyssey.com/patch-notes'

export function HomePanel() {
  const [teaser, setTeaser] = useState<ForumTeaser | null>(null)
  const [teaserLoading, setTeaserLoading] = useState(true)
  const [teaserError, setTeaserError] = useState<string | null>(null)
  const [imgFailed, setImgFailed] = useState(false)

  const [patchNotes, setPatchNotes] = useState<PatchNoteEntry[]>([])
  const [patchLoading, setPatchLoading] = useState(true)
  const [patchError, setPatchError] = useState<string | null>(null)
  const [selectedPatchId, setSelectedPatchId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const teaserRef = useRef<ForumTeaser | null>(null)
  teaserRef.current = teaser
  const patchNotesRef = useRef<PatchNoteEntry[]>([])
  patchNotesRef.current = patchNotes

  const loadTeaser = useCallback(async () => {
    const hadTeaser = teaserRef.current != null
    setTeaserError(null)
    setImgFailed(false)
    if (!hadTeaser) setTeaserLoading(true)
    try {
      setTeaser(await fetchForumTeaser())
    } catch (e) {
      if (!hadTeaser) {
        setTeaser(null)
        setTeaserError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setTeaserLoading(false)
    }
  }, [])

  const loadPatchNotes = useCallback(async () => {
    const hadNotes = patchNotesRef.current.length > 0
    setPatchError(null)
    if (!hadNotes) setPatchLoading(true)
    try {
      const notes = await fetchPatchNotes()
      setPatchNotes(notes)
      setSelectedPatchId((prev) => {
        if (prev && notes.some((note) => note.id === prev)) return prev
        return notes[0]?.id ?? null
      })
    } catch (e) {
      if (!hadNotes) {
        setPatchNotes([])
        setPatchError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setPatchLoading(false)
    }
  }, [])

  const refreshHome = useCallback(() => {
    void loadTeaser()
    void loadPatchNotes()
  }, [loadTeaser, loadPatchNotes])

  useEffect(() => {
    refreshHome()
  }, [refreshHome])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.onHomeRefresh) return
    return api.onHomeRefresh(refreshHome)
  }, [refreshHome])

  const selectedPatch =
    patchNotes.find((note) => note.id === selectedPatchId) ?? patchNotes[0] ?? null

  useEffect(() => {
    if (!selectedPatch || selectedPatch.bodyHtml) {
      setDetailError(null)
      return
    }

    let cancelled = false
    void (async () => {
      setDetailLoading(true)
      setDetailError(null)
      try {
        const detail = await fetchPatchNote(selectedPatch.url)
        if (cancelled) return
        setPatchNotes((prev) =>
          prev.map((note) => (note.id === detail.id ? { ...note, ...detail } : note)),
        )
      } catch (e) {
        if (!cancelled) {
          setDetailError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedPatch?.id, selectedPatch?.url, selectedPatch?.bodyHtml])

  const openExternal = (url: string) => {
    void window.odysseyCompanion?.openExternal?.(url)
  }

  return (
    <main className="main main--home">
      <div className="home-shell">
        <section className="home-teaser" aria-label="Latest teaser">
          {teaserLoading ? (
            <p className="muted home-teaser__status">Loading teaser…</p>
          ) : teaserError ? (
            <div className="home-teaser__error">
              <div className="banner error">{teaserError}</div>
              <button type="button" className="btn ghost" onClick={() => void loadTeaser()}>
                Retry
              </button>
            </div>
          ) : teaser ? (
            <>
              {!imgFailed ? (
                <button
                  type="button"
                  className="home-teaser__img-btn"
                  title="Open teaser thread"
                  onClick={() => openExternal(teaser.readMoreUrl)}
                >
                  <img
                    className="home-teaser__img"
                    src={teaser.imageUrl}
                    alt="Latest Digital Odyssey teaser"
                    decoding="async"
                    onError={() => setImgFailed(true)}
                  />
                </button>
              ) : (
                <div className="banner error">Teaser image failed to load.</div>
              )}
              <button
                type="button"
                className="btn primary home-teaser__read-more"
                onClick={() => openExternal(teaser.readMoreUrl)}
              >
                Read more
              </button>
            </>
          ) : null}
        </section>

        <section className="home-notes" aria-label="Patch notes list">
          <header className="home-notes__head">
            <h2 className="home-notes__title">Patch notes</h2>
            <button
              type="button"
              className="btn ghost home-notes__view-all"
              onClick={() => openExternal(PATCH_NOTES_URL)}
            >
              View all
            </button>
          </header>

          {patchLoading ? (
            <p className="muted home-notes__status">Loading patch notes…</p>
          ) : patchError ? (
            <div className="home-notes__error">
              <p className="hint error">{patchError}</p>
              <button type="button" className="btn ghost" onClick={() => void loadPatchNotes()}>
                Retry
              </button>
            </div>
          ) : patchNotes.length === 0 ? (
            <p className="muted home-notes__status">No patch notes available.</p>
          ) : (
            <div className="home-notes__list" role="listbox" aria-label="Recent patches">
              {patchNotes.map((note) => {
                const { date, label } = patchNoteDisplayParts(note.title)
                const kind = patchNoteKind(note.title)
                const active = note.id === selectedPatch?.id
                return (
                  <button
                    key={note.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`home-notes__item${active ? ' home-notes__item--active' : ''}`}
                    onClick={() => setSelectedPatchId(note.id)}
                  >
                    <span className="home-notes__item-meta">
                      <span className={`home-notes__tag home-notes__tag--${kind.toLowerCase()}`}>{kind}</span>
                      <span className="home-notes__date">{date ?? '—'}</span>
                    </span>
                    <span className="home-notes__label">{label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <article className="home-notes__reader" aria-label="Selected patch note">
          {patchLoading ? (
            <p className="muted home-notes__reader-empty">Select a patch note above.</p>
          ) : selectedPatch ? (
            <>
              <h3 className="home-notes__reader-title">{selectedPatch.title}</h3>
              {detailLoading ? (
                <p className="muted">Loading note…</p>
              ) : detailError ? (
                <div className="home-notes__error">
                  <p className="hint error">{detailError}</p>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setPatchNotes((prev) =>
                        prev.map((note) =>
                          note.id === selectedPatch.id ? { ...note, bodyHtml: '' } : note,
                        ),
                      )
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : selectedPatch.bodyHtml ? (
                <div
                  className="home-notes__reader-body"
                  dangerouslySetInnerHTML={{ __html: selectedPatch.bodyHtml }}
                />
              ) : (
                <p className="muted">No content for this note.</p>
              )}
            </>
          ) : (
            <p className="muted home-notes__reader-empty">No patch notes available.</p>
          )}
        </article>
      </div>
    </main>
  )
}
