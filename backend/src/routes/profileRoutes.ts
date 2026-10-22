/**
 * 个人主页路由
 * ----------------------------------------------------------------------------
 * 挂载方式（在 src/index.ts 里）：
 *     app.use('/api/profile', profileRouter)
 *
 *   GET    /api/profile                          个人资料 + 统计
 *   PATCH  /api/profile                          更新昵称 / 头像 / 简介
 *   GET    /api/profile/favorites                我的收藏（分页）
 *   POST   /api/profile/favorites/:productId     收藏商品（幂等）
 *   DELETE /api/profile/favorites/:productId     取消收藏（幂等）
 *   GET    /api/profile/products                 我发布的商品（含下架，分页）
 *
 * 为什么不做 /api/users/:id：个人主页只展示「自己」，用户 ID 由鉴权中间件给，
 * URL 里带 id 反而要额外写一套「能不能看别人」的规则。等以后要做「逛别人的店」，
 * 再加 /api/shops/:userId 这类只读接口，免得把两件事混在一个控制器里。
 *
 * 错误处理：不注册 router 级错误中间件，统一由 src/middlewares/errorHandler.ts 处理。
 */
import { Router } from 'express'
import type { ProfileController } from '../controllers/profileController'
import { profileController } from '../controllers/profileController'
import { attachAuth, requireAuth } from '../middlewares/auth'

/** 工厂函数：便于用假 controller 起一个测试用 router */
export function createProfileRouter(controller: ProfileController = profileController): Router {
  const router = Router()

  // 个人主页永远是「自己的」：没有登录凭证一律 401（前端拦截器会跳登录页）
  router.use(attachAuth, requireAuth)

  router.get('/', controller.getProfile)
  router.patch('/', controller.updateProfile)
  router.get('/favorites', controller.listFavorites)
  router.post('/favorites/:productId', controller.addFavorite)
  router.delete('/favorites/:productId', controller.removeFavorite)
  router.get('/products', controller.listMyProducts)

  return router
}

export const profileRouter: Router = createProfileRouter()
