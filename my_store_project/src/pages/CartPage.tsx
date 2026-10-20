import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BottomNavBar from '../components/BottomNavBar'
import ProductThumb from '../components/ProductThumb'
import SellerBadge from '../components/SellerBadge'
import {
  ArrowLeftIcon,
  CartIcon,
  CheckIcon,
  CloseIcon,
  MinusIcon,
  PlusIcon,
} from '../components/Icons'
import {
  selectAllSelected,
  selectItems,
  selectLoadError,
  selectMutating,
  selectSelectedAmount,
  selectSelectedQuantity,
  selectCartStatus,
  selectTotalQuantity,
  useCartStore,
} from '../stores/cartStore'
import { ApiError } from '../api/client'
import { formatPrice } from '../utils/format'
import { ROUTES } from '../router/paths'
import styles from './CartPage.module.css'

/** 操作提示浮层的停留时间 */
const NOTE_DURATION = 2400

/**
 * 购物车页面
 * ----------------------------------------------------------------------------
 * 数据全部来自后端 /api/cart（见 src/api/cart.ts + src/stores/cartStore.ts）：
 *   - 条目、勾选状态、小计、合计、选中合计都由服务端返回，前端只负责渲染；
 *   - 数量增减 / 勾选 / 删除 都会重新拉取整车数据，金额不会出现两边不一致。
 * 「去结算」跳到 /checkout（确认订单页），真正下单由那边的 POST /api/orders 完成。
 */
