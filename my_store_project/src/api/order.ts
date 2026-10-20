/**
 * 订单接口
 * ----------------------------------------------------------------------------
 * 与 backend/src/routes/orderRoutes.ts 一一对应：
 *   POST   /api/orders                    结算下单（返回新订单）
 *   GET    /api/orders?page&pageSize&status 我的订单
 *   GET    /api/orders/:orderNo           订单详情
 *   POST   /api/orders/:orderNo/cancel    取消订单
 *   POST   /api/orders/:orderNo/pay       支付（后端为模拟支付）
 *
 * 写操作都返回「这笔订单的最新状态」，前端直接用它替换列表/详情里的同一单，
 * 不需要再额外拉一次详情。
 */
import { request } from './client'
import type { CreateOrderPayload, OrderListVO, OrderStatus, OrderVO } from '../types/order'

const ORDER_PATH = '/api/orders'

export interface OrderListParams {
  /** 页码，从 1 开始 */
  page?: number
  /** 每页条数（后端上限 50） */
  pageSize?: number
  /** 状态筛选，不传表示全部 */
  status?: OrderStatus
}

/** 把分页参数拼成查询串；空参数不写进去，避免 `?status=undefined` */
function toQuery(params: OrderListParams): string {
  const search = new URLSearchParams()
  if (params.page !== undefined) search.set('page', String(params.page))
  if (params.pageSize !== undefined) search.set('pageSize', String(params.pageSize))
  if (params.status !== undefined) search.set('status', params.status)

  const query = search.toString()
  return query ? `?${query}` : ''
}

export const orderApi = {
  /** POST /api/orders —— 把购物车已勾选的行转成订单 */
  create: (payload: CreateOrderPayload) =>
    request<OrderVO>(ORDER_PATH, { method: 'POST', body: payload }),

  /** GET /api/orders —— 我的订单 */
  list: (params: OrderListParams = {}) => request<OrderListVO>(`${ORDER_PATH}${toQuery(params)}`),

  /** GET /api/orders/:orderNo */
  get: (orderNo: string) => request<OrderVO>(`${ORDER_PATH}/${encodeURIComponent(orderNo)}`),

  /** POST /api/orders/:orderNo/cancel —— 仅待支付可取消 */
  cancel: (orderNo: string) =>
    request<OrderVO>(`${ORDER_PATH}/${encodeURIComponent(orderNo)}/cancel`, { method: 'POST' }),

  /** POST /api/orders/:orderNo/pay —— 模拟支付 */
  pay: (orderNo: string) =>
    request<OrderVO>(`${ORDER_PATH}/${encodeURIComponent(orderNo)}/pay`, { method: 'POST' }),
}
