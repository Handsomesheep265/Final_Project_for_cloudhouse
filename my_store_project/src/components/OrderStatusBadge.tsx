/**
 * 订单状态徽章
 * ----------------------------------------------------------------------------
 * 文案优先后端下发的 statusText，颜色基调由本地 status 决定（见 utils/orderStatus.ts）。
 * 列表和详情共用同一个徽章，保证两处颜色/圆角/字号完全一致。
 */
import type { OrderStatus } from '../types/order'
import { ORDER_STATUS_META, orderStatusText } from '../utils/orderStatus'
import styles from './OrderStatusBadge.module.css'

export interface OrderStatusBadgeProps {
  status: OrderStatus
  /** 后端下发的状态中文；不传时用本地兜底文案 */
  text?: string
  size?: 'sm' | 'md'
}

export default function OrderStatusBadge({ status, text, size = 'sm' }: OrderStatusBadgeProps) {
  const { tone } = ORDER_STATUS_META[status]
  const className = [styles.badge, styles[size], styles[tone]].join(' ')

  return <span className={className}>{orderStatusText(status, text)}</span>
}
