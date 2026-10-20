/**
 * 订单仓储层（Repository）
 * ----------------------------------------------------------------------------
 * 职责：只做数据访问 —— 组装 SQL、执行、把数据库行映射成实体。
 * 业务规则（收货信息校验、库存是否够、订单能不能取消）一律放在 service。
 *
 * 和其他仓储层不一样的地方：订单是「多表 + 必须同生共死」的写操作，
 * 所以这里额外提供了 transaction(work) —— 把事务的边界交给 service 控制：
 *
 *     await orderRepository.transaction(async (tx) => {
 *       const lines = await tx.lockSelectedCartLines(userId)   // 锁购物车行 + 商品行
 *       ...业务校验，不通过就 throw，整个事务回滚...
 *       const orderId = await tx.insertOrder(...)
 *       await tx.insertOrderItems(orderId, items)
 *       await tx.decreaseStock(...)
 *       await tx.deleteSelectedCartLines(userId)               // 清掉已下单的行
 *     })
 *
 * 这样「校验」和「写入」在同一个事务、同一把行锁里，不会出现
 * 「校验时库存够、写入时已经被别人买走」的超卖。
 *
 * 所有订单查询都带 user_id 条件，防止通过改订单号看别人的订单。
 */
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { pool } from '../config/database'
import type {
  CheckoutLineEntity,
  NewOrderEntity,
  NewOrderItemEntity,
  NewPaymentEntity,
  OrderEntity,
  OrderItemEntity,
  OrderStatus,
  OrderWithItemsEntity,
} from '../types/order.entity'

/* ============================== SQL ============================== */

/**
 * SQL 参数类型。
 * mysql2 的 execute 只接受 string/number/boolean/Date/Buffer/null 等标量，
 * 用 unknown[] 会通不过类型检查，这里直接收窄成实际会用到的几种。
 */
type SqlParam = string | number | null

const ORDER_COLUMNS = `
  id, order_no, user_id, total_amount, status,
  receiver_name, receiver_phone, receiver_address,
  created_at, updated_at
`

const ORDER_ITEM_COLUMNS = `
  id, order_id, product_id, product_title, product_image,
  quantity, unit_price, subtotal
`

/**
 * 结算时锁定「已勾选」的购物车行及其商品行。
 * ------------------------------------------------------------------
 * 必须 FOR UPDATE：锁住这些 cart_items 行和 products 行，直到事务结束，
 * 保证「校验库存 → 扣库存」之间不会插进第二个请求。
 * INNER JOIN 的副作用：商品被物理删除的脏行查不出来（也不会被结算），
 * 前端购物车列表同样不显示这类行，因此不影响下单流程。
 */
const LOCK_SELECTED_CART_LINES = `
  SELECT
    ci.id         AS cart_item_id,
    ci.product_id AS product_id,
    ci.quantity   AS quantity,
    p.title       AS title,
    p.price       AS price,
    p.stock       AS stock,
    p.status      AS status
  FROM cart_items ci
  INNER JOIN products p ON p.id = ci.product_id
  WHERE ci.user_id = ? AND ci.is_selected = 1
  ORDER BY ci.id ASC
  FOR UPDATE
`

/**
 * 商品封面图：一次取回所有商品的图，再在内存里按「sort_order 最小、同序取 id 最小」挑第一张。
 * 比每行一个相关子查询少打 N 次数据库，也不影响快照的正确性。
 */
const SELECT_COVER_IMAGES = `
  SELECT pi.product_id, pi.image_url
  FROM product_images pi
  WHERE pi.product_id IN (__IDS__)
  ORDER BY pi.product_id ASC, pi.sort_order ASC, pi.id ASC
`

const INSERT_ORDER = `
  INSERT INTO orders
    (order_no, user_id, total_amount, status, receiver_name, receiver_phone, receiver_address)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`

const INSERT_ORDER_ITEMS_HEAD = `
  INSERT INTO order_items
    (order_id, product_id, product_title, product_image, quantity, unit_price, subtotal)
  VALUES
`

/**
 * 扣库存：带 stock >= quantity 条件，影响行数为 0 就说明库存不够。
 * 这是最后一道防线 —— 即使前面的校验因为并发失效，也不会把库存扣成负数。
 */
const DECREASE_STOCK = `
  UPDATE products
  SET stock = stock - ?
  WHERE id = ? AND stock >= ?
`

const RESTORE_STOCK = `
  UPDATE products
  SET stock = stock + ?
  WHERE id = ?
`

const DELETE_SELECTED_CART_LINES = `
  DELETE FROM cart_items
  WHERE user_id = ? AND is_selected = 1
`

