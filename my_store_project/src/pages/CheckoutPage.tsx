import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BottomNavBar from '../components/BottomNavBar'
import PageHeader from '../components/PageHeader'
import ProductThumb from '../components/ProductThumb'
import { CartIcon } from '../components/Icons'
import { ApiError } from '../api/client'
import { orderApi } from '../api/order'
import {
  selectCartStatus,
  selectItems,
  selectLoadError,
  selectSelectedAmount,
  selectSelectedQuantity,
  selectTotalQuantity,
  useCartStore,
} from '../stores/cartStore'
import { formatPrice } from '../utils/format'
import { ROUTES, orderDetailPath } from '../router/paths'
import styles from './CheckoutPage.module.css'

/** 中国大陆手机号，与后端 orderService 的校验规则保持一致 */
const PHONE_PATTERN = /^1[3-9]\d{9}$/
/** 收货信息本地缓存：下次下单不用重新填 */
const RECEIVER_STORAGE_KEY = 'journal-market:receiver'
/** 提示浮层停留时间 */
const NOTE_DURATION = 2600

interface ReceiverForm {
  receiverName: string
  receiverPhone: string
  receiverAddress: string
}

type ReceiverField = keyof ReceiverForm
type FieldErrors = Partial<Record<ReceiverField, string>>

const EMPTY_FORM: ReceiverForm = { receiverName: '', receiverPhone: '', receiverAddress: '' }

/** 读上次填过的收货信息；localStorage 不可用（隐私模式）时返回空表单 */
function loadReceiver(): ReceiverForm {
  try {
    const raw = window.localStorage.getItem(RECEIVER_STORAGE_KEY)
    if (!raw) return EMPTY_FORM

    const parsed = JSON.parse(raw) as Partial<ReceiverForm>
    return {
      receiverName: typeof parsed.receiverName === 'string' ? parsed.receiverName : '',
      receiverPhone: typeof parsed.receiverPhone === 'string' ? parsed.receiverPhone : '',
      receiverAddress: typeof parsed.receiverAddress === 'string' ? parsed.receiverAddress : '',
    }
  } catch {
    return EMPTY_FORM
  }
}

function saveReceiver(form: ReceiverForm): void {
  try {
    window.localStorage.setItem(RECEIVER_STORAGE_KEY, JSON.stringify(form))
  } catch {
    // 存不了就算了：只是少一个「下次自动填好」的便利，不影响下单
  }
}

/**
 * 前端校验只为「立刻给出提示、少一次往返」，
 * 真正的规则以后端 orderService.normalizeReceiver 为准（两边保持一致）。
 */
function validate(form: ReceiverForm): FieldErrors {
  const errors: FieldErrors = {}
  const name = form.receiverName.trim()
  const address = form.receiverAddress.trim()

  if (!name) errors.receiverName = '请填写收货人'
  else if (name.length > 50) errors.receiverName = '收货人姓名不能超过 50 个字符'

  if (!PHONE_PATTERN.test(form.receiverPhone.trim())) {
    errors.receiverPhone = '请填写正确的 11 位手机号'
  }

  if (!address) errors.receiverAddress = '请填写收货地址'
  else if (address.length > 300) errors.receiverAddress = '收货地址不能超过 300 个字符'

  return errors
}

function inputClass(hasError: boolean): string {
  return hasError ? `${styles.input} ${styles.inputError}` : styles.input
}

/**
 * 确认订单页（/checkout）
 * ----------------------------------------------------------------------------
 * 数据来源与购物车一致：/api/cart 里「已勾选」的条目 + 服务端算好的选中合计。
 * 页面只负责收集收货信息，商品与金额都由服务端确认：
 *   POST /api/orders  →  后端在一个事务里写订单、写明细、扣库存、清购物车
 * 成功后跳订单详情（带 justCreated 标记，详情页显示「下单成功」）。
 *
 * 提交失败（库存不足、商品下架等）时直接把后端文案展示出来，
 * 购物车不会被改动，用户回购物车调整后可以再次提交。
 */
