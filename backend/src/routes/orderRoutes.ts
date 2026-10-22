/**
 * 订单路由
 * ----------------------------------------------------------------------------
 * 挂载方式（在 src/index.ts 里）：
 *     app.use('/api/orders', orderRouter)
 *
 * 接口一览（userId 一律由鉴权中间件注入，路径里只出现订单号）：
 *
 *   POST   /api/orders                   结算下单（购物车已勾选的行 → 订单）
 *   GET    /api/orders                   我的订单（分页 + 状态筛选）
 *   GET    /api/orders/:orderNo          订单详情（含明细快照）
 *   POST   /api/orders/:orderNo/cancel   取消订单（仅待支付，回滚库存）
 *   POST   /api/orders/:orderNo/pay      支付（模拟，订单转「待发货」）
 *
 * 为什么用 orderNo 而不是 orders.id：订单号是对外唯一标识（20 位，
 * 含时间戳 + 随机段），既不泄露「第几单」，也天然带唯一约束，
 * 前端做分享/查询时不必暴露数据库自增主键。
 *
 * 错误处理：不在这里注册 router 级错误中间件 —— src/index.ts 已经把
 * 统一错误中间件挂在所有路由之后，OrderError 会被它转成 { code, message, data }。
 */
import { Router } from 'express'
import type { OrderController } from '../controllers/orderController'
import { orderController } from '../controllers/orderController'
import { attachAuth, requireAuth } from '../middlewares/auth'

/** 工厂函数：便于用假 controller 起一个测试用 router */
export function createOrderRouter(controller: OrderController = orderController): Router {
  const router = Router()

  // 订单只属于下单用户：没有登录凭证一律 401（前端拦截器会跳登录页）
  router.use(attachAuth, requireAuth)

  router.post('/', controller.createOrder)
  router.get('/', controller.listOrders)
  router.get('/:orderNo', controller.getOrder)
  router.post('/:orderNo/cancel', controller.cancelOrder)
  router.post('/:orderNo/pay', controller.payOrder)

  return router
}

export const orderRouter: Router = createOrderRouter()