const LOCK_ORDER_BY_NO = `
  SELECT ${ORDER_COLUMNS}
  FROM orders
  WHERE user_id = ? AND order_no = ?
  LIMIT 1
  FOR UPDATE
`

const SELECT_ORDER_BY_NO = `
  SELECT ${ORDER_COLUMNS}
  FROM orders
  WHERE user_id = ? AND order_no = ?
  LIMIT 1
`

const SELECT_ORDERS_BY_USER = `
  SELECT ${ORDER_COLUMNS}
  FROM orders
  WHERE user_id = ?
`

const COUNT_ORDERS_BY_USER = `
  SELECT COUNT(*) AS total
  FROM orders
  WHERE user_id = ?
`

const UPDATE_STATUS = `
  UPDATE orders
  SET status = ?
  WHERE id = ? AND status = ?
`

const INSERT_PAYMENT = `
  INSERT INTO payments (order_id, pay_no, amount, status)
  VALUES (?, ?, ?, ?)
`

const SELECT_ORDER_ITEMS = `
  SELECT ${ORDER_ITEM_COLUMNS}
  FROM order_items
`

/* ============================ 行类型与映射 ============================ */

interface OrderRow extends RowDataPacket {
  id: number
  order_no: string
  user_id: number
  /** DECIMAL(10,2)：开了 decimalNumbers 是 number，否则可能是 string */
  total_amount: number | string
  status: string
  receiver_name: string | null
  receiver_phone: string | null
  receiver_address: string | null
  created_at: Date | string
  updated_at: Date | string
}

interface OrderItemRow extends RowDataPacket {
  id: number
  order_id: number
  product_id: number
  product_title: string
  product_image: string | null
  quantity: number
  unit_price: number | string
  subtotal: number | string
}

interface CheckoutLineRow extends RowDataPacket {
  cart_item_id: number
  product_id: number
  quantity: number
  title: string
  price: number | string
  stock: number
  status: number
}

interface CoverImageRow extends RowDataPacket {
  product_id: number
  image_url: string
}

interface CountRow extends RowDataPacket {
  total: number | string
}

/** 数据库里的状态值（字符串）不一定可信，收敛成联合类型前做一次白名单校验 */
const ORDER_STATUS_VALUES: readonly string[] = [
  'CREATED',
  'PAYED',
  'SHIPPED',
  'COMPLETED',
  'CANCELED',
]

function toOrderStatus(value: string): OrderStatus {
  // 理论上不会走到兜底分支；真出现了也当成 CREATED，避免把整条订单读崩
  return ORDER_STATUS_VALUES.includes(value) ? (value as OrderStatus) : 'CREATED'
}

function toNumber(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function mapOrderRow(row: OrderRow): OrderEntity {
  return {
    id: row.id,
    orderNo: row.order_no,
    userId: row.user_id,
    totalAmount: toNumber(row.total_amount),
    status: toOrderStatus(row.status),
    receiverName: row.receiver_name,
    receiverPhone: row.receiver_phone,
    receiverAddress: row.receiver_address,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  }
}

function mapOrderItemRow(row: OrderItemRow): OrderItemEntity {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    productTitle: row.product_title,
    productImage: row.product_image,
    quantity: row.quantity,
    unitPrice: toNumber(row.unit_price),
    subtotal: toNumber(row.subtotal),
  }
}

function mapCheckoutLineRow(row: CheckoutLineRow): CheckoutLineEntity {
  return {
    cartItemId: row.cart_item_id,
    productId: row.product_id,
    quantity: row.quantity,
    title: row.title,
    price: toNumber(row.price),
    stock: row.stock,
    status: row.status,
  }
}

/** 生成 `?, ?, ?` 这样的占位符串，用于 IN / 批量 INSERT */
function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}

/* ============================== 事务上下文 ============================== */

/**
 * 事务内可用的数据操作。
 * service 只通过这个接口读写，拿不到原始连接，也就不会误在事务外执行写操作。
 */
