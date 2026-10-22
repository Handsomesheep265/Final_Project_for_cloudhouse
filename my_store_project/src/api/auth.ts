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
import type { AuthSessionVO, AuthUserVO, LoginPayload, RegisterPayload } from '../types/auth'

export const authApi = {
  /** POST /api/auth/register —— 注册成功直接拿到登录凭证 */
  register: (payload: RegisterPayload) =>
    request<AuthSessionVO>('/api/auth/register', { method: 'POST', body: payload }),

  /** POST /api/auth/login */
  login: (payload: LoginPayload) =>
    request<AuthSessionVO>('/api/auth/login', { method: 'POST', body: payload }),

  /** GET /api/auth/me —— token 失效时后端返回 40102 */
  me: () => request<AuthUserVO>('/api/auth/me'),
}
