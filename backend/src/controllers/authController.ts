/**
 * 认证控制器（Controller）
 * ----------------------------------------------------------------------------
 * 只做三件事（与购物车 / 订单 / 个人主页控制器同构）：
 *   1. 从请求里取出参数：注册/登录/找回密码的字段来自 body，当前用户与 token 来自鉴权中间件；
 *   2. 调 service；
 *   3. 用统一响应体 { code, message, data } 返回。
 *
 * body 一律原样透传（req.body 可能是 undefined、字符串、数组），
 * 校验全部在 authService，非法输入返回 4002x 而不是 500。
 *
 * 五个接口：
 *   register / login        公开
 *   forgot-password         公开（防邮箱枚举：邮箱不存在也返回 accepted=true）
 *   reset-password          公开（靠邮件里的一次性令牌证明身份）
 *   me / logout             需要登录（requireAuth 已挡在前面，这里再兜一层）
 */
import type { Request, RequestHandler, Response } from 'express'
import type { AuthenticatedRequest } from '../middlewares/auth'
import { AUTH_ERRORS, AuthError, authService, AuthService } from '../services/authService'
import type { ApiResponse } from '../types/common'
import type { ForgotPasswordDTO, LoginDTO, RegisterDTO, ResetPasswordDTO } from '../types/auth.dto'

/** 统一成功响应 */
function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { code: 0, message: 'ok', data }
  res.status(status).json(body)
}

/** 取当前登录用户；缺失或非法时按「未登录」抛出 40102 */
function requireUserId(req: Request): number {
  const { userId } = req as AuthenticatedRequest
  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
    throw new AuthError(AUTH_ERRORS.unauthorized)
  }
  return userId
}

/** 把 body 当对象读：非对象（字符串 / 数组 / 空 body）一律当空对象，交给 service 报错 */
function readBody(req: Request): Record<string, unknown> {
  const body: unknown = req.body
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    return body as Record<string, unknown>
  }
  return {}
}

export interface AuthController {
  /** 注册 */
  register: RequestHandler
  /** 登录 */
  login: RequestHandler
  /** 当前会话（顺带续签 token） */
  me: RequestHandler
  /** 退出登录（把当前 token 加入黑名单） */
  logout: RequestHandler
  /** 申请重置密码（发一次性链接） */
  forgotPassword: RequestHandler
  /** 用一次性令牌设置新密码 */
  resetPassword: RequestHandler
}

/**
 * 工厂函数：注入不同的 AuthService 便于做 mock 单元测试；
 * 默认实例见文件末尾的 authController。
 */
export function createAuthController(service: AuthService): AuthController {
  return {
    /** POST /api/auth/register —— 注册并直接返回登录凭证（201） */
    register: async (req, res) => {
      const dto: RegisterDTO = readBody(req)
      // 注册成功即登录：前端拿到 token 就能直接进首页，不用再跳一次登录
      sendSuccess(res, await service.register(dto), 201)
    },

    /** POST /api/auth/login —— 登录，返回 { token, tokenType, expiresAt, user } */
    login: async (req, res) => {
      const dto: LoginDTO = readBody(req)
      sendSuccess(res, await service.login(dto))
    },

    /**
     * GET /api/auth/me —— 用 Authorization: Bearer <token> 换回当前会话
     * 前端刷新页面时用它恢复登录状态（token 存 localStorage，资料不存）。
     * 返回新的 token + 过期时间（滑动续期，见 authService.getSession）。
     */
    me: async (req, res) => {
      const userId = requireUserId(req)
      const { authToken, tokenExpiresAt } = req as AuthenticatedRequest
      // 带上「本次出示的 token」：service 会把它拉黑并签发新 token（凭证轮换）
      const presented =
        authToken && tokenExpiresAt ? { token: authToken, expiresAt: tokenExpiresAt } : undefined

      sendSuccess(res, await service.getSession(userId, presented))
    },

    /**
     * POST /api/auth/logout —— 退出登录
     * 需要登录：从请求头里取回原始 token 与过期时间，交给 service 写黑名单。
     * 前端拿到 200 后删本地 token；即使它没删，这个 token 也已经调不动接口了。
     */
    logout: async (req, res) => {
      const userId = requireUserId(req)
      const { authToken, tokenExpiresAt } = req as AuthenticatedRequest
      if (!authToken || !tokenExpiresAt) {
        throw new AuthError(AUTH_ERRORS.unauthorized)
      }

      await service.logout(userId, authToken, tokenExpiresAt)
      sendSuccess(res, null)
    },

    /**
     * POST /api/auth/forgot-password —— 申请重置密码
     * body: { email }
     * 永远返回 accepted=true（不泄露邮箱是否注册过）；开发环境额外带 devResetUrl。
     */
    forgotPassword: async (req, res) => {
      const dto: ForgotPasswordDTO = readBody(req)
      sendSuccess(res, await service.requestPasswordReset(dto))
    },

    /**
     * POST /api/auth/reset-password —— 用邮件里的一次性令牌改密码
     * body: { token, password }
     * 成功后此前所有 token 失效，前端应引导用户重新登录。
     */
    resetPassword: async (req, res) => {
      const dto: ResetPasswordDTO = readBody(req)
      sendSuccess(res, await service.resetPassword(dto))
    },
  }
}

/** 默认实例：service 用真实仓储层（连接池见 src/config/database.ts） */
export const authController: AuthController = createAuthController(authService)
