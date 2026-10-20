/**
 * 订单模块 · 实体（Entity）
 * ----------------------------------------------------------------------------
 * 与 docs/DATABASE_DESIGN.md 一一对应：
 *   3.6 orders（订单主表）、3.7 order_items（订单明细）、3.8 payments（支付流水）
 *
 * 命名与类型约定同购物车模块：
 *   - 数据库列名 snake_case，由 repositories 映射成这里的 camelCase；
 *   - DECIMAL(10,2) 用 number（连接池已开 decimalNumbers），DATETIME 用 Date；
 *   - 金额的「元/分」换算和四舍五入只在 service 里做。
 *
 * 为什么订单明细要冗余 product_title / product_image / unit_price：
 * 商品之后改价、改名、换图都不能影响历史订单，下单那一刻的值必须落库快照。
 */

/** orders.status 的取值（状态机：CREATED → PAYED → SHIPPED → COMPLETED，CREATED → CANCELED） */
export type OrderStatus = 'CREATED' | 'PAYED' | 'SHIPPED' | 'COMPLETED' | 'CANCELED'

/** payments.status 的取值 */
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED'

/** orders 表的一行 */
export interface OrderEntity {
  /** orders.id 主键 */
  id: number
  /** orders.order_no 订单号（唯一，对外展示用） */
  orderNo: string
  /** orders.user_id 下单用户 */
  userId: number
  /** orders.total_amount 订单总金额（下单时快照） */
  totalAmount: number
  /** orders.status 订单状态 */
  status: OrderStatus
  /** orders.receiver_name 收货人 */
  receiverName: string | null
  /** orders.receiver_phone 收货电话 */
  receiverPhone: string | null
  /** orders.receiver_address 收货地址 */
  receiverAddress: string | null
  /** orders.created_at */
  createdAt: Date
  /** orders.updated_at */
  updatedAt: Date
}

/** order_items 表的一行（下单时的商品快照） */
export interface OrderItemEntity {
  /** order_items.id */
  id: number
  /** order_items.order_id 所属订单 */
  orderId: number
  /** order_items.product_id 商品（商品被删除也保留这个 id 用于追溯） */
  productId: number
  /** order_items.product_title 商品标题快照 */
  productTitle: string
  /** order_items.product_image 商品图快照；下单时商品没图则为 null */
  productImage: string | null
  /** order_items.quantity 数量 */
  quantity: number
  /** order_items.unit_price 下单时单价 */
  unitPrice: number
  /** order_items.subtotal 小计 = unit_price × quantity */
  subtotal: number
}

/** 订单 + 明细（详情/列表共用的结构） */
export interface OrderWithItemsEntity extends OrderEntity {
  items: OrderItemEntity[]
}

/**
 * 结算时锁定的购物车行（cart_items JOIN products）
 * ----------------------------------------------------------------------------
 * 只在「下单事务」里出现：数量来自购物车，价格/库存/状态来自商品表当前值，
 * 商品标题与图用于写 order_items 快照。
 */
export interface CheckoutLineEntity {
  /** cart_items.id */
  cartItemId: number
  /** cart_items.product_id */
  productId: number
  /** cart_items.quantity 购买数量 */
  quantity: number
  /** products.title 商品标题 */
  title: string
  /** products.price 当前单价 */
  price: number
  /** products.stock 当前库存（校验数量用） */
  stock: number
  /** products.status：1 上架，0 下架 */
  status: number
}

/** 待写入的订单（id / 时间戳由数据库生成，不在这里） */
export interface NewOrderEntity {
  orderNo: string
  userId: number
  totalAmount: number
  status: OrderStatus
  receiverName: string
  receiverPhone: string
  receiverAddress: string
}

/** 待写入的订单明细 */
export interface NewOrderItemEntity {
  productId: number
  productTitle: string
  productImage: string | null
  quantity: number
  unitPrice: number
  subtotal: number
}

/** 待写入的支付流水 */
export interface NewPaymentEntity {
  orderId: number
  payNo: string
  amount: number
  status: PaymentStatus
}
