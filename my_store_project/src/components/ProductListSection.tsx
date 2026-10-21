import type { ChangeEvent } from 'react'
import type { Product, SortKey } from '../types'
import ProductCard from './ProductCard'
import { ChevronDownIcon, CloseIcon, SearchIcon } from './Icons'
import { SORT_OPTIONS } from '../utils/productFilters'
import styles from './ProductListSection.module.css'

export interface ProductListSectionProps {
  products: Product[]
  /** 未筛选时的商品总数，用于展示“12 / 15 件” */
  totalCount: number
  keyword: string
  activeCategoryName: string | null
  sortBy: SortKey
  onlyInStock: boolean
  onSortChange: (sortBy: SortKey) => void
  onToggleInStock: () => void
  onClearFilters: () => void
  favoriteIds: ReadonlySet<number>
  onToggleFavorite: (productId: number) => void
  onAddToCart: (product: Product) => void
  /** 正在请求列表（切换分类时会短暂为 true） */
  loading?: boolean
  /** 请求失败时的可读提示 */
  error?: string | null
  /** 失败后的重试入口 */
  onRetry?: () => void
}

/**
 * 商品列表区域（首页）
 * 顶部提供排序与“只看有货”筛选，下方是 ProductCard 组成的网格；
 * 无匹配结果时展示空状态，避免出现空白页。
 * 列表数据由首页从 /api/products 拉取，这里只负责展示加载 / 失败 / 空三种状态。
 */
export default function ProductListSection({
  products,
  totalCount,
  keyword,
  activeCategoryName,
  sortBy,
  onlyInStock,
  onSortChange,
  onToggleInStock,
  onClearFilters,
  favoriteIds,
  onToggleFavorite,
  onAddToCart,
  loading = false,
  error = null,
  onRetry,
}: ProductListSectionProps) {
  const hasFilter = keyword.length > 0 || activeCategoryName !== null || onlyInStock

  const handleSortChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onSortChange(event.target.value as SortKey)
  }

  return (
    <section className={styles.section} aria-labelledby="product-list-title">
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>All Products</p>
          <div className={styles.titleRow}>
            <h2 id="product-list-title" className={styles.title}>
              全部商品
            </h2>
            <span className={styles.count}>
              {products.length}
              {hasFilter ? ` / ${totalCount}` : ''} 件
            </span>
          </div>
        </div>

        <div className={styles.tools}>
          <label className={styles.switch}>
            <input type="checkbox" checked={onlyInStock} onChange={onToggleInStock} />
            <span className={styles.track} aria-hidden="true" />
            只看有货
          </label>

          <div className={styles.sort}>
            <select aria-label="商品排序方式" value={sortBy} onChange={handleSortChange}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={14} className={styles.chevron} />
          </div>
        </div>
      </header>

      {hasFilter && (
        <div className={styles.filters}>
          <span className={styles.filtersLabel}>当前筛选</span>
          {activeCategoryName !== null && (
            <span className={styles.filterTag}>{activeCategoryName}</span>
          )}
          {keyword.length > 0 && <span className={styles.filterTag}>“{keyword}”</span>}
          {onlyInStock && <span className={styles.filterTag}>仅有货</span>}
          <button type="button" className={styles.clearFilters} onClick={onClearFilters}>
            <CloseIcon size={12} />
            清除全部
          </button>
        </div>
      )}

      {loading && products.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <SearchIcon size={22} />
          </span>
          <h3>正在加载商品…</h3>
          <p>正在从服务器获取这个分类下的商品</p>
        </div>
      ) : error !== null ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <CloseIcon size={22} />
          </span>
          <h3>商品加载失败</h3>
          <p>{error}</p>
          {onRetry && (
            <button type="button" className={styles.emptyAction} onClick={onRetry}>
              重试
            </button>
          )}
        </div>
      ) : products.length > 0 ? (
        <>
          <div className={styles.grid}>
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                liked={favoriteIds.has(product.id)}
                onToggleFavorite={onToggleFavorite}
                onAddToCart={onAddToCart}
              />
            ))}
          </div>
          <p className={styles.end}>— 已经到底啦，共 {products.length} 件好物 —</p>
        </>
      ) : (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <SearchIcon size={22} />
          </span>
          <h3>没有找到匹配的商品</h3>
          <p>换个关键词试试，或看看其他分类～</p>
          <button type="button" className={styles.emptyAction} onClick={onClearFilters}>
            清除筛选条件
          </button>
        </div>
      )}
    </section>
  )
}
