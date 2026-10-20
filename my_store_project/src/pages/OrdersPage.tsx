import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BottomNavBar from '../components/BottomNavBar'
import OrderStatusBadge from '../components/OrderStatusBadge'
import PageHeader from '../components/PageHeader'
import ProductThumb from '../components/ProductThumb'
import { CartIcon } from '../components/Icons'
import { ApiError } from '../api/client'
import { orderApi } from '../api/order'
import { selectTotalQuantity, useCartStore } from '../stores/cartStore'
import type { OrderListVO } from '../types/order'
import { ORDER_FILTERS, canCancel, canPay } from '../utils/orderStatus'
import type { OrderFilterValue } from '../utils/orderStatus'
import { formatDateTime, formatPrice } from '../utils/format'
import { ROUTES, orderDetailPath } from '../router/paths'
import styles from './OrdersPage.module.css'

/** 每页条数（后端上限 50，这里取 5 让手机上不用滚太久） */
const PAGE_SIZE = 5
/** 提示浮层停留时间 */
const NOTE_DURATION = 2600
/** 订单卡片里最多展示几张商品缩略图 */
const MAX_THUMBS = 3

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '操作失败，请稍后重试'
}

/**
 * 我的订单（/orders）
 * ----------------------------------------------------------------------------
 * 数据来自 GET /api/orders（分页 + 状态筛选），每张卡片带明细缩略图。
 * 只有「待支付」的订单会显示「立即支付 / 取消订单」——
 * 具体能不能操作以状态机为准（见 utils/orderStatus.ts），后端也会再校验一次。
 *
 * 支付与取消都返回该订单的最新状态，直接替换列表里的同一条，
 * 不需要整页重新加载；但如果当前有状态筛选，操作后订单可能已不属于该筛选，
 * 这时会重新拉取一次列表，避免出现「已支付却还在待支付里」的残留。
 */
