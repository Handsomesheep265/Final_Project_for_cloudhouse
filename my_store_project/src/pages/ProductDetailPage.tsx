import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BottomNavBar from '../components/BottomNavBar'
import PageHeader from '../components/PageHeader'
import ProductThumb from '../components/ProductThumb'
import { CartIcon, HeartIcon, StarIcon } from '../components/Icons'
import { ApiError } from '../api/client'
import { productApi } from '../api/product'
import { selectTotalQuantity, useCartStore } from '../stores/cartStore'
import { selectFavoriteIds, useFavoritesStore } from '../stores/favoritesStore'
import type { ProductDetailVO, RelatedProductVO } from '../types/product'
import { formatPrice } from '../utils/format'
import { resolveImageUrl } from '../utils/assetUrl'
import { ROUTES, productPath } from '../router/paths'
import styles from './ProductDetailPage.module.css'

/** 提示浮层停留时间 */
const NOTE_DURATION = 2600
/** 相关推荐条数 */
const RELATED_LIMIT = 6
/** 库存低于该值时提示「仅剩 N 件」 */
const LOW_STOCK_THRESHOLD = 20

type LoadStatus = 'loading' | 'ready' | 'error'

function toMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

/**
 * 商品详情页（/products/:productId）
 * ----------------------------------------------------------------------------
 * 数据来自 GET /api/products/:productId + /related：
 *   - 轮播图（横向 scroll-snap，移动端可直接滑，圆点与计数器同步）；
 *   - 标题 / 价格 / 库存 / 评价 / 收藏数；
 *   - 卖家卡（头像 + 昵称 + 简介）；
 *   - 商品描述；
 *   - 相关推荐（点进去会加载另一件商品）。
 *
 * 收藏与加购都复用已有 store：
 *   useFavoritesStore.toggle()  —— 与首页爱心、个人主页收藏共用一份状态；
 *   useCartStore.addItem()      —— 加完立刻更新底部导航角标。
 *
 * 下架/售罄的商品照样能打开（用户点进来要看原因），只是加购按钮禁用。
 */
