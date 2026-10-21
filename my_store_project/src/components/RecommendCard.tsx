import { Link } from 'react-router-dom'
import type { Product } from '../types'
import ProductThumb from './ProductThumb'
import SellerBadge from './SellerBadge'
import { HeartIcon, StarIcon } from './Icons'
import { formatPrice } from '../utils/format'
import { productPath } from '../router/paths'
import styles from './RecommendCard.module.css'

export interface RecommendCardProps {
  product: Product
  /** 首张卡片标记为“本周主推” */
  featured?: boolean
  liked?: boolean
  onToggleFavorite: (productId: number) => void
  onAddToCart: (product: Product) => void
}

/**
 * 推荐商品卡片（首页“商品推荐区域”使用）
 * 比商品列表卡片更大、信息更完整，首张带“本周主推”标记。
 */
export default function RecommendCard({
  product,
  featured = false,
  liked = false,
  onToggleFavorite,
  onAddToCart,
}: RecommendCardProps) {
  const isSoldOut = product.stock <= 0

  return (
    <article className={featured ? `${styles.card} ${styles.featured}` : styles.card}>
      <div className={styles.media}>
        <ProductThumb
          src={product.image}
          alt={product.title}
          seed={product.id}
          priority={featured}
        />

        {/* 覆盖图片的点击区：点图进商品详情，爱心按钮层级更高 */}
        <Link
          className={styles.mediaLink}
          to={productPath(product.id)}
          aria-label={`查看 ${product.title} 详情`}
        />

        <span
          className={featured ? `${styles.ribbon} ${styles.ribbonFeatured}` : styles.ribbon}
        >
          {featured ? '本周主推' : '编辑精选'}
        </span>
        <button
          type="button"
          className={liked ? `${styles.like} ${styles.likeActive}` : styles.like}
          onClick={() => onToggleFavorite(product.id)}
          aria-pressed={liked}
          aria-label={liked ? `取消喜欢 ${product.title}` : `喜欢 ${product.title}`}
        >
          <HeartIcon size={15} filled={liked} />
        </button>
      </div>

      <div className={styles.body}>
        <span className={styles.category}>{product.categoryName}</span>
        <h3 className={styles.title}>
          <Link className={styles.titleLink} to={productPath(product.id)}>
            {product.title}
          </Link>
        </h3>
        <p className={styles.desc}>{product.description}</p>

        <div className={styles.meta}>
          <SellerBadge name={product.sellerName} avatar={product.sellerAvatar} size="sm" />
          <span className={styles.rating}>
            <StarIcon size={12} />
            {product.rating.toFixed(1)}
          </span>
        </div>

        <div className={styles.footer}>
          <p className={styles.price}>
            <em>¥</em>
            {formatPrice(product.price)}
          </p>
          <button
            type="button"
            className={styles.add}
            onClick={() => onAddToCart(product)}
            disabled={isSoldOut}
          >
            {isSoldOut ? '已售罄' : '加入购物车'}
          </button>
        </div>
      </div>
    </article>
  )
}