export default function CheckoutPage() {
  const navigate = useNavigate()

  const items = useCartStore(selectItems)
  const status = useCartStore(selectCartStatus)
  const loadError = useCartStore(selectLoadError)
  const selectedQuantity = useCartStore(selectSelectedQuantity)
  const selectedAmount = useCartStore(selectSelectedAmount)
  const totalQuantity = useCartStore(selectTotalQuantity)
  const fetchCart = useCartStore((state) => state.fetchCart)

  const [form, setForm] = useState<ReceiverForm>(loadReceiver)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)

  /** 只结算已勾选的商品，未勾选的留在购物车 */
  const selectedItems = useMemo(() => items.filter((item) => item.isSelected), [items])

  // 进入页面刷新一次购物车：直接从地址栏进来时也能拿到最新的勾选与金额
  useEffect(() => {
    void fetchCart()
  }, [fetchCart])

  useEffect(() => {
    if (!note) return undefined
    const timer = window.setTimeout(() => setNote(null), NOTE_DURATION)
    return () => window.clearTimeout(timer)
  }, [note])

  const updateField = useCallback((field: ReceiverField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    // 用户开始修改就把该字段的错误提示清掉
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
    // 上一轮的「请先补全收货信息」也跟着失效，避免填完还挂着旧提示
    setNote(null)
  }, [])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const nextErrors = validate(form)
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length > 0) {
        setNote({ text: '请先补全收货信息', tone: 'error' })
        return
      }

      setSubmitting(true)
      setNote(null)
      try {
        const order = await orderApi.create({
          receiverName: form.receiverName.trim(),
          receiverPhone: form.receiverPhone.trim(),
          receiverAddress: form.receiverAddress.trim(),
        })

        saveReceiver(form)
        // 下单成功后已勾选的条目已从购物车删除，刷新一下角标和购物车页
        void fetchCart()
        navigate(orderDetailPath(order.orderNo), { replace: true, state: { justCreated: true } })
      } catch (error) {
        setNote({
          text: error instanceof ApiError ? error.message : '下单失败，请稍后重试',
          tone: 'error',
        })
        setSubmitting(false)
      }
    },
    [form, fetchCart, navigate],
  )

  const isLoading = status === 'loading' && items.length === 0
  const hasError = status === 'error' && !isLoading
  const hasSelection = selectedItems.length > 0
  const showEmpty = !isLoading && !hasError && !hasSelection

  return (
    <div className={styles.page}>
      <PageHeader
        title="确认订单"
        to={ROUTES.cart}
        backLabel="返回购物车"
        right={hasSelection ? <span className={styles.count}>{selectedQuantity} 件</span> : null}
      />

      <form className={styles.body} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <main className={styles.main}>
          {isLoading && (
            <div className={styles.placeholder}>
              <span className={styles.icon}>
                <CartIcon size={26} />
              </span>
              <h2 className={styles.placeholderTitle}>正在准备结算…</h2>
              <p className={styles.placeholderText}>正在获取购物车里已勾选的商品</p>
            </div>
          )}

          {hasError && (
            <div className={styles.placeholder}>
              <span className={styles.icon}>
                <CartIcon size={26} />
              </span>
              <h2 className={styles.placeholderTitle}>购物车加载失败</h2>
              <p className={styles.placeholderText}>{loadError ?? '请稍后重试'}</p>
              <button type="button" className={styles.action} onClick={() => void fetchCart()}>
                重试
              </button>
            </div>
          )}

          {showEmpty && (
            <div className={styles.placeholder}>
              <span className={styles.icon}>
                <CartIcon size={26} />
              </span>
              <h2 className={styles.placeholderTitle}>没有可结算的商品</h2>
              <p className={styles.placeholderText}>
                回到购物车勾选想要购买的商品，再来这里提交订单。
              </p>
              <Link className={styles.action} to={ROUTES.cart}>
                去购物车
              </Link>
            </div>
          )}

          {hasSelection && !isLoading && !hasError && (
            <>
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>收货信息</h2>
                  <span className={styles.cardHint}>卖家将按此地址发货</span>
                </div>

                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span className={styles.label}>收货人</span>
                    <input
                      className={inputClass(Boolean(errors.receiverName))}
                      value={form.receiverName}
                      maxLength={50}
                      placeholder="请输入收货人姓名"
                      autoComplete="name"
                      onChange={(event) => updateField('receiverName', event.target.value)}
                    />
                    {errors.receiverName && (
                      <span className={styles.fieldError}>{errors.receiverName}</span>
                    )}
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>手机号</span>
                    <input
                      className={inputClass(Boolean(errors.receiverPhone))}
                      value={form.receiverPhone}
                      maxLength={11}
                      inputMode="tel"
                      placeholder="11 位手机号"
                      autoComplete="tel"
                      onChange={(event) => updateField('receiverPhone', event.target.value)}
                    />
                    {errors.receiverPhone && (
                      <span className={styles.fieldError}>{errors.receiverPhone}</span>
                    )}
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>收货地址</span>
                    <textarea
                      className={`${styles.input} ${styles.textarea} ${
                        errors.receiverAddress ? styles.inputError : ''
                      }`}
                      value={form.receiverAddress}
                      rows={3}
                      maxLength={300}
                      placeholder="省 / 市 / 区 + 详细地址"
                      onChange={(event) => updateField('receiverAddress', event.target.value)}
                    />
                    {errors.receiverAddress && (
                      <span className={styles.fieldError}>{errors.receiverAddress}</span>
                    )}
                  </label>
                </div>
              </section>

              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>商品清单</h2>
                  <span className={styles.cardHint}>共 {selectedQuantity} 件</span>
                </div>

                <ul className={styles.list}>
                  {selectedItems.map((item) => (
                    <li key={item.productId} className={styles.row}>
                      <div className={styles.thumbWrap}>
                        <ProductThumb
                          src={item.product.imageUrl}
                          alt={item.product.title}
                          seed={item.productId}
                          compact
                        />
                      </div>
                      <div className={styles.rowInfo}>
                        <h3 className={styles.rowTitle}>{item.product.title}</h3>
                        <p className={styles.rowMeta}>
                          ¥{formatPrice(item.product.price)} × {item.quantity}
                        </p>
                      </div>
                      <p className={styles.rowPrice}>¥{formatPrice(item.lineTotal)}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <section className={styles.card}>
                <div className={styles.amounts}>
                  <div className={styles.amountRow}>
                    <span>商品金额</span>
                    <span>¥{formatPrice(selectedAmount)}</span>
                  </div>
                  <div className={styles.amountRow}>
                    <span>运费</span>
                    <span>免运费</span>
                  </div>
                  <div className={`${styles.amountRow} ${styles.amountTotal}`}>
                    <span>应付合计</span>
                    <strong>¥{formatPrice(selectedAmount)}</strong>
                  </div>
                </div>
              </section>

              <p className={styles.tip}>
                提交后将按当前价格生成订单，可在订单详情页完成支付（演示环境为模拟支付）。
                未勾选的商品会继续留在购物车里。
              </p>

              {note && (
                <p
                  className={note.tone === 'error' ? styles.noteError : styles.note}
                  role="status"
                >
                  {note.text}
                </p>
              )}
            </>
          )}
        </main>

        {hasSelection && !isLoading && !hasError && (
          <div className={styles.bar}>
            <div className={styles.barTotal}>
              <span>合计</span>
              <strong>¥{formatPrice(selectedAmount)}</strong>
            </div>
            <button type="submit" className={styles.submit} disabled={submitting}>
              {submitting ? '提交中…' : '提交订单'}
            </button>
          </div>
        )}
      </form>

      <BottomNavBar cartCount={totalQuantity} />
    </div>
  )
}
