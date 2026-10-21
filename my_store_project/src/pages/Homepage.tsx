import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SearchNavBar from '../components/SearchNavBar'
import RecommendSection from '../components/RecommendSection'
import ProductListSection from '../components/ProductListSection'
import BottomNavBar from '../components/BottomNavBar'
import { ALL_CATEGORY_ID, applyProductFilters, pickRecommended } from '../utils/productFilters'
import { toNavCategory, toProductCard } from '../utils/productAdapter'
import { useCartStore, selectTotalQuantity } from '../stores/cartStore'
import { selectFavoriteIds, useFavoritesStore } from '../stores/favoritesStore'
import { ApiError } from '../api/client'
import { categoryApi } from '../api/category'
import { productApi } from '../api/product'
import { useTheme } from '../utils/useTheme'
import { ROUTES } from '../router/paths'
import type { Category, Product, SortKey, ToastMessage } from '../types'
import styles from './Homepage.module.css'

/** 推荐位一次展示的商品数量 */
const RECOMMEND_LIMIT = 4
/** 推荐位候选池大小：够「换一批」轮换两轮 */
const RECOMMEND_POOL_SIZE = 8
/** 每个分类一次拉多少商品（当前数据量小，一次拉完；数据变多时再改成分页/加载更多） */
const PRODUCT_PAGE_SIZE = 50
/** 提示浮层自动消失时间（毫秒） */
const TOAST_DURATION = 2200
/** 默认排序方式 */
const DEFAULT_SORT: SortKey = 'default'

