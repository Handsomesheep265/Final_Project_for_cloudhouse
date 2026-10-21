/**
 * 商品路由
 * ----------------------------------------------------------------------------
 * 挂载方式（在 src/index.ts 里）：
 *     app.use('/api/products', productRouter)
 *
 *   GET /api/products/:productId          商品详情（公开，未登录也能看）
 *   GET /api/products/:productId/related  相关推荐（同分类在售商品）
 *
 * 为什么不做 /api/products 列表：首页目前用的是前端 mock 数据（15 条与种子数据一一对应），
 * 等首页改成接口驱动时再加列表接口，免得现在做一个没人调的空壳。
 *
 * 错误处理：不注册 router 级错误中间件，统一由 src/middlewares/errorHandler.ts 处理。
 */
import { Router } from 'express'
import type { ProductController } from '../controllers/productController'
import { productController } from '../controllers/productController'
import { attachDemoUserId } from '../middlewares/auth'

/** 工厂函数：便于用假 controller 起一个测试用 router */
export function createProductRouter(controller: ProductController = productController): Router {
  const router = Router()

  // 可选身份：带上 x-user-id 时详情里会多返回「我的收藏 / 我的购物车数量」
  router.use(attachDemoUserId)

  // 具体路径放前面，语义更清楚（Express 本身也不会把 /1/related 匹配到 /:productId）
  router.get('/:productId/related', controller.listRelatedProducts)
  router.get('/:productId', controller.getProductDetail)

  return router
}

export const productRouter: Router = createProductRouter()
