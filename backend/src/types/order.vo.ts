/**
 * 订单模块 · 响应 VO（出参）
 * ----------------------------------------------------------------------------
 * 前端拿到 VO 直接渲染，不需要再算金额/件数：
 * 小计、总额、商品件数都由 service 算好后下发，避免前后端两套算法对不上。
 *
 * 字段命名与购物车 VO 保持一致（title / imageUrl / quantity / subtotal），
 * 前端可以把订单明细当成「只读的购物车条目」来复用商品行组件。
 *
 * 时间统一 ISO 8601 字符串；金额统一 number（元，两位小数）。
 */

/** 订单明细（一行商品快照） */
export interface OrderItemVO {
  /** order_items.id */
  id: number
  /** 商品 id，用于跳商品详情/再次购买 */
  productId: number
  /** 下单时的商品标题快照 */
  title: string
  /** 下单时的商品图快照，无图为 null */
  imageUrl: string | null
  /** 数量 */
  quantity: number
  /** 下单时单价（元） */
  unitPrice: number
  /** 小计 = 单价 × 数量（元） */
  subtotal: number
}

/** 一笔订单（下单响应、订单详情、订单列表项共用） */
export interface OrderVO {
  /** orders.id */
  id: number
  /** 订单号，对外展示与查询都用它 */
  orderNo: string
  /** 订单总金额（元） */
  totalAmount: number
  /** 订单状态码，前端据此决定按钮（待支付 / 取消 / 再次购买…） */
  status: string
  /** 状态中文名，前端直接展示，避免前后端各维护一份映射 */
  statusText: string
  /** 收货人 */
  receiverName: string | null
  /** 收货电话 */
  receiverPhone: string | null
  /** 收货地址 */
  receiverAddress: string | null
  /** 商品种类数（明细行数） */
  itemCount: number
  /** 商品总件数（各明细数量之和） */
  totalQuantity: number
  /** 明细列表 */
  items: OrderItemVO[]
  /** 下单时间（ISO 8601） */
  createdAt: string
  /** 最近更新时间（ISO 8601） */
  updatedAt: string
}

/**
 * GET /api/orders —— 我的订单列表
 * ----------------------------------------------------------------------------
 * 分页字段与请求参数同名，前端不用做字段转换。
 */
export interface OrderListVO {
  /** 当前页的订单 */
  list: OrderVO[]
  /** 符合筛选条件的订单总数（用于分页器） */
  total: number
  /** 当前页码，从 1 开始 */
  page: number
  /** 每页条数 */
  pageSize: number
}
