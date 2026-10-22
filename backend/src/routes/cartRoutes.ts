/**
 * 购物车路由
 * ----------------------------------------------------------------------------
 * 挂载方式（在 src/index.ts 里）：
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
 *
 * 错误处理：不在这里注册 router 级错误中间件 —— src/index.ts 已经把
 * 统一错误中间件挂在所有路由之后（src/middlewares/errorHandler.ts），
 * CartError 会被它转成 { code, message, data }，订单模块也走同一个出口。
 */
import { Router } from 'express'
import type { CartController } from '../controllers/cartController'
import { cartController } from '../controllers/cartController'
import { attachAuth, requireAuth } from '../middlewares/auth'

/** 工厂函数：便于用假 controller 起一个测试用 router */
export function createCartRouter(controller: CartController = cartController): Router {
  const router = Router()

  // 购物车是「某个用户的车」：没有登录凭证一律 401（前端拦截器会跳登录页）
  router.use(attachAuth, requireAuth)

  router.get('/', controller.getCart)
  router.post('/items', controller.addItem)
  router.patch('/items/:productId', controller.updateQuantity)
  router.patch('/items/:productId/selected', controller.updateSelected)
  router.patch('/selected', controller.updateAllSelected)
  router.delete('/items/:productId', controller.removeItem)
  router.delete('/', controller.clearCart)

  return router
}

export const cartRouter: Router = createCartRouter()
