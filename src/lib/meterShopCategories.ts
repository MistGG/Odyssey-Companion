export type MeterShopCategoryId = 'bar-themes' | 'magia-bar-themes'

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

const OLYMPUS_SHOP_SUBCATEGORIES = (parentId: 'bar-themes'): MeterShopSubcategory[] => [
  { id: 'common', parentId, label: 'Common', available: true },
  { id: 'rare', parentId, label: 'Rare', available: true },
  { id: 'legendary', parentId, label: 'Legendary', available: true },
]

const MAGIA_SHOP_SUBCATEGORIES = (parentId: 'magia-bar-themes'): MeterShopSubcategory[] => [
  { id: 'rare', parentId, label: 'Rare', available: true },
  { id: 'legendary', parentId, label: 'Legendary', available: true },
]

export const METER_SHOP_CATEGORIES: MeterShopCategory[] = [
  {
    id: 'bar-themes',
    label: 'Olympus Bar Themes',
    available: true,
    subcategories: OLYMPUS_SHOP_SUBCATEGORIES('bar-themes'),
  },
  {
    id: 'magia-bar-themes',
    label: 'Magia Bar Themes',
    available: true,
    subcategories: MAGIA_SHOP_SUBCATEGORIES('magia-bar-themes'),
  },
]

export function meterShopCategoryById(id: string): MeterShopCategory | undefined {
  return METER_SHOP_CATEGORIES.find((c) => c.id === id)
}

export function meterShopSubcategoryById(
  categoryId: MeterShopCategoryId,
  subcategoryId: MeterShopSubcategoryId,
): MeterShopSubcategory | undefined {
  const category = meterShopCategoryById(categoryId)
  if (!category) return undefined
  return category.subcategories.find((s) => s.id === subcategoryId)
}