export default function OrdersPage() {
  const cartCount = useCartStore(selectTotalQuantity)
  const fetchCart = useCartStore((state) => state.fetchCart)

  const [filter, setFilter] = useState<OrderFilterValue>('ALL')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<OrderListVO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** 正在支付/取消的订单号，用于只禁用这一张卡片的按钮 */
  const [busyOrderNo, setBusyOrderNo] = useState<string | null>(null)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)

  /**
   * 拉取订单列表。
   * ------------------------------------------------------------------
   * 所有 setState 都放在 await 之后：在 effect 里同步 setState 会触发级联渲染，
   * 因此「加载中」只由事件处理函数（切筛选、翻页、重试）负责置位，
   * 首屏则用 useState 的初始值 true。
   */
  const fetchList = useCallback(async (targetPage: number, targetFilter: OrderFilterValue) => {
    try {
      const result = await orderApi.list({
        page: targetPage,
        pageSize: PAGE_SIZE,
        ...(targetFilter === 'ALL' ? {} : { status: targetFilter }),
      })
      setData(result)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : '订单加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 数据拉取型 effect：进入页面/切换筛选/翻页时请求列表并写入状态，
    // 属于「与外部系统（HTTP）同步」的合法副作用；真正的 setState 都发生在 await 之后。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchList(page, filter)
  }, [fetchList, page, filter])

  // 底部购物车角标：单独进来时也能显示正确件数
  useEffect(() => {
    void fetchCart()
  }, [fetchCart])

  useEffect(() => {
    if (!note) return undefined
    const timer = window.setTimeout(() => setNote(null), NOTE_DURATION)
    return () => window.clearTimeout(timer)
  }, [note])

  const runAction = useCallback(
    async (orderNo: string, action: 'pay' | 'cancel') => {
      setBusyOrderNo(orderNo)
      setNote(null)
      try {
        const updated = action === 'pay' ? await orderApi.pay(orderNo) : await orderApi.cancel(orderNo)

        setData((current) =>
          current
            ? {
                ...current,
                list: current.list.map((order) => (order.orderNo === updated.orderNo ? updated : order)),
              }
            : current,
        )
        setNote({
          text: action === 'pay' ? '支付成功，订单已进入待发货' : '订单已取消，库存已退回',
          tone: 'info',
        })

        if (filter !== 'ALL') await fetchList(page, filter)
      } catch (actionError) {
        setNote({ text: toMessage(actionError), tone: 'error' })
      } finally {
        setBusyOrderNo(null)
      }
    },
    [filter, fetchList, page],
  )

  const list = data?.list ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const isEmpty = !loading && !error && list.length === 0

  return (
    <div className={styles.page}>
      <PageHeader
        title="我的订单"
        to={ROUTES.home}
        backLabel="返回首页"
        right={
          <Link className={styles.cartLink} to={ROUTES.cart}>
            购物车
          </Link>
        }
      />

      <div className={styles.filters} role="tablist" aria-label="按状态筛选订单">
        {ORDER_FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={filter === item.value}
            className={filter === item.value ? `${styles.chip} ${styles.chipActive}` : styles.chip}
            onClick={() => {
              setLoading(true)
              setFilter(item.value)
              setPage(1)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <main className={styles.main}>
        {loading && list.length === 0 && (
          <div className={styles.placeholder}>
            <span className={styles.icon}>
              <CartIcon size={26} />
            </span>
            <h2 className={styles.placeholderTitle}>正在加载订单…</h2>
            <p className={styles.placeholderText}>正在从服务器获取你的订单记录</p>
          </div>
        )}

        {error && !loading && (
          <div className={styles.placeholder}>
            <span className={styles.icon}>
              <CartIcon size={26} />
            </span>
            <h2 className={styles.placeholderTitle}>订单加载失败</h2>
            <p className={styles.placeholderText}>{error}</p>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                setLoading(true)
                void fetchList(page, filter)
              }}
            >
              重试
            </button>
          </div>
        )}

        {isEmpty && (
          <div className={styles.placeholder}>
            <span className={styles.icon}>
              <CartIcon size={26} />
            </span>
            <h2 className={styles.placeholderTitle}>
              {filter === 'ALL' ? '还没有订单' : '这个状态下没有订单'}
            </h2>
            <p className={styles.placeholderText}>
              {filter === 'ALL'
                ? '去首页挑几件手帐好物，结算后就能在这里查看订单进度。'
                : '换个状态看看，或者去首页继续逛逛。'}
            </p>
            <Link className={styles.action} to={ROUTES.home}>
              去逛逛
            </Link>
          </div>
        )}

        {note && (
          <p className={note.tone === 'error' ? styles.noteError : styles.note} role="status">
            {note.text}
          </p>
        )}

        {list.length > 0 && (
          <>
            <ul className={styles.list}>
              {list.map((order) => {
                const busy = busyOrderNo === order.orderNo
                const preview = order.items[0]

                return (
                  <li key={order.orderNo}>
                    <article className={styles.card}>
                      <header className={styles.cardHead}>
                        <div className={styles.headText}>
                          <p className={styles.orderNo}>订单号 {order.orderNo}</p>
                          <p className={styles.createdAt}>{formatDateTime(order.createdAt)}</p>
                        </div>
                        <OrderStatusBadge status={order.status} text={order.statusText} />
                      </header>

                      <Link className={styles.preview} to={orderDetailPath(order.orderNo)}>
                        <div className={styles.thumbs}>
                          {order.items.slice(0, MAX_THUMBS).map((item) => (
                            <div key={item.id} className={styles.thumb}>
                              <ProductThumb
                                src={item.imageUrl}
                                alt={item.title}
                                seed={item.productId}
                                compact
                              />
                            </div>
                          ))}
                          {order.items.length > MAX_THUMBS && (
                            <span className={styles.moreThumbs}>
                              +{order.items.length - MAX_THUMBS}
                            </span>
                          )}
                        </div>
                        <div className={styles.previewInfo}>
                          <h3 className={styles.previewTitle}>{preview?.title ?? '商品'}</h3>
                          <p className={styles.previewMeta}>
                            共 {order.itemCount} 种 · {order.totalQuantity} 件
                          </p>
                        </div>
                      </Link>

                      <footer className={styles.cardFoot}>
                        <p className={styles.total}>
                          合计 <strong>¥{formatPrice(order.totalAmount)}</strong>
                        </p>
                        <div className={styles.actions}>
                          {canCancel(order.status) && (
                            <button
                              type="button"
                              className={styles.ghostBtn}
                              disabled={busy}
                              onClick={() => void runAction(order.orderNo, 'cancel')}
                            >
                              取消订单
                            </button>
                          )}
                          {canPay(order.status) && (
                            <button
                              type="button"
                              className={styles.primaryBtn}
                              disabled={busy}
                              onClick={() => void runAction(order.orderNo, 'pay')}
                            >
                              {busy ? '处理中…' : '立即支付'}
                            </button>
                          )}
                          <Link className={styles.linkBtn} to={orderDetailPath(order.orderNo)}>
                            查看详情
                          </Link>
                        </div>
                      </footer>
                    </article>
                  </li>
                )
              })}
            </ul>

            {totalPages > 1 && (
              <nav className={styles.pager} aria-label="订单分页">
                <button
                  type="button"
                  className={styles.pagerBtn}
                  disabled={page <= 1 || loading}
                  onClick={() => {
                    setLoading(true)
                    setPage((current) => Math.max(1, current - 1))
                  }}
                >
                  上一页
                </button>
                <span className={styles.pagerInfo}>
                  第 {page} / {totalPages} 页 · 共 {total} 笔
                </span>
                <button
                  type="button"
                  className={styles.pagerBtn}
                  disabled={page >= totalPages || loading}
                  onClick={() => {
                    setLoading(true)
                    setPage((current) => current + 1)
                  }}
                >
                  下一页
                </button>
              </nav>
            )}
          </>
        )}
      </main>

      <BottomNavBar cartCount={cartCount} />
    </div>
  )
}
