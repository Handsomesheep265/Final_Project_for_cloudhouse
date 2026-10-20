/**
 * 订单服务层（Service）
 * ----------------------------------------------------------------------------
 * 结算的业务规则全在这里：
 *   1. 校验收货信息（收货人 / 手机号 / 地址）；
 *   2. 只结算「已勾选」的购物车行，逐件校验上架状态与库存；
 *   3. 金额一律服务端按商品当前价格重算（前端传什么价都不看）；
 *   4. 生成订单号，写订单 + 明细快照 + 扣库存 + 清购物车，一个事务；
 *   5. 订单状态流转：CREATED → PAYED / CANCELED（取消要回滚库存）。
 *
 * 不负责：SQL 与行映射（repositories）、HTTP 状态码与响应包装（controllers）。
 *
 * 事务边界在 service 里显式包住「校验 + 写入」，见 repo.transaction(work)：
 * 校验用的是 FOR UPDATE 锁住的行，所以并发下单不会超卖。
 */
import { randomInt } from 'node:crypto'
import type { OrderTransaction } from '../repositories/orderRepositories'
import { orderRepository, OrderRepository } from '../repositories/orderRepositories'
import type { CreateOrderDTO, OrderListQueryDTO } from '../types/order.dto'
import type {
  NewOrderEntity,
  NewOrderItemEntity,
  OrderStatus,
  OrderWithItemsEntity,
} from '../types/order.entity'
import type { OrderItemVO, OrderListVO, OrderVO } from '../types/order.vo'

/* ============================== 业务错误 ============================== */

/**
 * 错误码分段（与购物车模块保持一致，不重复占用）：
 *   400xx 参数问题   404xx 资源不存在   409xx 状态冲突
 * controller 只做转发，HTTP 状态码也挂在这里。
 */
const ORDER_ERROR_SPECS = {
  invalidUserId: { code: 40000, httpStatus: 400, message: '用户信息缺失或非法' },
  emptySelection: { code: 40001, httpStatus: 400, message: '请先勾选要结算的商品' },
  invalidReceiver: { code: 40002, httpStatus: 400, message: '收货信息不完整' },
  invalidOrderNo: { code: 40003, httpStatus: 400, message: '订单号不合法' },
  invalidQuery: { code: 40004, httpStatus: 400, message: '查询参数不合法' },
  orderNotFound: { code: 40403, httpStatus: 404, message: '订单不存在' },
  productOffShelf: { code: 40911, httpStatus: 409, message: '商品已下架' },
  productSoldOut: { code: 40912, httpStatus: 409, message: '商品已售罄' },
  stockNotEnough: { code: 40913, httpStatus: 409, message: '库存不足' },
  statusConflict: { code: 40914, httpStatus: 409, message: '订单当前状态不允许该操作' },
  createFailed: { code: 40915, httpStatus: 409, message: '下单失败，请稍后重试' },
} as const

export type OrderErrorSpec = (typeof ORDER_ERROR_SPECS)[keyof typeof ORDER_ERROR_SPECS]

/** 订单业务异常：携带业务码与建议的 HTTP 状态码，由统一错误中间件转成响应体 */
export class OrderError extends Error {
  readonly code: number
  readonly httpStatus: number

  constructor(spec: OrderErrorSpec, detail?: string) {
    super(detail ?? spec.message)
    this.name = 'OrderError'
    this.code = spec.code
    this.httpStatus = spec.httpStatus
  }
}

/** 供 controller / 测试引用错误码，避免散落魔法数字 */
export const ORDER_ERRORS = ORDER_ERROR_SPECS

/* ============================== 常量 ============================== */

/**
 * 状态 → 中文，前端直接展示 statusText。
 * 放服务端维护一份，避免「订单列表里写待支付、详情里写未付款」这种不一致。
 */
const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  CREATED: '待支付',
  PAYED: '待发货',
  SHIPPED: '待收货',
  COMPLETED: '已完成',
  CANCELED: '已取消',
}

/** 允许出现在查询参数里的状态值 */
const ORDER_STATUS_VALUES: readonly OrderStatus[] = [
  'CREATED',
  'PAYED',
  'SHIPPED',
  'COMPLETED',
  'CANCELED',
]

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50

/** 订单号：14 位时间戳 + 6 位随机数，见 generateOrderNo */
const ORDER_NO_PATTERN = /^[A-Za-z0-9]{6,64}$/

/** 中国大陆手机号：1 开头、第二位 3-9、共 11 位 */
const PHONE_PATTERN = /^1[3-9]\d{9}$/

