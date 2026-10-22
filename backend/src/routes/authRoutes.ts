/**
 * 认证路由
 * ----------------------------------------------------------------------------
 * 挂载方式（在 src/index.ts 里）：
 *     app.use('/api/auth', authRouter)
 *
 *   POST /api/auth/register        注册（body: { nickname?, email, password }）→ 201 + 登录凭证
 *   POST /api/auth/login           登录（body: { email, password }）→ 200 + 登录凭证
 *   POST /api/auth/forgot-password 申请重置密码（body: { email }）→ 开发环境附带 devResetUrl
 *   POST /api/auth/reset-password  用一次性令牌改密码（body: { token, password }）
 *   GET  /api/auth/me              当前会话（Bearer token）→ 200 + 新 token（滑动续期）
 *   POST /api/auth/logout          退出登录（Bearer token）→ 该 token 立即进入黑名单
 *
 * 登出为什么需要接口：JWT 是无状态的，前端删掉本地 token 只是「这边不发了」，
 * 旧 token 在有效期内照样能调接口（比如被人复制走了）。所以服务端要记一份
 * 黑名单（revoked_tokens），attachAuth 每次校验都会查一次。
 *
 * 重置密码成功后还会写 user_token_epochs：把该用户的时间线推到当前时间，
 * 之前签发的所有 token 立刻失效 —— 也就是「改完密码所有设备都要重新登录」。
 *
 * /me 返回新 token 是为了「滑动续期」：每次打开应用确认身份都会把有效期往后推，
 * 只要 7 天内来过就一直不用重新登录。
 *
 * 为什么注册/登录也挂 attachAuth：
 *   - /me 需要它把 token 解析成 userId；
 *   - 已登录用户重复调注册/登录不会出问题（注册只看邮箱是否占用），
 *     但保留鉴权解析让日志里能看到「谁在调」，排查时更方便。
 *
 * 返回体统一为 { code, message, data }：
 *   成功 code=0；失败由 src/middlewares/errorHandler.ts 统一转换（40101 / 40920 …）。
 *
 * 前端约定：
 *   1. 登录成功后把 data.token 存起来（localStorage），后续请求带
 *      `Authorization: Bearer <token>`；
 *   2. 打开页面先调 /api/auth/me 恢复登录态，401（40102）就清掉本地 token 当作未登录；
 *   3. 不做 logout 接口：退出登录 = 删本地 token（JWT 无状态，无需服务端配合）。
 */
import { Router } from 'express'
import type { AuthController } from '../controllers/authController'
import { authController } from '../controllers/authController'
import { attachAuth, requireAuth } from '../middlewares/auth'

/** 工厂函数：便于用假 controller 起一个测试用 router */
export function createAuthRouter(controller: AuthController = authController): Router {
  const router = Router()

  // 解析登录凭证（Authorization: Bearer），失败只记原因，不拦请求，见 src/middlewares/auth.ts
  router.use(attachAuth)

  // 公开接口
  router.post('/register', controller.register)
  router.post('/login', controller.login)
  // 找回密码：申请链接 & 用令牌重置（后者靠令牌证明身份，不需要登录）
  router.post('/forgot-password', controller.forgotPassword)
  router.post('/reset-password', controller.resetPassword)

  // 需要登录
  router.get('/me', requireAuth, controller.me)
  router.post('/logout', requireAuth, controller.logout)

  return router
}

export const authRouter: Router = createAuthRouter()
