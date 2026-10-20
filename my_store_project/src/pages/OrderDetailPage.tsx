import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import BottomNavBar from '../components/BottomNavBar'
import PageHeader from '../components/PageHeader'
import ProductThumb from '../components/ProductThumb'
import { CartIcon, CheckIcon } from '../components/Icons'
import { ApiError } from '../api/client'
import { orderApi } from '../api/order'
import { selectTotalQuantity, useCartStore } from '../stores/cartStore'
import type { OrderVO } from '../types/order'
import { ORDER_STATUS_META, canCancel, canPay, orderStatusText } from '../utils/orderStatus'
import type { OrderStatusTone } from '../utils/orderStatus'
import { formatDateTime, formatPrice } from '../utils/format'
import { ROUTES } from '../router/paths'
import styles from './OrderDetailPage.module.css'

/** 提示浮层停留时间 */
const NOTE_DURATION = 2600

/**
 * 状态基调 → 标题配色。
 * CSS Modules 的类名是构建期生成的，不能用 `styles[`tone${tone}`]` 拼，
 * 这里显式映射一份，改动配色时只动这张表。
 */
const HERO_TONE_CLASS: Record<OrderStatusTone, string> = {
  pending: styles.tonePending,
  progress: styles.toneProgress,
  done: styles.toneDone,
  muted: styles.toneMuted,
}

/** 从确认订单页跳来时带的状态：用于显示「下单成功」提示 */
interface OrderDetailLocationState {
  justCreated?: boolean
}

function toMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

/**
 * 订单详情（/orders/:orderNo）
 * ----------------------------------------------------------------------------
 * - 按订单号拉详情，展示状态卡、收货信息、商品快照、金额与订单信息；
 * - 「待支付」时可以在本页直接支付或取消（取消会由后端回滚库存）；
 * - 从确认订单页跳过来时带 justCreated，会在状态卡上方显示下单成功提示。
 *
 * 明细展示的是 order_items 里的快照：商品之后改价改名都不影响这里，
 * 所以「再次购买」之类功能不能直接拿这里的单价去加购。
 */
