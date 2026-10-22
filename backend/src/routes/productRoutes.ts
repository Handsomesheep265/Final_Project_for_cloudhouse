/**
 * 商品路由
 * ----------------------------------------------------------------------------
 * 挂载方式（在 src/index.ts 里）：
 *     app.use('/api/products', productRouter)
 *
 *   GET /api/products                     商品列表（分类筛选 + 排序 + 分页）
 *   GET /api/products/:productId          商品详情（公开，未登录也能看）
 *   GET /api/products/:productId/related  相关推荐（同分类在售商品）
 *
 * 列表接口的参数：
 *   categoryId  分类 id，不传 / 0 表示全部（对应前期建的 products.category_id）
 *   onlyInStock 1 表示只看有货
 *   sort        default | price-asc | price-desc | sales | rating
 *   page/pageSize  默认 1 / 12，pageSize 上限 50
 *
 * 错误处理：不注册 router 级错误中间件，统一由 src/middlewares/errorHandler.ts 处理。
 */
import { Router } from 'express'
import type { ProductController } from '../controllers/productController'
import { productController } from '../controllers/productController'
import { attachAuth } from '../middlewares/auth'

/** 工厂函数：便于用假 controller 起一个测试用 router */
export function createProductRouter(controller: ProductController = productController): Router {
  const router = Router()

  // 可选身份：带 token 时详情里会多返回「我的收藏 / 我的购物车数量」；
  // 不带也能正常浏览（商品列表与详情是公开接口，不挂 requireAuth）
  router.use(attachAuth)

  router.get('/', controller.listProducts)
  // 具体路径放前面，语义更清楚（Express 本身也不会把 /1/related 匹配到 /:productId）
  router.get('/:productId/related', controller.listRelatedProducts)
  router.get('/:productId', controller.getProductDetail)

  return router
}

export const productRouter: Router = createProductRouter()
