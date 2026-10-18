import type { Product } from '../types'
import RecommendCard from './RecommendCard'
import { RefreshIcon, SparklesIcon } from './Icons'
import styles from './RecommendSection.module.css'

export interface RecommendSectionProps {
  products: Product[]
  onRefresh: () => void
  favoriteIds: ReadonlySet<number>
  onToggleFavorite: (productId: number) => void
  onAddToCart: (product: Product) => void
}

/**
 * 商品推荐区域（首页）
 * 由 RecommendCard 组成，“换一批”会轮换推荐位。
 */
export default function RecommendSection({
  products,
  onRefresh,
  favoriteIds,
  onToggleFavorite,
  onAddToCart,
}: RecommendSectionProps) {
  return (
    <section className={styles.section} aria-labelledby="recommend-title">
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>
            <SparklesIcon size={13} />
            Editor&apos;s Pick
          </p>
          <div className={styles.titleRow}>
            <h2 id="recommend-title" className={styles.title}>
              本周推荐
            </h2>
            <span className={styles.count}>{products.length} 件</span>
          </div>
          <p className={styles.subtitle}>编辑部挑出的手帐好物，灵感从这里开始</p>
        </div>

        <button type="button" className={styles.refresh} onClick={onRefresh}>
          <RefreshIcon size={15} />
          换一批
        </button>
      </header>

      {products.length > 0 ? (
        <div className={styles.grid}>
          {products.map((product, index) => (
            <RecommendCard
              key={product.id}
              product={product}
              featured={index === 0}
              liked={favoriteIds.has(product.id)}
              onToggleFavorite={onToggleFavorite}
              onAddToCart={onAddToCart}
            />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>暂无推荐，敬请期待～</p>
      )}
    </section>
  )
}