export default function ProductDetailPage() {
  const { productId = '' } = useParams()
  const id = Number(productId)

  const addItem = useCartStore((state) => state.addItem)
  const fetchCart = useCartStore((state) => state.fetchCart)
  const cartCount = useCartStore(selectTotalQuantity)

  const favoriteIds = useFavoritesStore(selectFavoriteIds)
  const toggleFavorite = useFavoritesStore((state) => state.toggle)
  const refreshFavorites = useFavoritesStore((state) => state.refresh)

  const [detail, setDetail] = useState<ProductDetailVO | null>(null)
  const [related, setRelated] = useState<RelatedProductVO[]>([])
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [activeIndex, setActiveIndex] = useState(0)
  const [favoriteCount, setFavoriteCount] = useState(0)
  const [adding, setAdding] = useState(false)
  const [sellerAvatarFailed, setSellerAvatarFailed] = useState(false)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)

  const galleryRef = useRef<HTMLDivElement | null>(null)

  /**
   * 拉详情 + 相关推荐。
   * setState 都放在 await 之后（effect 里同步 setState 会触发级联渲染）。
   */
  const load = useCallback(async () => {
    if (!Number.isInteger(id) || id <= 0) {
      setLoadError('商品不存在或已删除')
      setLoadStatus('error')
      return
    }

    try {
      const [product, relatedList] = await Promise.all([
        productApi.getDetail(id),
        productApi.getRelated(id, RELATED_LIMIT),
      ])

      setDetail(product)
      setRelated(relatedList.list)
      setFavoriteCount(product.favoriteCount)
      setActiveIndex(0)
      setSellerAvatarFailed(false)
      setLoadStatus('ready')

      // 从「相关推荐」跳到另一件商品时，把轮播与页面都回到顶部
      galleryRef.current?.scrollTo({ left: 0 })
      window.scrollTo({ top: 0 })
    } catch (error) {
      setLoadError(toMessage(error, '商品加载失败，请稍后重试'))
      setLoadStatus('error')
    }
  }, [id])

  useEffect(() => {
    // 数据拉取型 effect：按路由参数请求商品详情并写入状态；setState 都在 await 之后
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  // 收藏状态与首页/个人主页共用；购物车角标也顺手刷新一次
  useEffect(() => {
    void refreshFavorites()
  }, [refreshFavorites])

  useEffect(() => {
    void fetchCart()
  }, [fetchCart])

  useEffect(() => {
    if (!note) return undefined
    const timer = window.setTimeout(() => setNote(null), NOTE_DURATION)
    return () => window.clearTimeout(timer)
  }, [note])

  /** 轮播：滚动结束后按「滚动距离 / 一屏宽度」四舍五入得到当前页 */
  const handleGalleryScroll = useCallback(() => {
    const el = galleryRef.current
    if (!el || el.clientWidth <= 0) return

    const index = Math.round(el.scrollLeft / el.clientWidth)
    setActiveIndex((current) => (current === index ? current : index))
  }, [])

  const scrollToSlide = useCallback((index: number) => {
    const el = galleryRef.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
  }, [])

  const handleToggleFavorite = useCallback(async () => {
    if (!detail) return

    try {
      const favorited = await toggleFavorite(detail.id)
      setFavoriteCount((current) => Math.max(0, current + (favorited ? 1 : -1)))
      setNote({ text: favorited ? '已加入收藏' : '已取消收藏', tone: 'info' })
    } catch (error) {
      setNote({ text: toMessage(error, '操作失败，请稍后重试'), tone: 'error' })
    }
  }, [detail, toggleFavorite])

  const handleAddToCart = useCallback(async () => {
    if (!detail) return

    setAdding(true)
    try {
      await addItem(detail.id)
      setNote({ text: `「${detail.title}」已加入购物车`, tone: 'info' })
    } catch (error) {
      setNote({ text: toMessage(error, '加入购物车失败，请稍后重试'), tone: 'error' })
    } finally {
      setAdding(false)
    }
  }, [addItem, detail])

  const offShelf = detail ? detail.status !== 1 : false
  const soldOut = detail ? detail.stock <= 0 : false
  const canBuy = detail !== null && !offShelf && !soldOut
  const isFavorite = detail ? favoriteIds.has(detail.id) : false

  // 没图时也保留一张占位，轮播结构不变
  const slides = detail && detail.images.length > 0 ? detail.images : [null]

  const badge = detail
    ? offShelf
      ? '已下架'
      : soldOut
        ? '已售罄'
        : detail.stock <= LOW_STOCK_THRESHOLD
          ? `仅剩 ${detail.stock} 件`
          : null
    : null

  const sellerAvatarUrl = resolveImageUrl(detail?.seller.avatarUrl ?? null)
  const showSellerAvatar = Boolean(sellerAvatarUrl) && !sellerAvatarFailed

  return (
    <div className={styles.page}>
      <PageHeader
        title="商品详情"
        to={ROUTES.home}
        backLabel="返回首页"
        titleAs="h2"
        right={
          <Link className={styles.cartLink} to={ROUTES.cart} aria-label="去购物车">
            <CartIcon size={17} />
            {cartCount > 0 && (
              <span className={styles.cartBadge}>{cartCount > 99 ? '99+' : cartCount}</span>
            )}
          </Link>
        }
      />

      <main className={styles.main}>
        {loadStatus === 'loading' && (
          <div className={styles.placeholder}>
            <span className={styles.placeholderIcon}>
              <CartIcon size={26} />
            </span>
            <h2 className={styles.placeholderTitle}>正在加载商品…</h2>
            <p className={styles.placeholderText}>正在获取商品信息与相关推荐</p>
          </div>
        )}

        {loadStatus === 'error' && (
          <div className={styles.placeholder}>
            <span className={styles.placeholderIcon}>
              <CartIcon size={26} />
            </span>
            <h2 className={styles.placeholderTitle}>商品加载失败</h2>
            <p className={styles.placeholderText}>{loadError ?? '请稍后重试'}</p>
            <div className={styles.placeholderActions}>
              <button type="button" className={styles.action} onClick={() => void load()}>
                重试
              </button>
              <Link className={styles.actionGhost} to={ROUTES.home}>
                去首页逛逛
              </Link>
            </div>
          </div>
        )}

        {detail && loadStatus === 'ready' && (
          <>
            {/* 轮播图 */}
            <section className={styles.galleryCard} aria-label="商品图片">
              <div className={styles.gallery} ref={galleryRef} onScroll={handleGalleryScroll}>
                {slides.map((image, index) => (
                  <div className={styles.slide} key={image?.id ?? `placeholder-${index}`}>
                    <ProductThumb
                      src={image?.url ?? null}
                      alt={`${detail.title} 图片 ${index + 1}`}
                      seed={detail.id}
                      priority={index === 0}
                    />
                  </div>
                ))}
              </div>

              {badge !== null && <span className={styles.galleryBadge}>{badge}</span>}

              {slides.length > 1 && (
                <>
                  <span className={styles.galleryCounter}>
                    {activeIndex + 1} / {slides.length}
                  </span>
                  <div className={styles.dots} role="tablist" aria-label="切换商品图片">
                    {slides.map((image, index) => (
                      <button
                        key={image?.id ?? `dot-${index}`}
                        type="button"
                        role="tab"
                        aria-selected={activeIndex === index}
                        aria-label={`第 ${index + 1} 张`}
                        className={
                          activeIndex === index ? `${styles.dot} ${styles.dotActive}` : styles.dot
                        }
                        onClick={() => scrollToSlide(index)}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* 标题 / 价格 / 库存 */}
            <section className={styles.summary}>
              <div className={styles.titleRow}>
                <h1 className={styles.title}>{detail.title}</h1>
                <span
                  className={
                    offShelf ? `${styles.status} ${styles.statusOff}` : styles.status
                  }
                >
                  {detail.statusText}
                </span>
              </div>

              <div className={styles.priceRow}>
                <p className={styles.price}>
                  <em>¥</em>
                  {formatPrice(detail.price)}
                </p>
                <p className={soldOut ? `${styles.stock} ${styles.stockEmpty}` : styles.stock}>
                  {soldOut ? '已售罄' : `库存 ${detail.stock} 件`}
                </p>
              </div>

              <div className={styles.metaRow}>
                <span className={styles.rating}>
                  <StarIcon size={12} />
                  {detail.reviews.count > 0
                    ? `${detail.reviews.average.toFixed(1)} 分 · ${detail.reviews.count} 条评价`
                    : '暂无评价'}
                </span>
                <span className={styles.metaDot} aria-hidden="true">
                  ·
                </span>
                <span className={styles.metaItem}>{favoriteCount} 人收藏</span>
                {detail.cartQuantity > 0 && (
                  <>
                    <span className={styles.metaDot} aria-hidden="true">
                      ·
                    </span>
                    <span className={styles.metaItem}>购物车已有 {detail.cartQuantity} 件</span>
                  </>
                )}
              </div>

              <p className={styles.category}>
                分类：
                <span>{detail.category.name}</span>
              </p>
            </section>

            {/* 卖家 */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>卖家</h2>
              <div className={styles.seller}>
                <div className={styles.sellerAvatar}>
                  {showSellerAvatar ? (
                    <img
                      className={styles.sellerAvatarImage}
                      src={sellerAvatarUrl ?? undefined}
                      alt=""
                      onError={() => setSellerAvatarFailed(true)}
                    />
                  ) : (
                    <span className={styles.sellerInitial} aria-hidden="true">
                      {detail.seller.nickname.slice(0, 1) || '手'}
                    </span>
                  )}
                </div>
                <div className={styles.sellerInfo}>
                  <p className={styles.sellerName}>{detail.seller.nickname}</p>
                  <p className={styles.sellerBio}>
                    {detail.seller.bio ?? '这位手作人还没有填写简介'}
                  </p>
                </div>
              </div>
            </section>

            {/* 描述 */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>商品描述</h2>
              <p className={styles.description}>
                {detail.description ?? '卖家还没有填写商品描述。'}
              </p>
            </section>

            {/* 相关推荐 */}
            {related.length > 0 && (
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>相关推荐</h2>
                  <span className={styles.cardHint}>同类 · {detail.category.name}</span>
                </div>

                <ul className={styles.related}>
                  {related.map((item) => (
                    <li key={item.id}>
                      <Link className={styles.relatedLink} to={productPath(item.id)}>
                        <div className={styles.relatedThumb}>
                          <ProductThumb
                            src={item.coverImage}
                            alt={item.title}
                            seed={item.id}
                            compact
                          />
                        </div>
                        <p className={styles.relatedTitle}>{item.title}</p>
                        <p className={styles.relatedPrice}>¥{formatPrice(item.price)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {note && (
              <p className={note.tone === 'error' ? styles.noteError : styles.note} role="status">
                {note.text}
              </p>
            )}
          </>
        )}
      </main>

      {detail && loadStatus === 'ready' && (
        <div className={styles.bar}>
          <button
            type="button"
            className={isFavorite ? `${styles.favBtn} ${styles.favBtnActive}` : styles.favBtn}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? '取消收藏' : '收藏商品'}
            onClick={() => void handleToggleFavorite()}
          >
            <HeartIcon size={18} filled={isFavorite} />
            <span>{isFavorite ? '已收藏' : '收藏'}</span>
          </button>

          <button
            type="button"
            className={styles.addBtn}
            disabled={!canBuy || adding}
            onClick={() => void handleAddToCart()}
          >
            {offShelf ? '已下架' : soldOut ? '已售罄' : adding ? '加入中…' : '加入购物车'}
          </button>
        </div>
      )}

      <BottomNavBar cartCount={cartCount} />
    </div>
  )
}
