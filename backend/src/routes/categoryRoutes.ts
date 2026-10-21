/**
 * 分类路由
 * ----------------------------------------------------------------------------
 * 挂载方式（在 src/index.ts 里）：
 *     app.use('/api/categories', categoryRouter)
 *
 *   GET /api/categories   分类列表（按 sortOrder，带每个分类的在售商品数）
 *
 * 分类没有写操作（后台管理还没做），所以这里只有 GET。
 * 错误统一由 src/middlewares/errorHandler.ts 处理。
 */
import { Router } from 'express'
import type { CategoryController } from '../controllers/categoryController'
import { categoryController } from '../controllers/categoryController'

/** 工厂函数：便于用假 controller 起一个测试用 router */
export function createCategoryRouter(controller: CategoryController = categoryController): Router {
  const router = Router()

  router.get('/', controller.listCategories)

  return router
}

export const categoryRouter: Router = createCategoryRouter()
