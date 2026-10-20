/**
 * 购物车状态（接口驱动）
 * ----------------------------------------------------------------------------
 * 数据来源是后端 /api/cart：服务端返回整车的 items + summary，
 * 每次写操作成功后直接用响替换本地状态 —— 合计金额、选中合计都由服务端算，
 * 前端不再自己维护一份，避免两边算不一致。
 *
 * 为什么去掉了 persist：购物车已经持久化在 MySQL 里，
 * 再往 localStorage 存一份会出现「本地有、服务端没有」的脏数据。
 */
import { create } from 'zustand'
import { ApiError } from '../api/client'
import { cartApi } from '../api/cart'
import type { CartItemVO, CartSummaryVO, CartVO } from '../types/cart'

const EMPTY_SUMMARY: CartSummaryVO = {
  itemCount: 0,
  totalQuantity: 0,
  totalAmount: 0,
  selectedCount: 0,
  selectedQuantity: 0,
  selectedAmount: 0,
  allSelected: false,
}

export type CartStatus = 'idle' | 'loading' | 'ready' | 'error'

interface CartState {
  items: CartItemVO[]
  summary: CartSummaryVO
  status: CartStatus
  /** 拉取失败时的可读提示（后端没启动、数据库挂了等） */
  loadError: string | null
  /** 是否有写操作正在提交，用于禁用按钮 */
  mutating: boolean
}

interface CartActions {
  /** 拉取购物车（页面挂载时调用） */
  fetchCart: () => Promise<void>
  addItem: (productId: number, quantity?: number) => Promise<void>
  setQuantity: (productId: number, quantity: number) => Promise<void>
  increaseQuantity: (productId: number, step?: number) => Promise<void>
  decreaseQuantity: (productId: number, step?: number) => Promise<void>
  toggleSelected: (productId: number) => Promise<void>
  setAllSelected: (isSelected: boolean) => Promise<void>
  removeItem: (productId: number) => Promise<void>
  clearCart: () => Promise<void>
}

export interface CartStore extends CartState, CartActions {}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

/**
 * 写操作串行队列。
 * 数量增减是「读当前值再提交」，若两个请求并发，第二次会基于旧值计算（少加一次）；
 * 排队后每个操作都能看到上一个操作的结果，行为符合直觉。
 */
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export const useCartStore = create<CartStore>()((set, get) => {
  const applyCart = (cart: CartVO): void => {
    set({ items: cart.items, summary: cart.summary, status: 'ready', loadError: null })
  }

  const runMutation = (task: () => Promise<CartVO>): Promise<void> =>
    enqueue(async () => {
      set({ mutating: true })
      try {
        applyCart(await task())
      } finally {
        set({ mutating: false })
      }
    })

  return {
    items: [],
    summary: EMPTY_SUMMARY,
    status: 'idle',
    loadError: null,
    mutating: false,

    fetchCart: async () => {
      set({ status: 'loading', loadError: null })
      try {
        applyCart(await cartApi.getCart())
      } catch (error) {
        set({ status: 'error', loadError: toMessage(error) })
      }
    },

    addItem: (productId, quantity = 1) =>
      runMutation(() => cartApi.addItem(productId, quantity)),

    setQuantity: (productId, quantity) =>
      runMutation(() => cartApi.updateQuantity(productId, quantity)),

    increaseQuantity: (productId, step = 1) => {
      const current = get().items.find((item) => item.productId === productId)
      if (!current) return Promise.resolve()
      return runMutation(() =>
        cartApi.updateQuantity(productId, current.quantity + Math.abs(step)),
      )
    },

    decreaseQuantity: (productId, step = 1) => {
      const current = get().items.find((item) => item.productId === productId)
      // 数量减到 0 会被后端当作移除，这里与按钮禁用条件保持一致（quantity <= 1 不再减）
      if (!current || current.quantity <= 1) return Promise.resolve()
      return runMutation(() =>
        cartApi.updateQuantity(productId, current.quantity - Math.abs(step)),
      )
    },

    toggleSelected: (productId) => {
      const current = get().items.find((item) => item.productId === productId)
      if (!current) return Promise.resolve()
      return runMutation(() => cartApi.updateSelected(productId, !current.isSelected))
    },

    setAllSelected: (isSelected) => runMutation(() => cartApi.updateAllSelected(isSelected)),

    removeItem: (productId) => runMutation(() => cartApi.removeItem(productId)),

    clearCart: () => runMutation(() => cartApi.clearCart()),
  }
})

/* ------------------------------ 派生数据 ------------------------------ */
/* 全部来自服务端 summary，组件订阅这些即可，不要在组件里重新累加。     */

export const selectItems = (state: CartStore): CartItemVO[] => state.items
export const selectSummary = (state: CartStore): CartSummaryVO => state.summary
export const selectCartStatus = (state: CartStore): CartStatus => state.status
export const selectLoadError = (state: CartStore): string | null => state.loadError
export const selectMutating = (state: CartStore): boolean => state.mutating

/** 商品总件数，用于底部导航角标 */
export const selectTotalQuantity = (state: CartStore): number => state.summary.totalQuantity
export const selectItemCount = (state: CartStore): number => state.summary.itemCount
export const selectTotalAmount = (state: CartStore): number => state.summary.totalAmount
/** 已选件数 */
export const selectSelectedQuantity = (state: CartStore): number =>
  state.summary.selectedQuantity
/** 选中合计 */
export const selectSelectedAmount = (state: CartStore): number => state.summary.selectedAmount
export const selectAllSelected = (state: CartStore): boolean => state.summary.allSelected

/** 指定商品在购物车里的数量，0 表示未加入 */
export const selectQuantityOf =
  (productId: number) =>
  (state: CartStore): number =>
    state.items.find((item) => item.productId === productId)?.quantity ?? 0
