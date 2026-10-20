import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import BottomNavBar from '../components/BottomNavBar'
import PageHeader from '../components/PageHeader'
import ProductThumb from '../components/ProductThumb'
import { CartIcon, CheckIcon, HeartIcon, UserIcon } from '../components/Icons'
import { ApiError } from '../api/client'
import { profileApi } from '../api/profile'
import { selectTotalQuantity, useCartStore } from '../stores/cartStore'
import {
  selectFavoriteItems,
  selectFavoritesError,
  selectFavoritesStatus,
  selectFavoritesTotal,
  useFavoritesStore,
} from '../stores/favoritesStore'
import type { ProfileVO, SellerProductVO } from '../types/profile'
import { formatDateTime, formatPrice } from '../utils/format'
import { resolveImageUrl } from '../utils/assetUrl'
import { ROUTES } from '../router/paths'
import styles from './ProfilePage.module.css'

/** 提示浮层停留时间 */
const NOTE_DURATION = 2600
/** 「我的商品」一次加载的条数（后端上限 50） */
const PRODUCT_PAGE_SIZE = 50

type ProfileTab = 'favorites' | 'products'

interface EditForm {
  nickname: string
  avatarUrl: string
  bio: string
}

const EMPTY_FORM: EditForm = { nickname: '', avatarUrl: '', bio: '' }

function toMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

/** 客户端校验（与后端 profileService 的规则保持一致，只为少一次往返） */
function validateForm(form: EditForm): string | null {
  const nickname = form.nickname.trim()
  if (!nickname) return '昵称不能为空'
  if (nickname.length > 50) return '昵称不能超过 50 个字符'
  if (form.bio.trim().length > 200) return '个人简介不能超过 200 个字符'
  if (form.avatarUrl.trim().length > 500) return '头像地址不能超过 500 个字符'
  if (/\s/.test(form.avatarUrl.trim())) return '头像地址不能包含空格'
  return null
}

/**
 * 个人主页（/profile）
 * ----------------------------------------------------------------------------
 * 展示「当前登录用户」的资料、统计、收藏与发布的商品：
 *   - 资料来自 GET /api/profile（昵称 / 头像 / 简介 / 邮箱 / 注册时间 + 四个统计）；
 *   - 收藏来自 useFavoritesStore（与首页爱心共用同一份数据，点一下两边同时更新）；
 *   - 商品来自 GET /api/profile/products（卖家视角，含下架）。
 *
 * 编辑资料是一个 PATCH 弹窗：只提交用户改过的字段语义上的三个字段，
 * 空串表示清空（后端会把 null 写库），保存成功后用返回的完整资料替换本地状态。
 */
