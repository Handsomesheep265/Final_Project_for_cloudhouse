import { Link } from 'react-router-dom'
import type { Product } from '../types'
import ProductThumb from './ProductThumb'
import SellerBadge from './SellerBadge'
import { HeartIcon, PlusIcon, StarIcon } from './Icons'
import { formatCount, formatPrice } from '../utils/format'
import { productPath } from '../router/paths'
import styles from './ProductCard.module.css'

/** 库存低于该值时提示“仅剩 N 件” */
const LOW_STOCK_THRESHOLD = 20

export interface ProductCardProps {
  product: Product
  liked?: boolean
  onToggleFavorite: (productId: number) => void
  onAddToCart: (product: Product) => void
}

/**
 * 商品列表卡片（首页“商品列表”使用）
 * 移动端两列、桌面端自适应多列，价格与购买按钮固定在卡片底部对齐。
 */
export default function ProductCard({
  product,
  liked = false,
  onToggleFavorite,
  onAddToCart,
}: ProductCardProps) {
  const isSoldOut = product.stock <= 0
  const isLowStock = !isSoldOut && product.stock <= LOW_STOCK_THRESHOLD
  const badge: string | undefined = isLowStock ? `仅剩 ${product.stock} 件` : product.tags[0]

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <ProductThumb src={product.image} alt={product.title} seed={product.id} />

        {/* 覆盖整张图的点击区，点图进商品详情；爱心/加购按钮用更高层级盖在它上面 */}
        <Link
          className={styles.mediaLink}
          to={productPath(product.id)}
          aria-label={`查看 ${product.title} 详情`}
        />

        {badge !== undefined && (
          <span className={isLowStock ? `${styles.badge} ${styles.badgeWarn}` : styles.badge}>
            {badge}
          </span>
        )}

        <button
          type="button"
          className={liked ? `${styles.like} ${styles.likeActive}` : styles.like}
          onClick={() => onToggleFavorite(product.id)}
          aria-pressed={liked}
          aria-label={liked ? `取消喜欢 ${product.title}` : `喜欢 ${product.title}`}
        >
          <HeartIcon size={14} filled={liked} />
        </button>

        {isSoldOut && <span className={styles.soldOut}>已售罄</span>}
      </div>

      <div className={styles.body}>
        <h3 className={styles.title}>
          <Link className={styles.titleLink} to={productPath(product.id)}>
            {product.title}
          </Link>
        </h3>
        <p className={styles.desc}>{product.description}</p>

        <div className={styles.meta}>
          <span className={styles.rating}>
            <StarIcon size={11} />
            {/* rating 来自 reviews 平均分，没有评价时显示「暂无评分」而不是 0.0 */}
            {product.rating > 0 ? product.rating.toFixed(1) : '暂无评分'}
          </span>
          <span className={styles.sales}>已售 {formatCount(product.sales)}</span>
        </div>

        <div className={styles.bottom}>
          <div className={styles.priceRow}>
            <p className={styles.price}>
              <em>¥</em>
              {formatPrice(product.price)}
            </p>
            <button
              type="button"
              className={styles.add}
              onClick={() => onAddToCart(product)}
              disabled={isSoldOut}
              aria-label={isSoldOut ? `${product.title} 已售罄` : `将 ${product.title} 加入购物车`}
            >
              <PlusIcon size={16} />
            </button>
          </div>

          <div className={styles.seller}>
            <SellerBadge name={product.sellerName} avatar={product.sellerAvatar} size="sm" />
          </div>
        </div>
      </div>
    </article>
  )
}
