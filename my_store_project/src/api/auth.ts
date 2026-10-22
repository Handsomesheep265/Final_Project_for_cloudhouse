/**
 * 登录 / 注册接口
 * ----------------------------------------------------------------------------
 * 与 backend/src/routes/authRoutes.ts 一一对应：
 *   POST /api/auth/register   注册（成功即登录，返回 token）
 *   POST /api/auth/login      登录
 *   GET  /api/auth/me         当前用户（请求头带 Authorization: Bearer <token>）
 *
 * 统一走 api/client.ts 的 request()：失败会抛 ApiError，
 * code 为后端业务码（40101 账号或密码错、40920 邮箱已注册、4002x 参数不合法）。
 */
import { request } from './client'
import type {
  AuthSessionVO,
  ForgotPasswordPayload,
  ForgotPasswordResultVO,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
  ResetPasswordResultVO,
} from '../types/auth'

export const authApi = {
  /** POST /api/auth/register —— 注册成功直接拿到登录凭证 */
  register: (payload: RegisterPayload) =>
    request<AuthSessionVO>('/api/auth/register', { method: 'POST', body: payload }),

  /** POST /api/auth/login */
  login: (payload: LoginPayload) =>
    request<AuthSessionVO>('/api/auth/login', { method: 'POST', body: payload }),

  /**
   * GET /api/auth/me —— 用本地 token 换最新会话。
   * 后端会顺带重新签一个 token（滑动续期），所以返回的是完整会话而不是单个用户。
   *
   * silentUnauthorized：启动校验失败时安静降级成「未登录」，
   * 不要把正在浏览首页的用户直接踢到登录页（浏览本来就允许匿名）。
   */
  me: (options: { silentUnauthorized?: boolean } = {}) =>
    request<AuthSessionVO>('/api/auth/me', {
      ...(options.silentUnauthorized ? { silentUnauthorized: true } : {}),
    }),

  /**
   * POST /api/auth/logout —— 让服务端把当前 token 记进黑名单。
   * 前端随后会删本地凭证；没有这一步的话，旧 token 在有效期内仍然能调接口。
   *
   * silentUnauthorized：退出时 token 可能已经过期，这时 401 属于正常结果，
   * 不该再触发全局「跳登录页」（用户本来就在退出）。
   */
  logout: () => request<null>('/api/auth/logout', { method: 'POST', silentUnauthorized: true }),

  /** POST /api/auth/forgot-password —— 申请重置链接（开发环境会直接返回链接） */
  forgotPassword: (payload: ForgotPasswordPayload) =>
    request<ForgotPasswordResultVO>('/api/auth/forgot-password', { method: 'POST', body: payload }),

  /** POST /api/auth/reset-password —— 用一次性令牌设置新密码 */
  resetPassword: (payload: ResetPasswordPayload) =>
    request<ResetPasswordResultVO>('/api/auth/reset-password', { method: 'POST', body: payload }),
}
