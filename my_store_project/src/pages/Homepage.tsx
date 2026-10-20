import { useCallback, useEffect, useMemo, useState } from 'react'
import SearchNavBar from '../components/SearchNavBar'
import RecommendSection from '../components/RecommendSection'
import ProductListSection from '../components/ProductListSection'
import BottomNavBar from '../components/BottomNavBar'
import { CATEGORIES, PRODUCTS } from '../utils/mockData'
import { ALL_CATEGORY_ID, applyProductFilters, pickRecommended } from '../utils/productFilters'
import { useCartStore, selectTotalQuantity } from '../stores/cartStore'
import { ApiError } from '../api/client'
import { useTheme } from '../utils/useTheme'
import type { Product, SortKey, ToastMessage } from '../types'
import styles from './Homepage.module.css'

/** 推荐位一次展示的商品数量 */
const RECOMMEND_LIMIT = 4
/** 提示浮层自动消失时间（毫秒） */
const TOAST_DURATION = 2200
/** 默认排序方式 */
const DEFAULT_SORT: SortKey = 'default'

/**
 * 首页
 * ----------------------------------------------------------------------------
 * 负责整体布局与页面级状态（主题、筛选、排序、收藏、购物车数量），
 * 具体的界面元素拆分在 src/components 下：
 *   SearchNavBar       顶部搜索导航栏（分类 + 搜索入口 + 日夜切换）
 *   RecommendSection   商品推荐区域（由 RecommendCard 组成）
 *   ProductListSection 商品列表（由 ProductCard 组成）
 *   BottomNavBar       底部导航栏
 */
export default function Homepage() {
  const { theme, toggleTheme } = useTheme()

  // 购物车（Zustand + 后端接口）：角标订阅服务端汇总的件数
  const addToCart = useCartStore((state) => state.addItem)
  const fetchCart = useCartStore((state) => state.fetchCart)
  const cartTotalQuantity = useCartStore(selectTotalQuantity)

  // 进入首页时拉一次购物车，用于底部角标（失败也不阻塞首页）
  useEffect(() => {
    void fetchCart()
  }, [fetchCart])

  // 顶部导航栏
  const [keyword, setKeyword] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<number>(ALL_CATEGORY_ID)

  // 商品列表
  const [sortBy, setSortBy] = useState<SortKey>(DEFAULT_SORT)
  const [onlyInStock, setOnlyInStock] = useState(false)

  // 交互状态
  const [favoriteIds, setFavoriteIds] = useState<ReadonlySet<number>>(() => new Set([3, 5]))
  const [recommendOffset, setRecommendOffset] = useState(0)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const visibleProducts = useMemo<Product[]>(
    () =>
      applyProductFilters(PRODUCTS, {
        keyword,
        categoryId: activeCategoryId,
        sortBy,
        onlyInStock,
      }),
    [keyword, activeCategoryId, sortBy, onlyInStock],
  )

  // 推荐位不受搜索/筛选影响，避免筛选结果为空时整块区域一起消失
  const recommendedProducts = useMemo<Product[]>(
    () => pickRecommended(PRODUCTS, { limit: RECOMMEND_LIMIT, offset: recommendOffset }),
    [recommendOffset],
  )

  const activeCategoryName =
    activeCategoryId === ALL_CATEGORY_ID
      ? null
      : (CATEGORIES.find((category) => category.id === activeCategoryId)?.name ?? null)

  const handleToggleFavorite = useCallback((productId: number) => {
    setFavoriteIds((current) => {
      const next = new Set(current)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }, [])

  // 加购走真实接口：成功/失败都用同一处 toast 反馈（例如库存不足时显示后端文案）
  const handleAddToCart = useCallback(
    (product: Product) => {
      void (async () => {
        try {
          await addToCart(product.id)
          setToast({ id: Date.now(), text: `「${product.title}」已加入购物车` })
        } catch (error) {
          setToast({
            id: Date.now(),
            text: error instanceof ApiError ? error.message : '加入购物车失败，请稍后重试',
          })
        }
      })()
    },
    [addToCart],
  )

  const handleClearFilters = useCallback(() => {
    setKeyword('')
    setActiveCategoryId(ALL_CATEGORY_ID)
    setOnlyInStock(false)
    setSortBy(DEFAULT_SORT)
  }, [])

  const handleRefreshRecommend = useCallback(() => {
    setRecommendOffset((current) => current + RECOMMEND_LIMIT)
  }, [])

  // 提示浮层自动消失
  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), TOAST_DURATION)
    return () => window.clearTimeout(timer)
  }, [toast])

  return (
    <div className={styles.page} id="top">
      <SearchNavBar
        categories={CATEGORIES}
        activeCategoryId={activeCategoryId}
        onCategoryChange={setActiveCategoryId}
        keyword={keyword}
        onKeywordChange={setKeyword}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className={styles.main}>
        <section className={styles.intro} aria-label="手帐集市简介">
          <p className={styles.introEyebrow}>Online Journal Market</p>
          <h1 className={styles.introTitle}>把日子，贴进手帐里</h1>
          <p className={styles.introText}>
            手帐本 · 贴纸 · 胶带 · 印章 · 素材包，一站式淘齐记录灵感的小物。
            按分类逛，或直接搜索关键词，喜欢的先放进购物车。
          </p>
          <ul className={styles.stats}>
            <li>
              <strong>1500+</strong>
              <span>手作卖家</span>
            </li>
            <li>
              <strong>24</strong>
              <span>今日上新</span>
            </li>
            <li>
              <strong>99</strong>
              <span>元起包邮</span>
            </li>
          </ul>
        </section>

        <RecommendSection
          products={recommendedProducts}
          onRefresh={handleRefreshRecommend}
          favoriteIds={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
          onAddToCart={handleAddToCart}
        />

        <ProductListSection
          products={visibleProducts}
          totalCount={PRODUCTS.length}
          keyword={keyword}
          activeCategoryName={activeCategoryName}
          sortBy={sortBy}
          onlyInStock={onlyInStock}
          onSortChange={setSortBy}
          onToggleInStock={() => setOnlyInStock((current) => !current)}
          onClearFilters={handleClearFilters}
          favoriteIds={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
          onAddToCart={handleAddToCart}
        />

        <footer className={styles.footer}>
          <p className={styles.footerBrand}>手帐集市 · Journal Bazaar</p>
          <p className={styles.footerNote}>
            当前为开发阶段演示数据，正式商品数据将由 Spring Boot 接口提供
          </p>
        </footer>
      </main>

      <BottomNavBar cartCount={cartTotalQuantity} />

      <div
        className={toast ? `${styles.toast} ${styles.toastVisible}` : styles.toast}
        role="status"
        aria-live="polite"
      >
        {toast?.text}
      </div>
    </div>
  )
}
