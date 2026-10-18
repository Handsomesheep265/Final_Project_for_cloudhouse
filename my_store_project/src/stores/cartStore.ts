import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem, Product } from '../types'

/**
 * 购物车状态（对应 docs/DATABASE_DESIGN.md 的 cart_items 表）
 * ----------------------------------------------------------------------------
 * 只做本地状态与规则校验，不关心接口。后端接好后：
 *   1. 进入页面时用 replaceItems() 灌入 GET /api/cart 的结果；
 *   2. 各 action 内部再补一次调用（POST/PUT/DELETE /api/cart）；
 *   3. 拿到数据库自增 id 后，把负数 id 的本地行替换掉。
 * 在此之前用 persist 落本地存储，刷新页面购物车不会丢。
 */

/** 未登录时使用的演示用户 id（注册登录功能接入后由真实用户替换） */
export const DEMO_USER_ID = 1

/** localStorage 键名 */
const CART_STORAGE_KEY = 'journal-bazaar:cart'

/**
 * 本地新增行的 id：负数表示“还没同步到后端”。
 * 直接取当前最小值再减一，刷新后（persist 恢复）也不会和历史 id 撞车。
 */
function createLocalId(items: CartItem[]): number {
  return Math.min(0, ...items.map((item) => item.id)) - 1
}

/** 数量必须落在 [0, 库存] 区间内，且为整数 */
function clampQuantity(quantity: number, stock: number): number {
  const max = Math.max(0, Math.trunc(stock))
  const value = Number.isFinite(quantity) ? Math.trunc(quantity) : 0
  return Math.max(0, Math.min(value, max))
}

function nowIso(): string {
  return new Date().toISOString()
}

export interface CartActions {
  /** 加入购物车；同一商品重复加入会合并数量，quantity 默认 1，超出库存会被截断 */
  addItem: (product: Product, quantity?: number) => void
  /** 直接设置数量；设为 0 或负数等于移除 */
  setQuantity: (productId: number, quantity: number) => void
  increaseQuantity: (productId: number, step?: number) => void
  decreaseQuantity: (productId: number, step?: number) => void
  /** 移除某个商品 */
  removeItem: (productId: number) => void
  /** 清空购物车 */
  clearCart: () => void
  /** 用后端返回的数据整体覆盖（进入购物车页时调用） */
  replaceItems: (items: CartItem[]) => void
  /** 切换某件商品的勾选状态（对应 cart_items.is_selected） */
  toggleSelected: (productId: number) => void
  /** 指定勾选状态 */
  setSelected: (productId: number, selected: boolean) => void
  /** 全选 / 取消全选 */
  setAllSelected: (selected: boolean) => void
}

export interface CartStore extends CartActions {
  /** 当前用户 id，对应 cart_items.user_id */
  userId: number
  /** 购物车条目，顺序 = 加入时间顺序 */
  items: CartItem[]
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      userId: DEMO_USER_ID,
      items: [],

      addItem: (product, quantity = 1) => {
        // 售罄商品不进入购物车
        if (product.stock <= 0) return
        const step = Math.max(1, Math.trunc(quantity))

        set((state) => {
          const timestamp = nowIso()
          const existing = state.items.find((item) => item.productId === product.id)

          if (existing) {
            return {
              items: state.items.map((item) =>
                item.productId === product.id
                  ? {
                      ...item,
                      quantity: clampQuantity(item.quantity + step, product.stock),
                      updatedAt: timestamp,
                      // 顺带刷新快照，避免价格/库存变更后仍用旧值
                      product,
                      // 保留原有的勾选状态，不因为再次加购把用户去掉的勾选又打上
                    }
                  : item,
              ),
            }
          }

          const newItem: CartItem = {
            id: createLocalId(state.items),
            userId: state.userId,
            productId: product.id,
            quantity: clampQuantity(step, product.stock),
            // 新加入的默认勾选，与数据库 is_selected DEFAULT 1 保持一致
            isSelected: true,
            createdAt: timestamp,
            updatedAt: timestamp,
            product,
          }

          return { items: [...state.items, newItem] }
        })
      },