export default function ProfilePage() {
  const cartCount = useCartStore(selectTotalQuantity)
  const addToCart = useCartStore((state) => state.addItem)
  const fetchCart = useCartStore((state) => state.fetchCart)

  const favoriteItems = useFavoritesStore(selectFavoriteItems)
  const favoritesStatus = useFavoritesStore(selectFavoritesStatus)
  const favoritesError = useFavoritesStore(selectFavoritesError)
  const favoriteTotal = useFavoritesStore(selectFavoritesTotal)
  const refreshFavorites = useFavoritesStore((state) => state.refresh)
  const toggleFavorite = useFavoritesStore((state) => state.toggle)

  const [profile, setProfile] = useState<ProfileVO | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [products, setProducts] = useState<SellerProductVO[]>([])
  const [productTotal, setProductTotal] = useState(0)

  const [tab, setTab] = useState<ProfileTab>('favorites')
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<EditForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [avatarFailed, setAvatarFailed] = useState(false)
  const [busyProductId, setBusyProductId] = useState<number | null>(null)

  /**
   * 拉取资料 + 我的商品。
   * setState 都放在 await 之后（effect 里同步 setState 会触发级联渲染）。
   */
  const fetchAll = useCallback(async () => {
    try {
      const [profileData, productList] = await Promise.all([
        profileApi.getProfile(),
        profileApi.listMyProducts({ page: 1, pageSize: PRODUCT_PAGE_SIZE }),
      ])
      setProfile(profileData)
      setProducts(productList.list)
      setProductTotal(productList.total)
      setStatus('ready')
    } catch (error) {
      setLoadError(toMessage(error, '个人主页加载失败，请稍后重试'))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    // 数据拉取型 effect：请求资料与商品后写入状态；setState 都在 await 之后
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll()
  }, [fetchAll])

  // 收藏与首页共用一份数据，这里只负责在进入页面时刷新一次
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

  // 编辑弹窗支持 Esc 关闭
  useEffect(() => {
    if (!editOpen) return undefined

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setEditOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editOpen])

  const avatarUrl = resolveImageUrl(profile?.avatarUrl ?? null)
  const showAvatar = Boolean(avatarUrl) && !avatarFailed

  const openEdit = useCallback(() => {
    if (!profile) return
    setForm({
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl ?? '',
      bio: profile.bio ?? '',
    })
    setEditError(null)
    setAvatarFailed(false)
    setEditOpen(true)
  }, [profile])

  const submitEdit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const formError = validateForm(form)
      if (formError) {
        setEditError(formError)
        return
      }

      setSaving(true)
      setEditError(null)
      try {
        const updated = await profileApi.updateProfile({
          nickname: form.nickname.trim(),
          // 空串表示清空，后端会存 null
          avatarUrl: form.avatarUrl.trim(),
          bio: form.bio.trim(),
        })
        setProfile(updated)
        setEditOpen(false)
        setNote({ text: '资料已更新', tone: 'info' })
      } catch (error) {
        setEditError(toMessage(error, '保存失败，请稍后重试'))
      } finally {
        setSaving(false)
      }
    },
    [form],
  )

  const handleToggleFavorite = useCallback(
    async (productId: number) => {
      try {
        await toggleFavorite(productId)
      } catch (error) {
        setNote({ text: toMessage(error, '操作失败，请稍后重试'), tone: 'error' })
      }
    },
    [toggleFavorite],
  )

  const handleAddToCart = useCallback(
    async (product: { id: number; title: string }) => {
      setBusyProductId(product.id)
      try {
        await addToCart(product.id)
        setNote({ text: `「${product.title}」已加入购物车`, tone: 'info' })
      } catch (error) {
        setNote({ text: toMessage(error, '加入购物车失败，请稍后重试'), tone: 'error' })
      } finally {
        setBusyProductId(null)
      }
    },
    [addToCart],
  )

  const stats = useMemo(
    () =>
      profile
        ? [
            { key: 'product', label: '商品', value: profile.stats.productCount, tab: 'products' as const },
            // 收藏数用收藏 store 的 total：在页面上点了爱心能立刻看到数字变化
            { key: 'favorite', label: '收藏', value: favoriteTotal, tab: 'favorites' as const },
            { key: 'order', label: '订单', value: profile.stats.orderCount, to: ROUTES.orders },
            { key: 'review', label: '评价', value: profile.stats.reviewCount },
          ]
        : [],
    [profile, favoriteTotal],
  )

  const favoritesLoading = favoritesStatus === 'loading' && favoriteItems.length === 0
  const favoritesEmpty = favoritesStatus !== 'error' && !favoritesLoading && favoriteItems.length === 0

  return (
    <div className={styles.page}>
      <PageHeader
        title="个人主页"
        to={ROUTES.home}
        backLabel="返回首页"
        right={
          profile ? (
            <button type="button" className={styles.editBtn} onClick={openEdit}>
              编辑资料
            </button>
          ) : null
        }
      />

      <main className={styles.main}>
        {status === 'loading' && (
          <div className={styles.placeholder}>
            <span className={styles.icon}>
              <UserIcon size={26} />
            </span>
            <h2 className={styles.placeholderTitle}>正在加载主页…</h2>
            <p className={styles.placeholderText}>正在获取你的资料与收藏</p>
          </div>
        )}

        {status === 'error' && (
          <div className={styles.placeholder}>
            <span className={styles.icon}>
              <UserIcon size={26} />
            </span>
            <h2 className={styles.placeholderTitle}>主页加载失败</h2>
            <p className={styles.placeholderText}>{loadError ?? '请稍后重试'}</p>
            <button type="button" className={styles.action} onClick={() => void fetchAll()}>
              重试
            </button>
          </div>
        )}

        {profile && status === 'ready' && (
          <>
            <section className={styles.hero}>
              <div className={styles.avatar}>
                {showAvatar ? (
                  <img
                    className={styles.avatarImage}
                    src={avatarUrl ?? undefined}
                    alt=""
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  <span className={styles.avatarInitial} aria-hidden="true">
                    {profile.nickname.slice(0, 1) || '手'}
                  </span>
                )}
              </div>

              <div className={styles.heroMain}>
                <h1 className={styles.nickname}>{profile.nickname}</h1>
                <p className={styles.bio}>{profile.bio ?? '还没有填写个人简介'}</p>
                <p className={styles.meta}>
                  加入于 {formatDateTime(profile.createdAt).slice(0, 10)}
                  {profile.email ? ` · ${profile.email}` : ''}
                </p>
              </div>
            </section>

            <ul className={styles.stats}>
              {stats.map((item) => {
                const content = (
                  <>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </>
                )

                if (item.to) {
                  return (
                    <li key={item.key}>
                      <Link className={styles.statItem} to={item.to}>
                        {content}
                      </Link>
                    </li>
                  )
                }
                if (item.tab) {
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        className={
                          tab === item.tab
                            ? `${styles.statItem} ${styles.statActive}`
                            : styles.statItem
                        }
                        onClick={() => setTab(item.tab)}
                      >
                        {content}
                      </button>
                    </li>
                  )
                }
                return (
                  <li key={item.key}>
                    <span className={styles.statItem}>{content}</span>
                  </li>
                )
              })}
            </ul>

            <div className={styles.tabs} role="tablist" aria-label="主页内容">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'favorites'}
                className={tab === 'favorites' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                onClick={() => setTab('favorites')}
              >
                我的收藏
                <span className={styles.tabCount}>{favoriteTotal}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'products'}
                className={tab === 'products' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                onClick={() => setTab('products')}
              >
                我的商品
                <span className={styles.tabCount}>{productTotal}</span>
              </button>
            </div>

            {tab === 'favorites' && (
              <>
                {favoritesLoading && (
                  <p className={styles.sectionHint}>正在加载收藏…</p>
                )}

                {favoritesStatus === 'error' && (
                  <p className={styles.sectionError}>{favoritesError ?? '收藏加载失败'}</p>
                )}

                {favoritesEmpty && (
                  <div className={styles.empty}>
                    <span className={styles.emptyIcon}>
                      <HeartIcon size={20} />
                    </span>
                    <p className={styles.emptyTitle}>还没有收藏</p>
                    <p className={styles.emptyText}>在首页点爱心，喜欢的商品会出现在这里。</p>
                    <Link className={styles.action} to={ROUTES.home}>
                      去逛逛
                    </Link>
                  </div>
                )}

                {favoriteItems.length > 0 && (
                  <ul className={styles.list}>
                    {favoriteItems.map((item) => {
                      const soldOut = item.stock <= 0
                      const offShelf = item.status !== 1

                      return (
                        <li key={item.id} className={styles.row}>
                          <div className={styles.thumbWrap}>
                            <ProductThumb
                              src={item.imageUrl}
                              alt={item.title}
                              seed={item.productId}
                              compact
                            />
                          </div>

                          <div className={styles.rowInfo}>
                            <h3 className={styles.rowTitle}>{item.title}</h3>
                            <p className={styles.rowMeta}>
                              ¥{formatPrice(item.price)}
                              <span className={styles.rowSeller}> · {item.sellerName}</span>
                            </p>
                            {(offShelf || soldOut) && (
                              <p className={styles.rowWarn}>{offShelf ? '已下架' : '已售罄'}</p>
                            )}
                          </div>

                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={styles.favBtn}
                              aria-label={`取消收藏 ${item.title}`}
                              onClick={() => void handleToggleFavorite(item.productId)}
                            >
                              <HeartIcon size={16} filled />
                            </button>
                            <button
                              type="button"
                              className={styles.cartBtn}
                              disabled={offShelf || soldOut || busyProductId === item.productId}
                              onClick={() =>
                                void handleAddToCart({ id: item.productId, title: item.title })
                              }
                            >
                              {busyProductId === item.productId ? '加入中…' : '加入购物车'}
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            )}

            {tab === 'products' && (
              <>
                {products.length === 0 ? (
                  <div className={styles.empty}>
                    <span className={styles.emptyIcon}>
                      <CartIcon size={20} />
                    </span>
                    <p className={styles.emptyTitle}>还没有发布商品</p>
                    <p className={styles.emptyText}>作为卖家发布的商品会显示在这里。</p>
                  </div>
                ) : (
                  <ul className={styles.list}>
                    {products.map((product) => (
                      <li key={product.id} className={styles.row}>
                        <div className={styles.thumbWrap}>
                          <ProductThumb
                            src={product.imageUrl}
                            alt={product.title}
                            seed={product.id}
                            compact
                          />
                        </div>

                        <div className={styles.rowInfo}>
                          <h3 className={styles.rowTitle}>{product.title}</h3>
                          <p className={styles.rowMeta}>
                            ¥{formatPrice(product.price)}
                            <span className={styles.rowSeller}> · 库存 {product.stock}</span>
                          </p>
                        </div>

                        <span
                          className={
                            product.status === 1
                              ? `${styles.badge} ${styles.badgeOn}`
                              : `${styles.badge} ${styles.badgeOff}`
                          }
                        >
                          {product.status === 1 ? '在售' : '已下架'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {productTotal > products.length && (
                  <p className={styles.sectionHint}>
                    仅显示最近 {products.length} 件，共 {productTotal} 件
                  </p>
                )}
              </>
            )}

            {note && (
              <p className={note.tone === 'error' ? styles.noteError : styles.note} role="status">
                {note.text}
              </p>
            )}
          </>
        )}
      </main>

      {editOpen && (
        <div className={styles.overlay} role="presentation" onClick={() => setEditOpen(false)}>
          <form
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void submitEdit(event)}
            noValidate
          >
            <h2 className={styles.dialogTitle} id="edit-profile-title">
              编辑资料
            </h2>

            <label className={styles.field}>
              <span className={styles.label}>昵称</span>
              <input
                className={styles.input}
                value={form.nickname}
                maxLength={50}
                onChange={(event) =>
                  setForm((current) => ({ ...current, nickname: event.target.value }))
                }
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>头像地址</span>
              <input
                className={styles.input}
                value={form.avatarUrl}
                maxLength={500}
                placeholder="https://… 或 avatars/avatar-1.png"
                onChange={(event) =>
                  setForm((current) => ({ ...current, avatarUrl: event.target.value }))
                }
              />
              <span className={styles.fieldHint}>留空表示使用昵称首字作为头像</span>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>个人简介</span>
              <textarea
                className={`${styles.input} ${styles.textarea}`}
                value={form.bio}
                rows={3}
                maxLength={200}
                placeholder="介绍一下你自己，最多 200 字"
                onChange={(event) =>
                  setForm((current) => ({ ...current, bio: event.target.value }))
                }
              />
            </label>

            {editError && <p className={styles.dialogError}>{editError}</p>}

            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={saving}
                onClick={() => setEditOpen(false)}
              >
                取消
              </button>
              <button type="submit" className={styles.primaryBtn} disabled={saving}>
                {saving ? (
                  '保存中…'
                ) : (
                  <>
                    <CheckIcon size={14} />
                    保存
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      <BottomNavBar cartCount={cartCount} />
    </div>
  )
}
