/**
 * 购物车路由
 * ----------------------------------------------------------------------------
 * 挂载方式（在 src/index.ts 里）：
 *     app.use(express.json())
 *     app.use('/api/cart', cartRouter)
 *
 * 所有接口都以鉴权中间件注入的 userId 为准；路径里只出现商品 ID：
 *
 *   GET    /api/cart                          购物车（列表 + 选中合计）
 *   POST   /api/cart/items                    加入购物车
 *   PATCH  /api/cart/items/:productId         修改数量
 *   PATCH  /api/cart/items/:productId/selected 单项勾选 / 取消勾选
 *   PATCH  /api/cart/selected                 全选 / 取消全选
 *   DELETE /api/cart/items/:productId         移除单个商品
 *   DELETE /api/cart                         清空购物车
 *
 * 为什么用 productId 而不是 cart_items.id：表里有 uk_user_product 唯一索引，
 * 同一用户的同一商品只占一行，productId 就是稳定的业务主键，前端也一直用它定位条目。
 */
import { Router } from 'express'
import type { ErrorRequestHandler, RequestHandler } from 'express'
import { CartError } from '../services/cartService'
import type { AuthenticatedRequest, CartController } from '../controllers/cartController'
import { cartController } from '../controllers/cartController'
import type { ApiResponse } from '../types/common'

/**
 * 临时鉴权占位：从请求头 x-user-id 读用户 ID。
 * ⚠️ 仅供本地联调，绝不能上线 —— 任何人改个请求头就能冒充其他用户。
 * TODO(auth): 等登录功能落地后，换成解析 JWT/session 的鉴权中间件，
 *             并把下面这行删掉（挂载点保持 router.use(authMiddleware) 不变）。
 */
const attachDemoUserId: RequestHandler = (req, _res, next) => {
  const header = req.header('x-user-id')
  if (header && /^\d+$/.test(header)) {
    ;(req as AuthenticatedRequest).userId = Number(header)
  }
  next()
}

/** 把 service 抛出的 CartError 转成统一响应体；其它异常统一 500，不泄露内部细节 */
export const cartErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof CartError) {
    const body: ApiResponse<null> = {
      code: error.code,
      message: error.message,
      data: null,
    }
    res.status(error.httpStatus).json(body)
    return
  }

  // express.json() 解析失败等 http-errors：带 4xx 状态码的直接透传
  const status = Number((error as { status?: number; statusCode?: number })?.status
    ?? (error as { statusCode?: number })?.statusCode)
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    const body: ApiResponse<null> = {
      code: 40000,
      message: '请求格式不正确',
      data: null,
    }
    res.status(status).json(body)
    return
  }

  console.error('[cart] 未捕获异常:', error)
  const body: ApiResponse<null> = {
    code: 50000,
    message: '服务器内部错误',
    data: null,
  }
  res.status(500).json(body)
}

/** 工厂函数：便于用假 service 起一个测试用 router */
export function createCartRouter(controller: CartController = cartController): Router {
  const router = Router()

  // 鉴权（当前为占位实现）
  router.use(attachDemoUserId)

  router.get('/', controller.getCart)
  router.post('/items', controller.addItem)
  router.patch('/items/:productId', controller.updateQuantity)
  router.patch('/items/:productId/selected', controller.updateSelected)
  router.patch('/selected', controller.updateAllSelected)
  router.delete('/items/:productId', controller.removeItem)
  router.delete('/', controller.clearCart)

  // 注意顺序：错误中间件必须放在所有路由之后
  router.use(cartErrorHandler)

  return router
}

export const cartRouter: Router = createCartRouter()