/** 订单号唯一约束冲突时的重试次数 */
const ORDER_NO_MAX_ATTEMPTS = 3

/* ============================== 工具函数 ============================== */

/** 金额按分四舍五入，避免 15.5 * 3 出现 46.50000000000001 */
function roundToCents(value: number): number {
  return Math.round(value * 100) / 100
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function assertUserId(userId: number): void {
  if (!isPositiveInteger(userId)) {
    throw new OrderError(ORDER_ERROR_SPECS.invalidUserId)
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * 生成订单号：yyyyMMddHHmmss + 6 位随机数（20 位，纯数字）。
 * ------------------------------------------------------------------
 * 为什么不用自增 id 当订单号：对外暴露「第几单」既不安全也不好看。
 * 时间戳保证可读、可按日归档；随机段保证同一秒内的并发订单不撞车。
 * 真撞上了（概率 1/1000000）由 orders.uk_order_no 兜底，service 会重试。
 */
function generateOrderNo(now: Date): string {
  const stamp = [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
    pad2(now.getHours()),
    pad2(now.getMinutes()),
    pad2(now.getSeconds()),
  ].join('')
  const random = String(randomInt(0, 1_000_000)).padStart(6, '0')
  return `${stamp}${random}`
}

/** mysql2 抛的唯一键冲突：重试一次换个订单号就好 */
function isDuplicateEntryError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, errno } = error as { code?: unknown; errno?: unknown }
  return code === 'ER_DUP_ENTRY' || errno === 1062
}

/** 校验并整理收货信息，返回去掉首尾空白的值 */
function normalizeReceiver(dto: CreateOrderDTO): {
  receiverName: string
  receiverPhone: string
  receiverAddress: string
} {
  const receiverName = typeof dto.receiverName === 'string' ? dto.receiverName.trim() : ''
  const receiverPhone = typeof dto.receiverPhone === 'string' ? dto.receiverPhone.trim() : ''
  const receiverAddress =
    typeof dto.receiverAddress === 'string' ? dto.receiverAddress.trim() : ''

  if (receiverName.length === 0) {
    throw new OrderError(ORDER_ERROR_SPECS.invalidReceiver, '请填写收货人')
  }
  if (receiverName.length > 50) {
    throw new OrderError(ORDER_ERROR_SPECS.invalidReceiver, '收货人姓名不能超过 50 个字符')
  }
  if (!PHONE_PATTERN.test(receiverPhone)) {
    throw new OrderError(ORDER_ERROR_SPECS.invalidReceiver, '请填写正确的 11 位手机号')
  }
  if (receiverAddress.length === 0) {
    throw new OrderError(ORDER_ERROR_SPECS.invalidReceiver, '请填写收货地址')
  }
  if (receiverAddress.length > 300) {
    throw new OrderError(ORDER_ERROR_SPECS.invalidReceiver, '收货地址不能超过 300 个字符')
  }

  return { receiverName, receiverPhone, receiverAddress }
}

/** 路径里的订单号：只允许字母数字，避免把怪字符带进 SQL 参数（虽然用的是预处理） */
function normalizeOrderNo(raw: string): string {
  const orderNo = typeof raw === 'string' ? raw.trim() : ''
  if (!ORDER_NO_PATTERN.test(orderNo)) {
    throw new OrderError(ORDER_ERROR_SPECS.invalidOrderNo, `订单号不合法：${orderNo || '(空)'}`)
  }
  return orderNo
}

/** 解析分页参数：不传用默认值，传了就必须是正整数 */
function parsePositiveInt(raw: string | undefined, fallback: number, field: string): number {
  if (raw === undefined || raw === '') return fallback

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new OrderError(ORDER_ERROR_SPECS.invalidQuery, `${field} 必须是正整数`)
  }
  return parsed
}

/** 解析状态筛选：不传表示全部，传了必须在白名单里 */
function parseStatus(raw: string | undefined): OrderStatus | undefined {
  if (raw === undefined || raw === '') return undefined
  if (!ORDER_STATUS_VALUES.includes(raw as OrderStatus)) {
    throw new OrderError(ORDER_ERROR_SPECS.invalidQuery, `订单状态不合法：${raw}`)
  }
  return raw as OrderStatus
}

