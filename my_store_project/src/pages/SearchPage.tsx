import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import BottomNavBar from '../components/BottomNavBar'
import SearchProductCard from '../components/SearchProductCard'
import { ArrowLeftIcon, CloseIcon, SearchIcon } from '../components/Icons'
import { ApiError } from '../api/client'
import { searchApi } from '../api/search'
import { selectTotalQuantity, useCartStore } from '../stores/cartStore'
import { selectAuthStatus, useAuthStore } from '../stores/authStore'
import { useLoginGate } from '../utils/useLoginGate'
import type { ProductSearchItemVO, ShopSearchItemVO } from '../types/search'
import { resolveImageUrl } from '../utils/assetUrl'
import { ROUTES } from '../router/paths'
import styles from './SearchPage.module.css'

/** 输入停顿多久后自动搜索 */
const DEBOUNCE_MS = 350
/** 每页条数（后端上限 20；两列网格刚好三行，种子数据下也能看到「加载更多」） */
const PAGE_SIZE = 6
/** 关键词最短长度：后端 ngram 的最小粒度是 2 */
const KEYWORD_MIN_LENGTH = 2
/** 提示浮层停留时间 */
const NOTE_DURATION = 2400
/** 空搜索页给的热门关键词 */
const HOT_KEYWORDS = ['手帐本', '贴纸', '胶带', '印章', '复古']
/** 首屏骨架数量 */
const SKELETON_COUNT = 6

type TabKey = 'product' | 'shop'
type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

function toMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

/**
 * 搜索结果页（/search?keyword=手帐）
 * ----------------------------------------------------------------------------
 * 交互上的三个要点：
 *   1. 防抖：输入停顿 350ms 才自动搜，避免每敲一个字都打一次接口；
 *   2. 立即搜索：按回车或点「搜索」会清掉待执行的防抖定时器，马上发请求；
 *   3. 无刷新：关键词写进 URL（replace 模式，不污染后退历史），
 *      页面组件始终挂载，只替换列表内容；切 tab / 加载更多都不跳页。
 *
 * 请求竞态：每次请求带一个递增的 token，回来时 token 不是最新的就丢弃，
 * 保证「先发后到」的旧关键词结果不会盖掉新结果。
 */