      setQuantity: (productId, quantity) => {
        set((state) => ({
          items: state.items.flatMap((item) => {
            if (item.productId !== productId) return [item]
            const nextQuantity = clampQuantity(quantity, item.product.stock)
            // 数量减到 0 视为删除，与 cart_items 的删除语义保持一致
            if (nextQuantity <= 0) return []
            return [{ ...item, quantity: nextQuantity, updatedAt: nowIso() }]
          }),
        }))
      },

      increaseQuantity: (productId, step = 1) => {
        const current = get().items.find((item) => item.productId === productId)
        if (!current) return
        get().setQuantity(productId, current.quantity + Math.abs(Math.trunc(step)))
      },

      decreaseQuantity: (productId, step = 1) => {
        const current = get().items.find((item) => item.productId === productId)
        if (!current) return
        get().setQuantity(productId, current.quantity - Math.abs(Math.trunc(step)))
      },

      removeItem: (productId) => {
        set((state) => ({ items: state.items.filter((item) => item.productId !== productId) }))
      },

      clearCart: () => {
        set({ items: [] })
      },

      replaceItems: (items) => {
        set({ items })
      },

      toggleSelected: (productId) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.productId === productId
              ? { ...item, isSelected: !item.isSelected, updatedAt: nowIso() }
              : item,
          ),
        }))
      },

      setSelected: (productId, selected) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.productId === productId && item.isSelected !== selected
              ? { ...item, isSelected: selected, updatedAt: nowIso() }
              : item,
          ),
        }))
      },

      setAllSelected: (selected) => {
        set((state) => ({
          items: state.items.every((item) => item.isSelected === selected)
            ? state.items
            : state.items.map((item) =>
                item.isSelected === selected
                  ? item
                  : { ...item, isSelected: selected, updatedAt: nowIso() },
              ),
        }))
      },
    }),
    {
      name: CART_STORAGE_KEY,
      version: 1,
      // 只持久化数据，函数（actions）由 store 自身提供
      partialize: (state) => ({ userId: state.userId, items: state.items }),
    },
  ),
)

/* ------------------------------ 派生数据 ------------------------------ */
/* 不放进 state，避免多一处需要同步的冗余字段；组件里按需订阅即可。      */

/** 金额按分四舍五入，避免 39.9 * 3 之类的浮点尾巴 */
function roundToCents(total: number): number {
  return Math.round(total * 100) / 100
}

/** 购物车条目数（不同商品个数） */
export const selectItemCount = (state: CartStore): number => state.items.length

/** 商品总件数（各条目数量之和），用于底部导航角标 */
export const selectTotalQuantity = (state: CartStore): number =>
  state.items.reduce((total, item) => total + item.quantity, 0)

/** 合计金额（元）：购物车里所有商品，不区分是否勾选 */
export const selectTotalAmount = (state: CartStore): number =>
  roundToCents(
    state.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
  )

/** 已勾选的商品件数（数量之和） */
export const selectSelectedQuantity = (state: CartStore): number =>
  state.items.reduce((total, item) => (item.isSelected ? total + item.quantity : total), 0)

/** 选中合计（元）：只累加已勾选的商品，用于购物车结算栏 */
export const selectSelectedAmount = (state: CartStore): number =>
  roundToCents(
    state.items.reduce(
      (sum, item) => (item.isSelected ? sum + item.product.price * item.quantity : sum),
      0,
    ),
  )

/** 已勾选的商品种类数 */
export const selectSelectedCount = (state: CartStore): number =>
  state.items.reduce((count, item) => (item.isSelected ? count + 1 : count), 0)

/** 是否处于“全选”状态（购物车为空时视为未全选） */
export const selectAllSelected = (state: CartStore): boolean =>
  state.items.length > 0 && state.items.every((item) => item.isSelected)

export const selectIsEmpty = (state: CartStore): boolean => state.items.length === 0

/** 指定商品在购物车里的数量，0 表示未加入 */
export const selectQuantityOf =
  (productId: number) =>
  (state: CartStore): number =>
    state.items.find((item) => item.productId === productId)?.quantity ?? 0