/** 实体 → VO */
function toOrderVO(order: OrderWithItemsEntity): OrderVO {
  const items: OrderItemVO[] = order.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    title: item.productTitle,
    imageUrl: item.productImage,
    quantity: item.quantity,
    unitPrice: roundToCents(item.unitPrice),
    subtotal: roundToCents(item.subtotal),
  }))

  return {
    id: order.id,
    orderNo: order.orderNo,
    totalAmount: roundToCents(order.totalAmount),
    status: order.status,
    statusText: ORDER_STATUS_TEXT[order.status],
    receiverName: order.receiverName,
    receiverPhone: order.receiverPhone,
    receiverAddress: order.receiverAddress,
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }
}

/* ============================== 服务实现 ============================== */

export class OrderService {
  constructor(private readonly repo: OrderRepository) {}

  /**
   * 结算下单：购物车已勾选的行 → 一笔订单
   * ------------------------------------------------------------------
   * 整段逻辑在一个事务里：
   *   锁行 → 校验 → 写订单 → 写明细快照 → 扣库存 → 清购物车 → 提交
   * 任何一步抛 OrderError 都会回滚，用户看到的只有错误提示，数据不会留半截。
   *
   * @returns 新订单详情（含明细），前端可直接跳到订单详情页
   */
  async createOrder(userId: number, dto: CreateOrderDTO): Promise<OrderVO> {
    assertUserId(userId)
    const receiver = normalizeReceiver(dto)

    const orderNo = await this.repo.transaction(async (tx) => {
      const lines = await tx.lockSelectedCartLines(userId)
      if (lines.length === 0) {
        throw new OrderError(ORDER_ERROR_SPECS.emptySelection)
      }

      // 逐件校验：下架、售罄、库存不足都给明确的商品名，方便前端提示
      for (const line of lines) {
        if (line.status !== 1) {
          throw new OrderError(
            ORDER_ERROR_SPECS.productOffShelf,
            `「${line.title}」已下架，请先从购物车移除`,
          )
        }
        if (line.stock <= 0) {
          throw new OrderError(
            ORDER_ERROR_SPECS.productSoldOut,
            `「${line.title}」已售罄，请先从购物车移除`,
          )
        }
        if (line.quantity > line.stock) {
          throw new OrderError(
            ORDER_ERROR_SPECS.stockNotEnough,
            `「${line.title}」库存仅剩 ${line.stock} 件，请调整数量`,
          )
        }
      }

      const covers = await tx.findCoverImages(lines.map((line) => line.productId))
      const items: NewOrderItemEntity[] = lines.map((line) => {
        // 单价按商品「当前」价格快照，不用购物车里的旧值
        const unitPrice = roundToCents(line.price)
        return {
          productId: line.productId,
          productTitle: line.title,
          productImage: covers.get(line.productId) ?? null,
          quantity: line.quantity,
          unitPrice,
          subtotal: roundToCents(unitPrice * line.quantity),
        }
      })

      // 总额由服务端把各行小计加起来，前端传的金额一律不采信
      const totalAmount = roundToCents(items.reduce((sum, item) => sum + item.subtotal, 0))

      const created = await this.insertOrderWithRetry(tx, {
        ...receiver,
        userId,
        totalAmount,
      })

      await tx.insertOrderItems(created.orderId, items)

      // 锁内再扣一次库存：带 stock >= quantity 条件，兜住任何并发下的超卖
      for (const line of lines) {
        const decreased = await tx.decreaseStock(line.productId, line.quantity)
        if (!decreased) {
          throw new OrderError(
            ORDER_ERROR_SPECS.stockNotEnough,
            `「${line.title}」库存不足，请调整数量`,
          )
        }
      }

      // 只清掉已勾选的行；没勾选的仍留在购物车，用户可以继续结算
      await tx.deleteSelectedCartLines(userId)

      return created.orderNo
    })

    // 事务外再读一次：拿到数据库生成的主键与时间戳，保证响应与实际落库一致
    return this.getOrder(userId, orderNo)
  }

  /** 我的订单：分页 + 按状态筛选 */
  async listOrders(userId: number, query: OrderListQueryDTO): Promise<OrderListVO> {
    assertUserId(userId)

    const page = parsePositiveInt(query.page, DEFAULT_PAGE, 'page')
    const rawPageSize = parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE, 'pageSize')
    // 上限截断而不是报错：pageSize=1000 时给 50 条，前端分页器不会崩
    const pageSize = Math.min(rawPageSize, MAX_PAGE_SIZE)
    const status = parseStatus(query.status)

    const [list, total] = await Promise.all([
      this.repo.findByUser(userId, { status, limit: pageSize, offset: (page - 1) * pageSize }),
      this.repo.countByUser(userId, status),
    ])