export interface OrderTransaction {
  /** 锁定该用户已勾选的购物车行（连同商品行），返回商品当前价格/库存/状态 */
  lockSelectedCartLines(userId: number): Promise<CheckoutLineEntity[]>
  /** 商品封面图：productId → imageUrl（没有图的商品不出现在 Map 里） */
  findCoverImages(productIds: number[]): Promise<Map<number, string>>
  /** 写订单主表，返回自增 id；order_no 冲突会抛 ER_DUP_ENTRY */
  insertOrder(order: NewOrderEntity): Promise<number>
  /** 批量写订单明细快照 */
  insertOrderItems(orderId: number, items: NewOrderItemEntity[]): Promise<void>
  /** 扣库存，库存不足（影响行数为 0）返回 false */
  decreaseStock(productId: number, quantity: number): Promise<boolean>
  /** 回滚库存（取消订单时用） */
  restoreStock(productId: number, quantity: number): Promise<void>
  /** 删除该用户已勾选的购物车行（下单成功后清理），返回删除条数 */
  deleteSelectedCartLines(userId: number): Promise<number>
  /** 锁定并读取一笔订单（取消/支付前用），不属于该用户时返回 null */
  lockOrder(userId: number, orderNo: string): Promise<OrderEntity | null>
  /** 读订单明细 */
  findOrderItems(orderId: number): Promise<OrderItemEntity[]>
  /** 状态流转：只有当前状态等于 from 才会更新，返回是否更新成功 */
  updateStatus(orderId: number, from: OrderStatus, to: OrderStatus): Promise<boolean>
  /** 写支付流水 */
  insertPayment(payment: NewPaymentEntity): Promise<number>
}

class OrderTransactionContext implements OrderTransaction {
  constructor(private readonly conn: PoolConnection) {}

  async lockSelectedCartLines(userId: number): Promise<CheckoutLineEntity[]> {
    const [rows] = await this.conn.execute<CheckoutLineRow[]>(LOCK_SELECTED_CART_LINES, [userId])
    return rows.map(mapCheckoutLineRow)
  }

  async findCoverImages(productIds: number[]): Promise<Map<number, string>> {
    const covers = new Map<number, string>()
    if (productIds.length === 0) return covers

    const sql = SELECT_COVER_IMAGES.replace('__IDS__', placeholders(productIds.length))
    const [rows] = await this.conn.execute<CoverImageRow[]>(sql, productIds)
    for (const row of rows) {
      // 已经按 sort_order / id 升序，同一个商品第一次出现的就是封面
      if (!covers.has(row.product_id)) covers.set(row.product_id, row.image_url)
    }
    return covers
  }

  async insertOrder(order: NewOrderEntity): Promise<number> {
    const [result] = await this.conn.execute<ResultSetHeader>(INSERT_ORDER, [
      order.orderNo,
      order.userId,
      order.totalAmount,
      order.status,
      order.receiverName,
      order.receiverPhone,
      order.receiverAddress,
    ])
    return result.insertId
  }

  async insertOrderItems(orderId: number, items: NewOrderItemEntity[]): Promise<void> {
    if (items.length === 0) return

    const values = items.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')
    const params: SqlParam[] = []
    for (const item of items) {
      params.push(
        orderId,
        item.productId,
        item.productTitle,
        item.productImage,
        item.quantity,
        item.unitPrice,
        item.subtotal,
      )
    }
    await this.conn.execute<ResultSetHeader>(`${INSERT_ORDER_ITEMS_HEAD}${values}`, params)
  }

  async decreaseStock(productId: number, quantity: number): Promise<boolean> {
    const [result] = await this.conn.execute<ResultSetHeader>(DECREASE_STOCK, [
      quantity,
      productId,
      quantity,
    ])
    return result.affectedRows > 0
  }

  async restoreStock(productId: number, quantity: number): Promise<void> {
    await this.conn.execute<ResultSetHeader>(RESTORE_STOCK, [quantity, productId])
  }

  async deleteSelectedCartLines(userId: number): Promise<number> {
    const [result] = await this.conn.execute<ResultSetHeader>(DELETE_SELECTED_CART_LINES, [userId])
    return result.affectedRows
  }

  async lockOrder(userId: number, orderNo: string): Promise<OrderEntity | null> {
    const [rows] = await this.conn.execute<OrderRow[]>(LOCK_ORDER_BY_NO, [userId, orderNo])
    const row = rows[0]
    return row ? mapOrderRow(row) : null
  }

  async findOrderItems(orderId: number): Promise<OrderItemEntity[]> {
    const [rows] = await this.conn.execute<OrderItemRow[]>(
      `${SELECT_ORDER_ITEMS} WHERE order_id = ? ORDER BY id ASC`,
      [orderId],
    )
    return rows.map(mapOrderItemRow)
  }

  async updateStatus(orderId: number, from: OrderStatus, to: OrderStatus): Promise<boolean> {
    const [result] = await this.conn.execute<ResultSetHeader>(UPDATE_STATUS, [to, orderId, from])
    return result.affectedRows > 0
  }