/** 导航栏第一项「全部」是前端聚合出来的，不落库 */
const ALL_CATEGORY: Category = { id: ALL_CATEGORY_ID, name: '全部', parentId: 0, sortOrder: 0 }

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
  const navigate = useNavigate()

  // 购物车（Zustand + 后端接口）：角标订阅服务端汇总的件数
  const addToCart = useCartStore((state) => state.addItem)
  const fetchCart = useCartStore((state) => state.fetchCart)
  const cartTotalQuantity = useCartStore(selectTotalQuantity)

  // 收藏（与个人主页共用同一份数据）：首页只关心「哪些商品已收藏」
  const favoriteIds = useFavoritesStore(selectFavoriteIds)
  const toggleFavorite = useFavoritesStore((state) => state.toggle)
  const refreshFavorites = useFavoritesStore((state) => state.refresh)

  // 进入首页时拉一次购物车，用于底部角标（失败也不阻塞首页）
  useEffect(() => {
    void fetchCart()
  }, [fetchCart])

  // 收藏同理：拉不到就当作全未收藏，爱心按未选中展示
  useEffect(() => {
    void refreshFavorites()
  }, [refreshFavorites])

  // 顶部导航栏
  const [keyword, setKeyword] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<number>(ALL_CATEGORY_ID)

  // 分类（接口驱动）与商品列表（接口驱动）
  const [categories, setCategories] = useState<Category[]>([ALL_CATEGORY])
  const [productTotal, setProductTotal] = useState(0)
  const [products, setProducts] = useState<Product[]>([])
  const [listStatus, setListStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [listError, setListError] = useState<string | null>(null)
  const [recommendPool, setRecommendPool] = useState<Product[]>([])
  /** 列表请求序号：切分类很快时，先发的旧响应回来会被丢弃 */
  const listToken = useRef(0)

  // 商品列表
  const [sortBy, setSortBy] = useState<SortKey>(DEFAULT_SORT)
  const [onlyInStock, setOnlyInStock] = useState(false)

  // 交互状态
  const [recommendOffset, setRecommendOffset] = useState(0)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  /** 拉分类：接口里的分类 + 前端聚合的「全部」 */
  const loadCategories = useCallback(async () => {
    try {
      const result = await categoryApi.list()
      setCategories([ALL_CATEGORY, ...result.list.map(toNavCategory)])
      setProductTotal(result.productTotal)
    } catch {
      // 分类拉不到就只留「全部」，商品列表仍可用
      setCategories([ALL_CATEGORY])
    }
  }, [])

  /**
   * 按分类拉商品；切换分类时重新请求，不刷新页面。
   * categoryId = 0（全部）时不传分类参数。
   */
  const loadProducts = useCallback(async (categoryId: number) => {
    const token = ++listToken.current
    setListStatus('loading')
    setListError(null)

    try {
      const result = await productApi.list({
        categoryId: categoryId === ALL_CATEGORY_ID ? undefined : categoryId,
        pageSize: PRODUCT_PAGE_SIZE,
      })
      if (token !== listToken.current) return

      setProducts(result.list.map(toProductCard))
      setListStatus('ready')
    } catch (error) {
      if (token !== listToken.current) return

      setListError(error instanceof ApiError ? error.message : '商品加载失败，请稍后重试')
      setListStatus('error')
    }
  }, [])

  /** 推荐位候选池：按销量取前 N 件，「换一批」在本地轮换，不再打接口 */
  const loadRecommendPool = useCallback(async () => {
    try {
      const result = await productApi.list({ sort: 'sales', pageSize: RECOMMEND_POOL_SIZE })
      setRecommendPool(result.list.map((item) => ({ ...toProductCard(item), isRecommended: true })))
    } catch {
      setRecommendPool([])
    }
  }, [])

  useEffect(() => {
    // 数据拉取型 effect：分类与推荐位只在进入首页时各拉一次
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCategories()
    void loadRecommendPool()
  }, [loadCategories, loadRecommendPool])

  useEffect(() => {
    // 分类变化 → 重新拉列表（无刷新换列表）；setState 都在 await 之后
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProducts(activeCategoryId)
  }, [activeCategoryId, loadProducts])

  // 在服务端已按分类筛选的结果上，继续做「关键词 / 只看有货 / 排序」的即时筛选
  const visibleProducts = useMemo<Product[]>(
    () =>
      applyProductFilters(products, {
        keyword,
        categoryId: activeCategoryId,
        sortBy,
        onlyInStock,
      }),
    [products, keyword, activeCategoryId, sortBy, onlyInStock],
  )

  // 推荐位不受搜索/筛选影响，避免筛选结果为空时整块区域一起消失
  const recommendedProducts = useMemo<Product[]>(
    () => pickRecommended(recommendPool, { limit: RECOMMEND_LIMIT, offset: recommendOffset }),
    [recommendPool, recommendOffset],
  )

  const activeCategoryName =
    activeCategoryId === ALL_CATEGORY_ID
      ? null
      : (categories.find((category) => category.id === activeCategoryId)?.name ?? null)

  // 收藏走真实接口（与个人主页共用状态）：失败时给出后端文案
  const handleToggleFavorite = useCallback(
    (productId: number) => {
      void (async () => {
        try {
          await toggleFavorite(productId)
        } catch (error) {
          setToast({
            id: Date.now(),
            text: error instanceof ApiError ? error.message : '收藏失败，请稍后重试',
          })
        }
      })()
    },
    [toggleFavorite],
  )

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

  // 回车 / 点「搜索」进入搜索结果页（无刷新跳转，列表数据走 /api/search）
  const handleSearchSubmit = useCallback(
    (nextKeyword: string) => {
      const trimmed = nextKeyword.trim()
      navigate(
        trimmed ? `${ROUTES.search}?keyword=${encodeURIComponent(trimmed)}` : ROUTES.search,
      )
    },
    [navigate],
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
        categories={categories}
        activeCategoryId={activeCategoryId}
        onCategoryChange={setActiveCategoryId}
        keyword={keyword}
        onKeywordChange={setKeyword}
        onSearchSubmit={handleSearchSubmit}
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
          totalCount={productTotal > 0 ? productTotal : visibleProducts.length}
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
          loading={listStatus === 'loading'}
          error={listError}
          onRetry={() => void loadProducts(activeCategoryId)}
        />

        <footer className={styles.footer}>
          <p className={styles.footerBrand}>手帐集市 · Journal Bazaar</p>
          <p className={styles.footerNote}>
            商品与分类数据来自后端接口（/api/products、/api/categories），点击分类即可按类别筛选
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