export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const keyword = (searchParams.get('keyword') ?? '').trim()

  /** 搜索页可匿名浏览；点「加入购物车」时才要求登录 */
  const requireLogin = useLoginGate()
  const authStatus = useAuthStore(selectAuthStatus)

  const cartCount = useCartStore(selectTotalQuantity)
  const addItem = useCartStore((state) => state.addItem)
  const fetchCart = useCartStore((state) => state.fetchCart)

  const [input, setInput] = useState(() => searchParams.get('keyword') ?? '')
  const [tab, setTab] = useState<TabKey>('product')

  const [items, setItems] = useState<ProductSearchItemVO[]>([])
  const [total, setTotal] = useState(0)
  const [shops, setShops] = useState<ShopSearchItemVO[]>([])
  const [shopTotal, setShopTotal] = useState(0)
  const [page, setPage] = useState(1)

  const [status, setStatus] = useState<LoadStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [addingId, setAddingId] = useState<number | null>(null)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)

  /** 请求序号：只有最后一次请求的结果会被采用 */
  const requestToken = useRef(0)

  /** 把关键词写回 URL（replace：不打乱后退历史，页面不会重新加载） */
  const commit = useCallback(
    (next: string) => {
      const trimmed = next.trim()
      const params = new URLSearchParams()
      if (trimmed) params.set('keyword', trimmed)
      setSearchParams(params, { replace: true })
    },
    [setSearchParams],
  )

  /**
   * 防抖：输入与已提交的关键词不一致时，350ms 后再同步到 URL。
   * 清空输入也会同步（回到「输入关键词」的初始态）。
   */
  useEffect(() => {
    if (input.trim() === keyword) return undefined

    const timer = window.setTimeout(() => commit(input), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [input, keyword, commit])

  /** 回车 / 点「搜索」：取消防抖，立即提交 */
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      commit(input)
    },
    [commit, input],
  )

  const handleClear = useCallback(() => {
    setInput('')
    commit('')
  }, [commit])

  const handleHotKeyword = useCallback(
    (word: string) => {
      setInput(word)
      commit(word)
    },
    [commit],
  )

  /** 拉某一页；append=true 时追加到列表末尾（加载更多） */
  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      if (keyword.length < KEYWORD_MIN_LENGTH) return

      const token = ++requestToken.current
      if (append) setLoadingMore(true)
      else {
        setStatus('loading')
        setError(null)
      }

      try {
        const result = await searchApi.search({ keyword, page: targetPage, pageSize: PAGE_SIZE })
        if (token !== requestToken.current) return

        const productList = result.products?.list ?? []
        const shopList = result.shops?.list ?? []

        setItems((prev) => (append ? [...prev, ...productList] : productList))
        setShops((prev) => (append ? [...prev, ...shopList] : shopList))
        setTotal(result.products?.total ?? 0)
        setShopTotal(result.shops?.total ?? 0)
        setPage(targetPage)
        setStatus('ready')
      } catch (loadError) {
        if (token !== requestToken.current) return

        if (append) {
          setNote({ text: toMessage(loadError, '加载失败，请稍后重试'), tone: 'error' })
        } else {
          setError(toMessage(loadError, '搜索失败，请稍后重试'))
          setStatus('error')
        }
      } finally {
        if (token === requestToken.current) setLoadingMore(false)
      }
    },
    [keyword],
  )

  /** 关键词变化：清空旧结果，从第 1 页重新搜 */
  const sync = useCallback(async () => {
    if (keyword.length < KEYWORD_MIN_LENGTH) {
      setStatus('idle')
      setItems([])
      setTotal(0)
      setShops([])
      setShopTotal(0)
      setPage(1)
      setError(null)
      return
    }

    setTab('product')
    await load(1, false)
  }, [keyword, load])

  useEffect(() => {
    // 数据拉取型 effect：关键词变化时重新请求并写入状态；setState 都在 await 之后
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void sync()
  }, [sync])

  useEffect(() => {
    void fetchCart()
  }, [fetchCart, authStatus])

  useEffect(() => {
    if (!note) return undefined
    const timer = window.setTimeout(() => setNote(null), NOTE_DURATION)
    return () => window.clearTimeout(timer)
  }, [note])

  const handleAddToCart = useCallback(
    async (item: ProductSearchItemVO) => {
      if (!requireLogin('加入购物车')) return

      setAddingId(item.id)
      try {
        await addItem(item.id)
        setNote({ text: `「${item.title}」已加入购物车`, tone: 'info' })
      } catch (addError) {
        setNote({ text: toMessage(addError, '加入购物车失败，请稍后重试'), tone: 'error' })
      } finally {
        setAddingId(null)
      }
    },
    [addItem, requireLogin],
  )

  const hasKeyword = keyword.length >= KEYWORD_MIN_LENGTH
  const isLoadingFirst = status === 'loading'
  const isError = status === 'error'
  const showEmptyProducts = hasKeyword && status === 'ready' && items.length === 0
  const showEmptyShops = hasKeyword && status === 'ready' && shops.length === 0
  const hasMore = tab === 'product' ? items.length < total : shops.length < shopTotal

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.back} to={ROUTES.home} aria-label="返回首页">
            <ArrowLeftIcon size={18} />
          </Link>

          <form className={styles.searchBar} role="search" onSubmit={handleSubmit}>
            <SearchIcon size={17} className={styles.searchIcon} />
            <input
              className={styles.input}
              type="search"
              value={input}
              placeholder="搜索商品 / 店铺"
              aria-label="搜索商品或店铺"
              autoFocus
              onChange={(event) => setInput(event.target.value)}
            />
            {input.length > 0 && (
              <button
                type="button"
                className={styles.clear}
                onClick={handleClear}
                aria-label="清空搜索"
              >
                <CloseIcon size={13} />
              </button>
            )}
            <button type="submit" className={styles.submit}>
              搜索
            </button>
          </form>
        </div>
      </header>

      <main className={styles.main}>
        {!hasKeyword && (
          <section className={styles.intro}>
            <span className={styles.introIcon}>
              <SearchIcon size={24} />
            </span>
            <h1 className={styles.introTitle}>搜索手帐好物</h1>
            <p className={styles.introText}>
              输入商品名或店铺名，至少 2 个字（中文按两字一组匹配）。
            </p>
            <div className={styles.hotList}>
              {HOT_KEYWORDS.map((word) => (
                <button
                  key={word}
                  type="button"
                  className={styles.hotItem}
                  onClick={() => handleHotKeyword(word)}
                >
                  {word}
                </button>
              ))}
            </div>
          </section>
        )}

        {hasKeyword && (
          <div className={styles.tabs} role="tablist" aria-label="搜索结果分类">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'product'}
              className={tab === 'product' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setTab('product')}
            >
              商品
              <span className={styles.tabCount}>{status === 'ready' ? total : '…'}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'shop'}
              className={tab === 'shop' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setTab('shop')}
            >
              店铺
              <span className={styles.tabCount}>{status === 'ready' ? shopTotal : '…'}</span>
            </button>
          </div>
        )}

        {/* 首屏加载：骨架屏 */}
        {hasKeyword && isLoadingFirst && (
          <ul className={styles.skeletonGrid} aria-hidden="true">
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <li key={index} className={styles.skeletonCard}>
                <span className={styles.skeletonMedia} />
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLineShort} />
              </li>
            ))}
          </ul>
        )}

        {hasKeyword && isError && (
          <section className={styles.stateBlock}>
            <span className={styles.stateIcon}>
              <SearchIcon size={22} />
            </span>
            <h2 className={styles.stateTitle}>搜索失败</h2>
            <p className={styles.stateText}>{error ?? '请稍后重试'}</p>
            <button type="button" className={styles.stateAction} onClick={() => void load(1, false)}>
              重试
            </button>
          </section>
        )}

        {/* 商品 */}
        {hasKeyword && !isLoadingFirst && !isError && tab === 'product' && (
          <>
            {showEmptyProducts ? (
              <section className={styles.stateBlock}>
                <span className={styles.stateIcon}>
                  <SearchIcon size={22} />
                </span>
                <p className={styles.stateText}>未找到相关商品，换个关键词试试吧。</p>
                <div className={styles.hotList}>
                  {HOT_KEYWORDS.map((word) => (
                    <button
                      key={word}
                      type="button"
                      className={styles.hotItem}
                      onClick={() => handleHotKeyword(word)}
                    >
                      {word}
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <>
                <p className={styles.resultHint}>
                  找到 {total} 件与「{keyword}」相关的商品
                </p>

                <ul className={styles.grid}>
                  {items.map((item) => (
                    <li key={item.id}>
                      <SearchProductCard
                        item={item}
                        adding={addingId === item.id}
                        onAddToCart={(product) => void handleAddToCart(product)}
                      />
                    </li>
                  ))}
                </ul>

                {hasMore && (
                  <button
                    type="button"
                    className={styles.moreBtn}
                    disabled={loadingMore}
                    onClick={() => void load(page + 1, true)}
                  >
                    {loadingMore ? '加载中…' : '加载更多'}
                  </button>
                )}

                {!hasMore && items.length > 0 && (
                  <p className={styles.endHint}>已经到底啦</p>
                )}
              </>
            )}
          </>
        )}

        {/* 店铺 */}
        {hasKeyword && !isLoadingFirst && !isError && tab === 'shop' && (
          <>
            {showEmptyShops ? (
              <section className={styles.stateBlock}>
                <span className={styles.stateIcon}>
                  <SearchIcon size={22} />
                </span>
                <p className={styles.stateText}>未找到相关店铺，换个关键词试试吧。</p>
              </section>
            ) : (
              <>
                <p className={styles.resultHint}>
                  找到 {shopTotal} 家与「{keyword}」相关的店铺
                </p>

                <ul className={styles.shopList}>
                  {shops.map((shop) => {
                    const avatarUrl = resolveImageUrl(shop.avatarUrl)

                    return (
                      <li key={shop.id} className={styles.shopRow}>
                        <span className={styles.shopAvatar}>
                          {avatarUrl ? (
                            <img className={styles.shopAvatarImage} src={avatarUrl} alt="" />
                          ) : (
                            <span className={styles.shopInitial} aria-hidden="true">
                              {shop.nickname.slice(0, 1) || '手'}
                            </span>
                          )}
                        </span>

                        <div className={styles.shopInfo}>
                          <p className={styles.shopName}>{shop.nickname}</p>
                          <p className={styles.shopBio}>{shop.bio ?? '这位手作人还没有填写简介'}</p>
                          <p className={styles.shopMeta}>在售 {shop.productCount} 件商品</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>

                <p className={styles.endHint}>店铺主页还在开发中，先去商品页逛逛吧</p>
              </>
            )}
          </>
        )}

        {note && (
          <p className={note.tone === 'error' ? styles.noteError : styles.note} role="status">
            {note.text}
          </p>
        )}
      </main>

      <BottomNavBar cartCount={cartCount} />
    </div>
  )
}
