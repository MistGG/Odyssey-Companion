import type { DigimonCardInstance } from './digimonCards'
import { digimonCardDisplayLabel } from './digimonCards'

const ATTRIBUTE_SRC = import.meta.glob<string>('../assets/cards/attributes/*.png', {
  eager: true,
  import: 'default',
})

const RARITY_SRC = import.meta.glob<string>('../assets/cards/rarity/*.png', {
  eager: true,
  import: 'default',
})

function assetUrl(
  map: Record<string, string>,
  folder: 'attributes' | 'rarity',
  fileName: string,
): string | undefined {
  return map[`../assets/cards/${folder}/${fileName}`]
}

const ATTRIBUTE_FILES: Record<string, string> = {
  Vaccine: 'vaccine.png',
  Data: 'data.png',
  Virus: 'virus.png',
}

export function digimonCardAttributeIconUrl(attribute: string): string | undefined {
  const file = ATTRIBUTE_FILES[attribute] ?? 'unknown.png'
  return assetUrl(ATTRIBUTE_SRC, 'attributes', file) ?? assetUrl(ATTRIBUTE_SRC, 'attributes', 'none.png')
}

/** Badge image for grade + optional plus finish (A, A+, S, …). */
export function digimonCardRarityIconUrl(card: DigimonCardInstance): string | undefined {
  const label = digimonCardDisplayLabel(card)
  return assetUrl(RARITY_SRC, 'rarity', `${label}.png`)
}
