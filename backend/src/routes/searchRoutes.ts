/**
 * 搜索路由
 * ----------------------------------------------------------------------------
 * 挂载方式（在 src/index.ts 里）：
 *     app.use('/api/search', searchRouter)
 *
 *   GET /api/search?keyword=手帐&type=all&page=1&pageSize=10
 *     keyword  必填，去空白后 2 ~ 50 个字符（ngram 最小粒度是 2）
 *     type     all（默认）| product | shop
 *     page     默认 1
 *     pageSize 默认 10，上限 20
 *
 * 为什么只有一个接口：首页搜索框一次要展示「商品」和「店铺」两个 tab，
 * 一个请求把两组结果（各自的 list/total/page/pageSize）一起返回，
 * 前端切 tab 不用再发请求；只要一组时用 type 限定即可。
 *
 * 搜索是公开接口，不需要 x-user-id；错误统一由 src/middlewares/errorHandler.ts 处理。
 */
import { Router } from 'express'
import type { SearchController } from '../controllers/searchController'
import { searchController } from '../controllers/searchController'

/** 工厂函数：便于用假 controller 起一个测试用 router */
export function createSearchRouter(controller: SearchController = searchController): Router {
  const router = Router()

  router.get('/', controller.search)

  return router
}

export const searchRouter: Router = createSearchRouter()
