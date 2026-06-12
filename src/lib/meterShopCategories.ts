export type MeterShopCategoryId = 'bar-themes'

export type MeterShopSubcategoryId = 'common' | 'rare' | 'legendary'

export type MeterShopSubcategory = {
  id: MeterShopSubcategoryId
  parentId: MeterShopCategoryId
  label: string
  available: boolean
}

export type MeterShopCategory = {
  id: MeterShopCategoryId
  label: string
  available: boolean
  subcategories: MeterShopSubcategory[]
}

export const METER_SHOP_CATEGORIES: MeterShopCategory[] = [
  {
    id: 'bar-themes',
    label: 'Bar Themes',
    available: true,
    subcategories: [
      { id: 'common', parentId: 'bar-themes', label: 'Common', available: true },
      { id: 'rare', parentId: 'bar-themes', label: 'Rare', available: true },
      { id: 'legendary', parentId: 'bar-themes', label: 'Legendary', available: true },
    ],
  },
]

export function meterShopSubcategoryById(
  subcategoryId: MeterShopSubcategoryId,
): MeterShopSubcategory | undefined {
  for (const category of METER_SHOP_CATEGORIES) {
    const sub = category.subcategories.find((s) => s.id === subcategoryId)
    if (sub) return sub
  }
  return undefined
}