  async insertPayment(payment: NewPaymentEntity): Promise<number> {
    const [result] = await this.conn.execute<ResultSetHeader>(INSERT_PAYMENT, [
      payment.orderId,
      payment.payNo,
      payment.amount,
      payment.status,
    ])
    return result.insertId
  }
}

/* ============================== 仓储实现 ============================== */

export interface OrderListOptions {
  /** 订单状态筛选；undefined 表示全部 */
  status: OrderStatus | undefined
  /** 每页条数（service 已校验上限） */
  limit: number
  /** 偏移量 = (page - 1) * pageSize */
  offset: number
}

export class OrderRepository {
  constructor(private readonly db: Pool) {}

  /**
   * 在一个事务里执行 work：正常结束提交，抛异常回滚并原样抛出（业务错误不会被吞掉）。
   */
  async transaction<T>(work: (tx: OrderTransaction) => Promise<T>): Promise<T> {
    const connection = await this.db.getConnection()
    try {
      await connection.beginTransaction()
      const result = await work(new OrderTransactionContext(connection))
      await connection.commit()
      return result
    } catch (error) {
      try {
        await connection.rollback()
      } catch {
        // 连接已断开时回滚也会失败，忽略它，抛出原始错误更有价值
      }
      throw error
    } finally {
      connection.release()
    }
  }

  /** 按订单号查一笔订单（含明细）；不属于该用户时返回 null */
  async findOne(userId: number, orderNo: string): Promise<OrderWithItemsEntity | null> {
    const [rows] = await this.db.execute<OrderRow[]>(SELECT_ORDER_BY_NO, [userId, orderNo])
    const row = rows[0]
    if (!row) return null

    const items = await this.db
      .execute<OrderItemRow[]>(`${SELECT_ORDER_ITEMS} WHERE order_id = ? ORDER BY id ASC`, [row.id])
      .then(([itemRows]) => itemRows.map(mapOrderItemRow))

    return { ...mapOrderRow(row), items }
  }

  /**
   * 我的订单列表（按下单时间倒序）
   * ------------------------------------------------------------------
   * LIMIT / OFFSET 直接拼进 SQL：它们是 service 校验过的整数（不是用户原样字符串），
   * 不存在注入风险，同时避开部分 MySQL 版本对 LIMIT ? 预处理的支持差异。
   */
  async findByUser(
    userId: number,
    options: OrderListOptions,
  ): Promise<OrderWithItemsEntity[]> {
    const params: SqlParam[] = [userId]
    let sql = SELECT_ORDERS_BY_USER
    if (options.status !== undefined) {
      sql += ' AND status = ?'
      params.push(options.status)
    }
    sql += ` ORDER BY created_at DESC, id DESC LIMIT ${options.limit} OFFSET ${options.offset}`

    const [rows] = await this.db.execute<OrderRow[]>(sql, params)
    if (rows.length === 0) return []

    const orderIds = rows.map((row) => row.id)
    const itemsByOrder = await this.findItemsByOrderIds(orderIds)

    return rows.map((row) => {
      const order = mapOrderRow(row)
      return { ...order, items: itemsByOrder.get(order.id) ?? [] }
    })
  }

  /** 我的订单总数（配合分页器） */
  async countByUser(userId: number, status: OrderStatus | undefined): Promise<number> {
    const params: SqlParam[] = [userId]
    let sql = COUNT_ORDERS_BY_USER
    if (status !== undefined) {
      sql += ' AND status = ?'
      params.push(status)
    }

    const [rows] = await this.db.execute<CountRow[]>(sql, params)
    return toNumber(rows[0]?.total ?? 0)
  }

  /** 一次查回多笔订单的明细，按 orderId 分组，避免列表页 N+1 查询 */
  private async findItemsByOrderIds(orderIds: number[]): Promise<Map<number, OrderItemEntity[]>> {
    const grouped = new Map<number, OrderItemEntity[]>()
    if (orderIds.length === 0) return grouped

    const sql = `${SELECT_ORDER_ITEMS} WHERE order_id IN (${placeholders(orderIds.length)}) ORDER BY id ASC`
    const [rows] = await this.db.execute<OrderItemRow[]>(sql, orderIds)

    for (const row of rows) {
      const item = mapOrderItemRow(row)
      const list = grouped.get(item.orderId)
      if (list) list.push(item)
      else grouped.set(item.orderId, [item])
    }
    return grouped
  }
}

/** 默认实例：连接池来自 src/config/database.ts；单元测试可自行 new OrderRepository(mockPool) */
export const orderRepository = new OrderRepository(pool)