export default function OrderDetailPage() {
  const { orderNo = '' } = useParams()
  const location = useLocation()
  const justCreated = Boolean((location.state as OrderDetailLocationState | null)?.justCreated)

  const cartCount = useCartStore(selectTotalQuantity)
  const fetchCart = useCartStore((state) => state.fetchCart)

  const [order, setOrder] = useState<OrderVO | null>(null)
  const [loading, setLoading] = useState(Boolean(orderNo))
  const [error, setError] = useState<string | null>(orderNo ? null : '缺少订单号')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)

  /**
   * 拉取订单详情。
   * ------------------------------------------------------------------
   * setState 都放在 await 之后：effect 里同步 setState 会触发级联渲染，
   * 所以「加载中」只由重试按钮负责置位，首屏用 useState 的初始值。
   */
  const fetchOrder = useCallback(async () => {
    if (!orderNo) return

    try {
      const result = await orderApi.get(orderNo)
      setOrder(result)
      setError(null)
    } catch (loadError) {
      setError(toMessage(loadError, '订单加载失败，请稍后重试'))
    } finally {
      setLoading(false)
    }
  }, [orderNo])

  useEffect(() => {
    // 数据拉取型 effect：按地址栏里的订单号请求详情并写入状态，
    // 属于「与外部系统（HTTP）同步」的合法副作用；setState 都发生在 await 之后。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchOrder()
  }, [fetchOrder])

  // 底部角标：直接用地址栏进来时也能显示正确件数
  useEffect(() => {
    void fetchCart()
  }, [fetchCart])

  useEffect(() => {
    if (!note) return undefined
    const timer = window.setTimeout(() => setNote(null), NOTE_DURATION)
    return () => window.clearTimeout(timer)
  }, [note])

  const runAction = useCallback(
    async (action: 'pay' | 'cancel') => {
      if (!order) return

      setBusy(true)
      setNote(null)
      try {
        const updated =
          action === 'pay' ? await orderApi.pay(order.orderNo) : await orderApi.cancel(order.orderNo)
        setOrder(updated)
        setNote({
          text: action === 'pay' ? '支付成功，等待卖家发货' : '订单已取消，占用的库存已退回',
          tone: 'info',
        })
      } catch (actionError) {
        setNote({ text: toMessage(actionError, '操作失败，请稍后重试'), tone: 'error' })
      } finally {
        setBusy(false)
      }
    },
    [order],
  )

  const copyOrderNo = useCallback(async () => {
    if (!order) return
    if (!navigator.clipboard) {
      setNote({ text: '当前浏览器不支持一键复制，请手动选择订单号', tone: 'error' })
      return
    }

    try {
      await navigator.clipboard.writeText(order.orderNo)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setNote({ text: '复制失败，请手动选择订单号', tone: 'error' })
    }
  }, [order])

  const meta = order ? ORDER_STATUS_META[order.status] : null

  return (
    <div className={styles.page}>
      <PageHeader
        title="订单详情"
        to={ROUTES.orders}
        backLabel="返回订单列表"
        right={<span className={styles.count}>单笔订单</span>}
      />

      <main className={styles.main}>
        {loading && !order && (
          <div className={styles.placeholder}>
            <span className={styles.icon}>
              <CartIcon size={26} />
            </span>
            <h2 className={styles.placeholderTitle}>正在加载订单…</h2>
            <p className={styles.placeholderText}>正在从服务器获取这笔订单的详情</p>
          </div>
        )}

        {error && !loading && (
          <div className={styles.placeholder}>
            <span className={styles.icon}>
              <CartIcon size={26} />
            </span>
            <h2 className={styles.placeholderTitle}>订单加载失败</h2>
            <p className={styles.placeholderText}>{error}</p>
            <div className={styles.placeholderActions}>
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  setLoading(true)
                  setError(null)
                  void fetchOrder()
                }}
              >
                重试
              </button>
              <Link className={styles.actionGhost} to={ROUTES.orders}>
                返回订单列表
              </Link>
            </div>
          </div>
        )}

        {order && (
          <>
            {justCreated && order.status === 'CREATED' && (
              <p className={styles.success} role="status">
                <CheckIcon size={14} />
                下单成功，请在下方完成支付
              </p>
            )}

            <section className={styles.hero}>
              <h2 className={`${styles.heroTitle} ${order ? HERO_TONE_CLASS[ORDER_STATUS_META[order.status].tone] : ''}`}>
                {orderStatusText(order.status, order.statusText)}
              </h2>
              <p className={styles.heroHint}>{meta?.hint}</p>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>收货信息</h2>
              </div>
              <dl className={styles.infoList}>
                <div className={styles.infoRow}>
                  <dt>收货人</dt>
                  <dd>{order.receiverName ?? '—'}</dd>
                </div>
                <div className={styles.infoRow}>
                  <dt>手机号</dt>
                  <dd className={styles.numeric}>{order.receiverPhone ?? '—'}</dd>
                </div>
                <div className={styles.infoRow}>
                  <dt>收货地址</dt>
                  <dd>{order.receiverAddress ?? '—'}</dd>
                </div>
              </dl>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>商品明细</h2>
                <span className={styles.cardHint}>
                  共 {order.itemCount} 种 · {order.totalQuantity} 件
                </span>
              </div>

              <ul className={styles.list}>
                {order.items.map((item) => (
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
                        ¥{formatPrice(item.unitPrice)} × {item.quantity}
                      </p>
                    </div>
                    <p className={styles.rowPrice}>¥{formatPrice(item.subtotal)}</p>
                  </li>
                ))}
              </ul>

              <div className={styles.amounts}>
                <div className={styles.amountRow}>
                  <span>商品金额</span>
                  <span>¥{formatPrice(order.totalAmount)}</span>
                </div>
                <div className={styles.amountRow}>
                  <span>运费</span>
                  <span>免运费</span>
                </div>
                <div className={`${styles.amountRow} ${styles.amountTotal}`}>
                  <span>{order.status === 'CANCELED' ? '订单金额' : '实付金额'}</span>
                  <strong>¥{formatPrice(order.totalAmount)}</strong>
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>订单信息</h2>
              </div>
              <dl className={styles.infoList}>
                <div className={styles.infoRow}>
                  <dt>订单号</dt>
                  <dd className={styles.orderNoCell}>
                    <span className={styles.orderNo}>{order.orderNo}</span>
                    <button type="button" className={styles.copyBtn} onClick={() => void copyOrderNo()}>
                      {copied ? <CheckIcon size={12} /> : null}
                      {copied ? '已复制' : '复制'}
                    </button>
                  </dd>
                </div>
                <div className={styles.infoRow}>
                  <dt>下单时间</dt>
                  <dd className={styles.numeric}>{formatDateTime(order.createdAt)}</dd>
                </div>
                <div className={styles.infoRow}>
                  <dt>更新时间</dt>
                  <dd className={styles.numeric}>{formatDateTime(order.updatedAt)}</dd>
                </div>
              </dl>
            </section>

            {note && (
              <p className={note.tone === 'error' ? styles.noteError : styles.note} role="status">
                {note.text}
              </p>
            )}
          </>
        )}
      </main>

      {order && (
        <div
          className={
            canPay(order.status) || canCancel(order.status)
              ? styles.bar
              : `${styles.bar} ${styles.barCentered}`
          }
        >
          {canPay(order.status) || canCancel(order.status) ? (
            <>
              {canCancel(order.status) && (
                <button
                  type="button"
                  className={styles.ghostBtn}
                  disabled={busy}
                  onClick={() => void runAction('cancel')}
                >
                  取消订单
                </button>
              )}
              {canPay(order.status) && (
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={busy}
                  onClick={() => void runAction('pay')}
                >
                  {busy ? '处理中…' : '立即支付'}
                </button>
              )}
            </>
          ) : (
            <Link className={styles.primaryBtn} to={ROUTES.home}>
              继续逛逛
            </Link>
          )}
        </div>
      )}

      <BottomNavBar cartCount={cartCount} />
    </div>
  )
}
