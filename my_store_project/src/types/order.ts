/**
 * 订单接口类型
 * ----------------------------------------------------------------------------
 * 与后端 backend/src/types/order.vo.ts 一一对应（字段已用真实响应核对）：
 *   - 金额都是 number（元，两位小数），服务端已算好，前端不再累加；
 *   - 明细里只有下单时的快照（标题 / 图 / 单价 / 小计），不关联商品实时数据；
 *   - 状态用固定联合类型，配合 utils/orderStatus.ts 决定文案与配色。
 */

/** 订单状态（后端 orders.status） */
export type OrderStatus = 'CREATED' | 'PAYED' | 'SHIPPED' | 'COMPLETED' | 'CANCELED'

/** 订单明细（下单时的商品快照，只读） */
export interface OrderItemVO {
  /** order_items.id */
  id: number
  /** 商品 id，用于「再次购买」等后续功能 */
  productId: number
  /** 下单时的商品标题 */
  title: string
  /** 下单时的商品图，无图为 null */
  imageUrl: string | null
  /** 购买数量 */
  quantity: number
  /** 下单时单价（元） */
  unitPrice: number
  /** 小计（元） */
  subtotal: number
}

/** 一笔订单（下单响应 / 订单详情 / 列表项共用） */
export interface OrderVO {
  id: number
  /** 20 位订单号，详情页与接口都用它定位订单 */
  orderNo: string
  /** 订单总额（元） */
  totalAmount: number
  status: OrderStatus
  /** 状态中文（后端下发，前端只做兜底） */
  statusText: string
  receiverName: string | null
  receiverPhone: string | null
  receiverAddress: string | null
  /** 商品种类数 */
  itemCount: number
  /** 商品总件数 */
  totalQuantity: number
  items: OrderItemVO[]
  /** 下单时间（ISO 8601） */
  createdAt: string
  /** 最近更新时间（ISO 8601） */
  updatedAt: string
}

/** GET /api/orders —— 分页结果 */
export interface OrderListVO {
  list: OrderVO[]
  total: number
  page: number
  pageSize: number
}

/**
 * POST /api/orders —— 提交订单
 * 注意：没有金额、没有商品列表 —— 结算哪些商品、总共多少钱都由服务端算，
 * 否则用户可以改价下单。
 */
export interface CreateOrderPayload {
  receiverName: string
  receiverPhone: string
  receiverAddress: string
}
