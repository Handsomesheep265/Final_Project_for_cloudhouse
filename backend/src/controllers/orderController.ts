/**
 * 订单控制器（Controller）—— 结算订单的 HTTP 入口
 * ----------------------------------------------------------------------------
 * 只做三件事（和 cartController 完全同构）：
 *   1. 从请求里取出参数：userId 来自鉴权中间件、orderNo 来自路径、收货信息来自 body、
 *      分页/状态筛选来自 query；
 *   2. 调 service，拿 OrderVO / OrderListVO；
 *   3. 用统一响应体 { code, message, data } 返回，并挑一个合适的 HTTP 状态码。
 *
 * 业务规则一律不写在这里：收货信息校验、库存校验、金额计算、状态流转
 * 全部在 orderService 里，失败时抛 OrderError（带 code + httpStatus），
 * 由 src/middlewares/errorHandler.ts 统一转成错误响应。
 *
 * 为什么 controller 不自己校验参数：同一套规则（比如订单号格式、pageSize 上限）
 * 如果 controller 校验一遍、service 再校验一遍，两处迟早不一致；
 * 这里只负责「取出来、交下去」。
 *
 * 说明：Express 5 会自动把 async handler 的 reject 交给错误中间件，
 * 所以这里不需要 try/catch 或 asyncHandler 包装。
 */
import type { Request, RequestHandler, Response } from 'express'
import type { AuthenticatedRequest } from '../middlewares/auth'
import { ORDER_ERRORS, OrderError, orderService, OrderService } from '../services/orderService'
import type { ApiResponse } from '../types/common'
import type { CreateOrderDTO, OrderListQueryDTO } from '../types/order.dto'

/** 统一成功响应 */
function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { code: 0, message: 'ok', data }
  res.status(status).json(body)
}

/**
 * 取当前登录用户。
 * userId 只可能由鉴权中间件写入；没有就是没登录，直接按业务错误抛出。
 */
function requireUserId(req: Request): number {
  const { userId } = req as AuthenticatedRequest
  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
    throw new OrderError(ORDER_ERRORS.invalidUserId, '未获取到登录用户，请先登录')
  }
  return userId
}

/** 请求体兜底：没有 body 时按空对象处理，交给 service 报参数错误 */
function readBody<T>(req: Request): T {
  return (req.body ?? {}) as T
}

/** 路径参数里的订单号：只取字符串，格式校验交给 service（保持单一事实来源） */
function readOrderNoParam(req: Request): string {
  const raw = req.params.orderNo
  return typeof raw === 'string' ? raw : ''
}

/**
 * 查询串取值。
 * Express 把 `?page=1&page=2` 解析成数组，这里取第一个；
 * 对象形式（`?page[a]=1`）一律当作没传，由 service 用默认值兜住。
 */
function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

/** 读列表查询参数（原样字符串，解析与校验在 service） */
function readListQuery(req: Request): OrderListQueryDTO {
  return {
    page: queryString(req.query.page),
    pageSize: queryString(req.query.pageSize),
    status: queryString(req.query.status),
  }
}

export interface OrderController {
  /** 结算下单 */
  createOrder: RequestHandler
  /** 我的订单列表 */
  listOrders: RequestHandler
  /** 订单详情 */
  getOrder: RequestHandler
  /** 取消订单 */
  cancelOrder: RequestHandler
  /** 支付（当前为模拟支付） */
  payOrder: RequestHandler
}

/**
 * 工厂函数：注入不同的 OrderService 便于做 mock 单元测试；
 * 默认实例见文件末尾的 orderController。
 */
export function createOrderController(service: OrderService): OrderController {
  return {
    /**
     * POST /api/orders —— 结算下单
     * ------------------------------------------------------------------
     * body: { receiverName, receiverPhone, receiverAddress }
     * 购物车里勾选了哪些商品由服务端查，前端不需要（也不能）把商品和金额传上来。
     * 返回 201 Created + 新订单详情。
     */
    createOrder: async (req, res) => {
      const userId = requireUserId(req)
      const dto = readBody<CreateOrderDTO>(req)
      sendSuccess(res, await service.createOrder(userId, dto), 201)
    },

    /**
     * GET /api/orders?page=1&pageSize=10&status=CREATED —— 我的订单
     * 只返回当前用户自己的订单，按下单时间倒序。
     */
    listOrders: async (req, res) => {
      const userId = requireUserId(req)
      sendSuccess(res, await service.listOrders(userId, readListQuery(req)))
    },

    /** GET /api/orders/:orderNo —— 订单详情（含明细快照） */
    getOrder: async (req, res) => {
      const userId = requireUserId(req)
      sendSuccess(res, await service.getOrder(userId, readOrderNoParam(req)))
    },

    /**
     * POST /api/orders/:orderNo/cancel —— 取消订单
     * 仅「待支付」可取消；取消会把下单时扣掉的库存加回去。
     */
    cancelOrder: async (req, res) => {
      const userId = requireUserId(req)
      sendSuccess(res, await service.cancelOrder(userId, readOrderNoParam(req)))
    },

    /**
     * POST /api/orders/:orderNo/pay —— 支付（模拟）
     * 没有真实支付渠道，调用后直接写一条成功流水并把订单改成「待发货」。
     */
    payOrder: async (req, res) => {
      const userId = requireUserId(req)
      sendSuccess(res, await service.payOrder(userId, readOrderNoParam(req)))
    },
  }
}

/** 默认实例：service 用真实仓储层（连接池见 src/config/database.ts） */
export const orderController: OrderController = createOrderController(orderService)
