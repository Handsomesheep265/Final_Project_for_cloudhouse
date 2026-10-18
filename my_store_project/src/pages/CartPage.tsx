import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
  selectSelectedAmount,
  selectSelectedQuantity,
  selectTotalQuantity,
  useCartStore,
} from '../stores/cartStore'
import { formatPrice } from '../utils/format'
import { ROUTES } from '../router/paths'
import styles from './CartPage.module.css'

/**
 * 购物车页面
 * ----------------------------------------------------------------------------
 * 数据来自 src/stores/cartStore.ts（对应 cart_items 表）：
 * 勾选状态对应 is_selected，底部结算栏展示“选中合计”。
 * 结算流程还要接 orders / payments 接口，目前点击只给出提示。
 */
export default function CartPage() {
  const items = useCartStore((state) => state.items)
  const toggleSelected = useCartStore((state) => state.toggleSelected)
  const setAllSelected = useCartStore((state) => state.setAllSelected)
  const increaseQuantity = useCartStore((state) => state.increaseQuantity)
  const decreaseQuantity = useCartStore((state) => state.decreaseQuantity)
  const removeItem = useCartStore((state) => state.removeItem)

  const totalQuantity = useCartStore(selectTotalQuantity)
  const selectedQuantity = useCartStore(selectSelectedQuantity)
  const selectedAmount = useCartStore(selectSelectedAmount)
  const allSelected = useCartStore(selectAllSelected)

  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!note) return undefined
    const timer = window.setTimeout(() => setNote(null), 2400)
    return () => window.clearTimeout(timer)
  }, [note])

  const isEmpty = items.length === 0

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

      <main className={isEmpty ? styles.mainCentered : styles.main}>
        {isEmpty ? (
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
        ) : (
          <>
            <ul className={styles.list}>
              {items.map((item) => (
                <li key={item.productId} className={styles.row}>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={item.isSelected}
                      onChange={() => toggleSelected(item.productId)}
                      aria-label={`选择 ${item.product.title}`}
                    />
                    <span className={styles.box} aria-hidden="true">
                      <CheckIcon size={12} />
                    </span>
                  </label>

                  <div className={styles.thumbWrap}>
                    <ProductThumb
                      src={item.product.image}
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
                        onClick={() => removeItem(item.productId)}
                        aria-label={`移除 ${item.product.title}`}
                      >
                        <CloseIcon size={14} />
                      </button>
                    </div>

                    <SellerBadge
                      name={item.product.sellerName}
                      avatar={item.product.sellerAvatar}
                      size="sm"
                    />

                    <div className={styles.infoBottom}>
                      <p className={styles.itemPrice}>
                        <em>¥</em>
                        {formatPrice(item.product.price * item.quantity)}
                        <span className={styles.unit}>
                          单价 ¥{formatPrice(item.product.price)}
                        </span>
                      </p>

                      <div className={styles.stepper}>
                        <button
                          type="button"
                          className={styles.stepBtn}
                          onClick={() => decreaseQuantity(item.productId)}
                          disabled={item.quantity <= 1}
                          aria-label={`减少 ${item.product.title} 的数量`}
                        >
                          <MinusIcon size={13} />
                        </button>
                        <span className={styles.qty}>{item.quantity}</span>
                        <button
                          type="button"
                          className={styles.stepBtn}
                          onClick={() => increaseQuantity(item.productId)}
                          disabled={item.quantity >= item.product.stock}
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
              <p className={styles.note} role="status">
                {note}
              </p>
            )}

            <div className={styles.summary}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => setAllSelected(event.target.checked)}
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
                  disabled={selectedQuantity === 0}
                  onClick={() => setNote('结算流程待接入订单接口（orders / payments）')}
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
