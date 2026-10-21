import { Link } from 'react-router-dom'
import ProductThumb from './ProductThumb'
import { PlusIcon } from './Icons'
import { formatPrice } from '../utils/format'
import { productPath } from '../router/paths'
import type { ProductSearchItemVO } from '../types/search'
import styles from './SearchProductCard.module.css'

/** 库存低于该值时提示「仅剩 N 件」 */
const LOW_STOCK_THRESHOLD = 20

export interface SearchProductCardProps {
  item: ProductSearchItemVO
  /** 正在加购时禁用按钮 */
  adding?: boolean
  onAddToCart: (item: ProductSearchItemVO) => void
}

/**
 * 搜索结果商品卡片
 * ----------------------------------------------------------------------------
 * 和首页 ProductCard 的区别：数据来自 /api/search（只有列表需要的字段），
 * 所以单独做一个轻量卡片，不去凑 Product 的 mock 字段。
 * 图片和标题都能点进详情页，右下角是快捷加购。
 */
export default function SearchProductCard({
  item,
  adding = false,
  onAddToCart,
}: SearchProductCardProps) {
  const soldOut = item.stock <= 0
  const lowStock = !soldOut && item.stock <= LOW_STOCK_THRESHOLD

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <Link
          className={styles.mediaLink}
          to={productPath(item.id)}
          aria-label={`查看 ${item.title} 详情`}
        >
          <ProductThumb src={item.coverImage} alt={item.title} seed={item.id} />
        </Link>

        {soldOut && <span className={styles.soldOut}>已售罄</span>}
        {lowStock && <span className={styles.badge}>仅剩 {item.stock} 件</span>}
      </div>

      <div className={styles.body}>
        <h3 className={styles.title}>
          <Link className={styles.titleLink} to={productPath(item.id)}>
            {item.title}
          </Link>
        </h3>

        <p className={styles.seller}>{item.sellerName}</p>

        <div className={styles.bottom}>
          <p className={styles.price}>
            <em>¥</em>
            {formatPrice(item.price)}
          </p>
          <button
            type="button"
            className={styles.add}
            disabled={soldOut || adding}
            onClick={() => onAddToCart(item)}
            aria-label={soldOut ? `${item.title} 已售罄` : `将 ${item.title} 加入购物车`}
          >
            <PlusIcon size={16} />
          </button>
        </div>
      </div>
    </article>
  )
}
