/**
 * 购物车控制器（Controller）
 * ----------------------------------------------------------------------------
 * 只做三件事：
 *   1. 从请求里取出参数（userId 来自鉴权中间件、productId 来自路径、其余来自 body）；
 *   2. 调 service，拿 CartVO；
 *   3. 用统一响应体 { code, message, data } 返回。
 *
 * 业务规则一律不写在这里：校验/拦截由 service 抛 CartError，
 * 错误响应由 src/middlewares/errorHandler.ts 统一转换。
 *
 * 说明：Express 5 会自动把 async handler 的 reject 交给错误中间件，
 * 所以这里不需要 try/catch 或 asyncHandler 包装。
 */
import type { Request, RequestHandler, Response } from 'express'
import type { AuthenticatedRequest } from '../middlewares/auth'
import { CART_ERRORS, CartError, cartService, CartService } from '../services/cartService'
import type {
  AddCartItemDTO,
  UpdateAllSelectedDTO,
  UpdateCartItemQuantityDTO,
  UpdateCartItemSelectedDTO,
} from '../types/cart.dto'
import type { ApiResponse } from '../types/common'

/** 统一成功响应 */
function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { code: 0, message: 'ok', data }
  res.status(status).json(body)
}

/**
 * 取当前登录用户；缺失或非法时按业务错误抛出。
 * userId 只能由鉴权中间件（src/middlewares/auth.ts）写入，绝不从请求体读取，
 * 否则客户端可以伪造成别人的用户操作其购物车。
 */
function requireUserId(req: Request): number {
  const { userId } = req as AuthenticatedRequest
  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
    throw new CartError(CART_ERRORS.invalidUserId, '未获取到登录用户，请先登录')
  }
  return userId
}

/** 解析路径里的 productId，非数字时交给 service 之外的这一层直接拦掉 */
function requireProductIdParam(req: Request): number {
  const raw = req.params.productId ?? ''
  const productId = Number(raw)
  if (!Number.isInteger(productId) || productId <= 0) {
    throw new CartError(CART_ERRORS.invalidProductId, `商品 ID 不合法：${raw || '(空)'}`)
  }
  return productId
}

/** 请求体兜底：没有 body 时按空对象处理，交给 service 报参数错误 */
function readBody<T>(req: Request): T {
  return (req.body ?? {}) as T
}

export interface CartController {
  getCart: RequestHandler
  addItem: RequestHandler
  updateQuantity: RequestHandler
  updateSelected: RequestHandler
  updateAllSelected: RequestHandler
  removeItem: RequestHandler
  clearCart: RequestHandler
}

/**
 * 工厂函数：注入不同的 CartService 便于做 mock 单元测试；
 * 默认实例见文件末尾的 cartController。
 */
export function createCartController(service: CartService): CartController {
  return {
    /** GET /api/cart —— 购物车（列表 + 汇总） */
    getCart: async (req, res) => {
      const userId = requireUserId(req)
      sendSuccess(res, await service.getCart(userId))
    },

    /** POST /api/cart/items —— 加入购物车，返回整车数据 */
    addItem: async (req, res) => {
      const userId = requireUserId(req)
      const dto = readBody<AddCartItemDTO>(req)
      sendSuccess(res, await service.addItem(userId, dto))
    },

    /** PATCH /api/cart/items/:productId —— 修改数量 */
    updateQuantity: async (req, res) => {
      const userId = requireUserId(req)
      const productId = requireProductIdParam(req)
      const dto = readBody<UpdateCartItemQuantityDTO>(req)
      sendSuccess(res, await service.updateQuantity(userId, productId, dto))
    },

    /** PATCH /api/cart/items/:productId/selected —— 单项勾选 */
    updateSelected: async (req, res) => {
      const userId = requireUserId(req)
      const productId = requireProductIdParam(req)
      const dto = readBody<UpdateCartItemSelectedDTO>(req)
      sendSuccess(res, await service.updateSelected(userId, productId, dto))
    },

    /** PATCH /api/cart/selected —— 全选 / 取消全选 */
    updateAllSelected: async (req, res) => {
      const userId = requireUserId(req)
      const dto = readBody<UpdateAllSelectedDTO>(req)
      sendSuccess(res, await service.updateAllSelected(userId, dto))
    },

    /** DELETE /api/cart/items/:productId —— 移除单个商品 */
    removeItem: async (req, res) => {
      const userId = requireUserId(req)
      const productId = requireProductIdParam(req)
      sendSuccess(res, await service.removeItem(userId, productId))
    },

    /** DELETE /api/cart —— 清空购物车 */
    clearCart: async (req, res) => {
      const userId = requireUserId(req)
      sendSuccess(res, await service.clearCart(userId))
    },
  }
}

/** 默认实例：service 用真实仓储层（连接池见 src/config/database.ts） */
export const cartController: CartController = createCartController(cartService)
