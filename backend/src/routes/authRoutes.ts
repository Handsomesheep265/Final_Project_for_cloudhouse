/**
 * 认证路由
 * ----------------------------------------------------------------------------
 * 挂载方式（在 src/index.ts 里）：
 *     app.use('/api/auth', authRouter)
 *
 *   POST /api/auth/register   注册（body: { nickname?, email, password }）→ 201 + 登录凭证
 *   POST /api/auth/login      登录（body: { email, password }）→ 200 + 登录凭证
 *   GET  /api/auth/me         当前登录用户（Authorization: Bearer <token>）
 *
 * 为什么注册/登录也挂 attachAuth：
 *   - /me 需要它把 token 解析成 userId；
 *   - 已登录用户重复调注册/登录不会出问题（注册只看邮箱是否占用），
 *     但保留鉴权解析让日志里能看到「谁在调」，排查时更方便。
 *
 * 返回体统一为 { code, message, data }：
 *   成功 code=0；失败由 src/middlewares/errorHandler.ts 统一转换（40101 / 40920 …）。
 *
 * 前端约定（下一阶段写登录页时照这个来）：
 *   1. 登录成功后把 data.token 存起来（localStorage），后续请求带
 *      `Authorization: Bearer <token>`；
 *   2. 打开页面先调 /api/auth/me 恢复登录态，401（40102）就清掉本地 token；
 *   3. 不做 logout 接口：退出登录 = 删本地 token。
 */
import { Router } from 'express'
import type { AuthController } from '../controllers/authController'
import { authController } from '../controllers/authController'
import { attachAuth } from '../middlewares/auth'

/** 工厂函数：便于用假 controller 起一个测试用 router */
export function createAuthRouter(controller: AuthController = authController): Router {
  const router = Router()

  // 解析登录凭证（Authorization: Bearer / 开发期的 x-user-id 占位），见 src/middlewares/auth.ts
  router.use(attachAuth)

  router.post('/register', controller.register)
  router.post('/login', controller.login)
  router.get('/me', controller.me)

  return router
}

export const authRouter: Router = createAuthRouter()
