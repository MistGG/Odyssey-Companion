import type { PatchNoteEntry } from './patchNotes'

export async function fetchPatchNotes(): Promise<PatchNoteEntry[]> {
  const api = window.odysseyCompanion
  if (!api?.fetchPatchNotes) {
    throw new Error('Patch notes fetch is only available in the companion app')
  }
  return api.fetchPatchNotes()
}

export async function fetchPatchNote(url: string): Promise<PatchNoteEntry> {
  const api = window.odysseyCompanion
  if (!api?.fetchPatchNote) {
    throw new Error('Patch note fetch is only available in the companion app')
  }
  return api.fetchPatchNote(url)
}
