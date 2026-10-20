/**
 * 订单状态展示配置
 * ----------------------------------------------------------------------------
 * 后端会下发 statusText（中文），但颜色基调、筛选标签、状态说明只有前端能决定，
 * 所以在这里统一维护一份；页面组件不要再各写一份 switch。
 */
import type { OrderStatus } from '../types/order'

/** 徽章配色基调 */
export type OrderStatusTone = 'pending' | 'progress' | 'done' | 'muted'

interface OrderStatusMeta {
  /** 兜底文案（正常情况下用后端下发的 statusText） */
  label: string
  tone: OrderStatusTone
  /** 详情页状态卡里的一句话说明 */
  hint: string
}

export const ORDER_STATUS_META: Record<OrderStatus, OrderStatusMeta> = {
  CREATED: { label: '待支付', tone: 'pending', hint: '订单已创建，请尽快完成支付。' },
  PAYED: { label: '待发货', tone: 'progress', hint: '支付成功，卖家正在打包，请耐心等待。' },
  SHIPPED: { label: '待收货', tone: 'progress', hint: '包裹已发出，注意查收物流信息。' },
  COMPLETED: { label: '已完成', tone: 'done', hint: '订单已完成，感谢你的支持。' },
  CANCELED: { label: '已取消', tone: 'muted', hint: '订单已取消，占用的库存已退回。' },
}

/** 订单列表顶部筛选项（ALL 表示不筛状态） */
export type OrderFilterValue = OrderStatus | 'ALL'

export const ORDER_FILTERS: ReadonlyArray<{ value: OrderFilterValue; label: string }> = [
  { value: 'ALL', label: '全部' },
  { value: 'CREATED', label: '待支付' },
  { value: 'PAYED', label: '待发货' },
  { value: 'SHIPPED', label: '待收货' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELED', label: '已取消' },
]

/** 只有「待支付」的订单能支付 / 取消，和后端状态机保持一致 */
export function canPay(status: OrderStatus): boolean {
  return status === 'CREATED'
}

export function canCancel(status: OrderStatus): boolean {
  return status === 'CREATED'
}

/** 状态文案：优先后端下发的 statusText，缺失时用本地兜底 */
export function orderStatusText(status: OrderStatus, statusText?: string): string {
  return statusText || ORDER_STATUS_META[status].label
}
