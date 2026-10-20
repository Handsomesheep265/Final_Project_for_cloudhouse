/**
 * 购物车接口
 * ----------------------------------------------------------------------------
 * 所有写操作后端都会返回「整车数据」（items + summary），
 * 所以前端调用成功后直接整体替换 store，不需要自己算合计。
 */
import { request } from './client'
import type { CartVO } from '../types/cart'

const CART_PATH = '/api/cart'

export const cartApi = {
  /** GET /api/cart */
  getCart: () => request<CartVO>(CART_PATH),

  /** POST /api/cart/items */
  addItem: (productId: number, quantity = 1) =>
    request<CartVO>(`${CART_PATH}/items`, {
      method: 'POST',
      body: { productId, quantity },
    }),

  /** PATCH /api/cart/items/:productId */
  updateQuantity: (productId: number, quantity: number) =>
    request<CartVO>(`${CART_PATH}/items/${productId}`, {
      method: 'PATCH',
      body: { quantity },
    }),

  /** PATCH /api/cart/items/:productId/selected */
  updateSelected: (productId: number, isSelected: boolean) =>
    request<CartVO>(`${CART_PATH}/items/${productId}/selected`, {
      method: 'PATCH',
      body: { isSelected },
    }),

  /** PATCH /api/cart/selected —— 全选 / 取消全选 */
  updateAllSelected: (isSelected: boolean) =>
    request<CartVO>(`${CART_PATH}/selected`, {
      method: 'PATCH',
      body: { isSelected },
    }),

  /** DELETE /api/cart/items/:productId */
  removeItem: (productId: number) =>
    request<CartVO>(`${CART_PATH}/items/${productId}`, { method: 'DELETE' }),

  /** DELETE /api/cart */
  clearCart: () => request<CartVO>(CART_PATH, { method: 'DELETE' }),
}
