/**
 * 商品筛选 / 排序 / 推荐逻辑
 * 纯函数实现，方便后续接入接口后复用，也便于补充单元测试。
 */
import type { Product, ProductFilters, SortKey, SortOption } from '../types'

/** 前端聚合出来的“全部”分类 */
export const ALL_CATEGORY_ID = 0

export const SORT_OPTIONS: SortOption[] = [
  { value: 'default', label: '综合排序' },
  { value: 'sales', label: '销量优先' },
  { value: 'rating', label: '好评优先' },
  { value: 'price-asc', label: '价格从低到高' },
  { value: 'price-desc', label: '价格从高到低' },
]

type ProductComparator = (a: Product, b: Product) => number

const SORTERS: Record<SortKey, ProductComparator | null> = {
  default: null,
  sales: (a, b) => b.sales - a.sales,
  rating: (a, b) => b.rating - a.rating,
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
}

/** 按关键词、分类、库存过滤商品 */
export function filterProducts(
  products: Product[],
  { keyword = '', categoryId = ALL_CATEGORY_ID, onlyInStock = false }: ProductFilters = {},
): Product[] {
  const normalizedKeyword = keyword.trim().toLowerCase()

  return products.filter((product) => {
    if (categoryId !== ALL_CATEGORY_ID && product.categoryId !== categoryId) {
      return false
    }
    if (onlyInStock && product.stock <= 0) {
      return false
    }
    if (!normalizedKeyword) {
      return true
    }
    const searchable = [product.title, product.description, ...product.tags]
      .join(' ')
      .toLowerCase()
    return searchable.includes(normalizedKeyword)
  })
}

/** 复制后排序，不改动传入数组 */
export function sortProducts(products: Product[], sortBy: SortKey = 'default'): Product[] {
  const sorter = SORTERS[sortBy]
  return sorter ? [...products].sort(sorter) : [...products]
}

/** 过滤 + 排序一步到位 */
export function applyProductFilters(
  products: Product[],
  filters: ProductFilters = {},
): Product[] {
  return sortProducts(filterProducts(products, filters), filters.sortBy)
}

/** 取推荐商品；offset 用于“换一批”，超出长度时自动循环 */
export function pickRecommended(
  products: Product[],
  { limit = 4, offset = 0 }: { limit?: number; offset?: number } = {},
): Product[] {
  const recommended = products.filter((product) => product.isRecommended)
  if (recommended.length === 0) return []
  const start = ((offset % recommended.length) + recommended.length) % recommended.length
  const rotated = [...recommended.slice(start), ...recommended.slice(0, start)]
  return rotated.slice(0, limit)
}