    return { list: list.map(toOrderVO), total, page, pageSize }
  }

  /** 订单详情（按订单号 + 当前用户查，别人的订单一律当作不存在） */
  async getOrder(userId: number, orderNo: string): Promise<OrderVO> {
    assertUserId(userId)
    const normalized = normalizeOrderNo(orderNo)

    const order = await this.repo.findOne(userId, normalized)
    if (!order) {
      throw new OrderError(ORDER_ERROR_SPECS.orderNotFound)
    }
    return toOrderVO(order)
  }

  /**
   * 取消订单：仅「待支付」可取消，并把下单时扣掉的库存还回去。
   * 已支付的订单要走退款流程（这里没实现，直接报状态冲突）。
   */
  async cancelOrder(userId: number, orderNo: string): Promise<OrderVO> {
    assertUserId(userId)
    const normalized = normalizeOrderNo(orderNo)

    await this.repo.transaction(async (tx) => {
      const order = await tx.lockOrder(userId, normalized)
      if (!order) {
        throw new OrderError(ORDER_ERROR_SPECS.orderNotFound)
      }
      if (order.status !== 'CREATED') {
        throw new OrderError(
          ORDER_ERROR_SPECS.statusConflict,
          `订单当前状态为「${ORDER_STATUS_TEXT[order.status]}」，不能取消`,
        )
      }

      const items = await tx.findOrderItems(order.id)
      for (const item of items) {
        await tx.restoreStock(item.productId, item.quantity)
      }

      const updated = await tx.updateStatus(order.id, 'CREATED', 'CANCELED')
      if (!updated) {
        throw new OrderError(ORDER_ERROR_SPECS.statusConflict)
      }
    })

    return this.getOrder(userId, normalized)
  }

  /**
   * 支付（模拟）
   * ------------------------------------------------------------------
   * 真实项目这里是「调起支付 → 第三方回调 → 验签 → 写流水」，
   * 本地没有支付渠道，直接写一条 SUCCESS 流水把订单推进到「待发货」，
   * 目的是让前端能走完「下单 → 支付 → 查看订单」的完整链路。
   * TODO(pay): 接入真实支付时，流水状态先 PENDING，由回调改成 SUCCESS。
   */
  async payOrder(userId: number, orderNo: string): Promise<OrderVO> {
    assertUserId(userId)
    const normalized = normalizeOrderNo(orderNo)

    await this.repo.transaction(async (tx) => {
      const order = await tx.lockOrder(userId, normalized)
      if (!order) {
        throw new OrderError(ORDER_ERROR_SPECS.orderNotFound)
      }
      if (order.status !== 'CREATED') {
        throw new OrderError(
          ORDER_ERROR_SPECS.statusConflict,
          `订单当前状态为「${ORDER_STATUS_TEXT[order.status]}」，不能支付`,
        )
      }

      await tx.insertPayment({
        orderId: order.id,
        // 一笔订单一条流水：pay_no 直接由订单号派生，天然满足唯一约束
        payNo: `PAY${order.orderNo}`,
        amount: order.totalAmount,
        status: 'SUCCESS',
      })

      const updated = await tx.updateStatus(order.id, 'CREATED', 'PAYED')
      if (!updated) {
        throw new OrderError(ORDER_ERROR_SPECS.statusConflict)
      }
    })

    return this.getOrder(userId, normalized)
  }

  /**
   * 写订单主表，订单号撞车时换一个重试。
   * 为什么能在事务内重试：InnoDB 的唯一键冲突只回滚这一条语句，事务本身还能继续用。
   */
  private async insertOrderWithRetry(
    tx: OrderTransaction,
    draft: Omit<NewOrderEntity, 'orderNo' | 'status'>,
  ): Promise<{ orderId: number; orderNo: string }> {
    for (let attempt = 1; attempt <= ORDER_NO_MAX_ATTEMPTS; attempt += 1) {
      const orderNo = generateOrderNo(new Date())
      try {
        const orderId = await tx.insertOrder({ ...draft, orderNo, status: 'CREATED' })
        return { orderId, orderNo }
      } catch (error) {
        if (!isDuplicateEntryError(error) || attempt === ORDER_NO_MAX_ATTEMPTS) {
          throw error
        }
      }
    }

    // 三次都撞号（概率约 1e-18），当作下单失败让用户重试
    throw new OrderError(ORDER_ERROR_SPECS.createFailed)
  }
}

/** 默认实例：仓储层用 src/config/database.ts 的连接池；单元测试可 new OrderService(fakeRepo) */
export const orderService = new OrderService(orderRepository)