export default function CartPage() {
  const navigate = useNavigate()

  const items = useCartStore(selectItems)
  const status = useCartStore(selectCartStatus)
  const loadError = useCartStore(selectLoadError)
  const mutating = useCartStore(selectMutating)

  const fetchCart = useCartStore((state) => state.fetchCart)
  const toggleSelected = useCartStore((state) => state.toggleSelected)
  const setAllSelected = useCartStore((state) => state.setAllSelected)
  const increaseQuantity = useCartStore((state) => state.increaseQuantity)
  const decreaseQuantity = useCartStore((state) => state.decreaseQuantity)
  const removeItem = useCartStore((state) => state.removeItem)
  const clearCart = useCartStore((state) => state.clearCart)

  const totalQuantity = useCartStore(selectTotalQuantity)
  const selectedQuantity = useCartStore(selectSelectedQuantity)
  const selectedAmount = useCartStore(selectSelectedAmount)
  const allSelected = useCartStore(selectAllSelected)

  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)

  // 进入页面时拉取购物车
  useEffect(() => {
    void fetchCart()
  }, [fetchCart])

  useEffect(() => {
    if (!note) return undefined
    const timer = window.setTimeout(() => setNote(null), NOTE_DURATION)
    return () => window.clearTimeout(timer)
  }, [note])

  /** 统一包装写操作：失败时把后端文案（如库存不足）展示出来 */
  const run = useCallback(
    async (task: () => Promise<void>, successText?: string) => {
      try {
        await task()
        if (successText) setNote({ text: successText, tone: 'info' })
      } catch (error) {
        setNote({
          text: error instanceof ApiError ? error.message : '操作失败，请稍后重试',
          tone: 'error',
        })
      }
    },
    [],
  )

  const handleCheckout = () => {
    if (selectedQuantity === 0) return
    navigate(ROUTES.checkout)
  }

  const isLoading = status === 'loading' && items.length === 0
  const isEmpty = status !== 'error' && !isLoading && items.length === 0

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.back} to={ROUTES.home} aria-label="返回首页">
            <ArrowLeftIcon size={18} />
          </Link>
          <h1 className={styles.title}>购物车</h1>
          <span className={styles.count}>{totalQuantity} 件</span>
        </div>
      </header>

      <main className={isEmpty || isLoading || status === 'error' ? styles.mainCentered : styles.main}>
        {isLoading && (
          <div className={styles.placeholder}>
            <span className={styles.icon}>
              <CartIcon size={26} />
            </span>
            <h2 className={styles.placeholderTitle}>正在加载购物车…</h2>
            <p className={styles.placeholderText}>正在从服务器获取你加入的商品</p>
          </div>
        )}

        {status === 'error' && !isLoading && (
          <div className={styles.placeholder}>
            <span className={styles.icon}>
              <CartIcon size={26} />
            </span>
            <h2 className={styles.placeholderTitle}>购物车加载失败</h2>
            <p className={styles.placeholderText}>{loadError ?? '请稍后重试'}</p>
            <button
              type="button"
              className={styles.action}
              onClick={() => void fetchCart()}
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
            <h2 className={styles.placeholderTitle}>购物车还是空的</h2>
            <p className={styles.placeholderText}>
              去首页挑几件手帐好物吧，加进来的商品会在这里按加入顺序排列。
            </p>
            <Link className={styles.action} to={ROUTES.home}>
              去逛逛
            </Link>
          </div>
        )}

        {!isEmpty && !isLoading && status !== 'error' && (
          <>
            <div className={styles.toolbar}>
              <Link className={styles.ghostBtn} to={ROUTES.orders}>
                我的订单
              </Link>
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={mutating}
                onClick={() => void run(() => clearCart(), '已清空购物车')}
              >
                清空购物车
              </button>
            </div>

            <ul className={styles.list}>
              {items.map((item) => (
                <li key={item.productId} className={styles.row}>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={item.isSelected}
                      disabled={mutating}
                      onChange={() => void run(() => toggleSelected(item.productId))}
                      aria-label={`选择 ${item.product.title}`}
                    />
                    <span className={styles.box} aria-hidden="true">
                      <CheckIcon size={12} />
                    </span>
                  </label>

                  <div className={styles.thumbWrap}>
                    <ProductThumb
                      src={item.product.imageUrl}
                      alt={item.product.title}
                      seed={item.productId}
                      compact
                    />
                  </div>

                  <div className={styles.info}>
                    <div className={styles.infoTop}>
                      <h2 className={styles.itemTitle}>{item.product.title}</h2>
                      <button
                        type="button"
                        className={styles.remove}
                        disabled={mutating}
                        onClick={() => void run(() => removeItem(item.productId), '已移出购物车')}
                        aria-label={`移除 ${item.product.title}`}
                      >
                        <CloseIcon size={14} />
                      </button>
                    </div>

                    <SellerBadge
                      name={item.product.sellerName}
                      avatar={item.product.sellerAvatarUrl}
                      size="sm"
                    />

                    <div className={styles.infoBottom}>
                      <p className={styles.itemPrice}>
                        <em>¥</em>
                        {formatPrice(item.lineTotal)}
                        <span className={styles.unit}>
                          单价 ¥{formatPrice(item.product.price)}
                        </span>
                      </p>

                      <div className={styles.stepper}>
                        <button
                          type="button"
                          className={styles.stepBtn}
                          onClick={() => void run(() => decreaseQuantity(item.productId))}
                          disabled={mutating || item.quantity <= 1}
                          aria-label={`减少 ${item.product.title} 的数量`}
                        >
                          <MinusIcon size={13} />
                        </button>
                        <span className={styles.qty}>{item.quantity}</span>
                        <button
                          type="button"
                          className={styles.stepBtn}
                          onClick={() => void run(() => increaseQuantity(item.productId))}
                          disabled={mutating || item.quantity >= item.product.stock}
                          aria-label={`增加 ${item.product.title} 的数量`}
                        >
                          <PlusIcon size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {note && (
              <p
                className={note.tone === 'error' ? `${styles.note} ${styles.noteError}` : styles.note}
                role="status"
              >
                {note.text}
              </p>
            )}

            <div className={styles.summary}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={mutating}
                  onChange={(event) => void run(() => setAllSelected(event.target.checked))}
                />
                <span className={styles.box} aria-hidden="true">
                  <CheckIcon size={12} />
                </span>
                <span className={styles.summaryLabel}>全选</span>
              </label>

              <div className={styles.summaryRight}>
                <span className={styles.selectedInfo}>已选 {selectedQuantity} 件</span>
                <span className={styles.total}>
                  合计 <strong>¥{formatPrice(selectedAmount)}</strong>
                </span>
                <button
                  type="button"
                  className={styles.checkout}
                  disabled={selectedQuantity === 0 || mutating}
                  onClick={handleCheckout}
                >
                  去结算
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      <BottomNavBar cartCount={totalQuantity} />
    </div>
  )
}
