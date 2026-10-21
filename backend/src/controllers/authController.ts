/**
 * 认证控制器（Controller）
 * ----------------------------------------------------------------------------
 * 只做三件事（与购物车 / 订单 / 个人主页控制器同构）：
 *   1. 从请求里取出参数：注册/登录的字段来自 body，当前用户来自鉴权中间件；
 *   2. 调 service；
 *   3. 用统一响应体 { code, message, data } 返回。
 *
 * body 一律原样透传（req.body 可能是 undefined、字符串、数组），
 * 校验全部在 authService，非法输入返回 4002x 而不是 500。
 *
 * 说明：本模块刻意不写 logout —— JWT 是无状态的，退出登录由前端删掉本地 token 完成；
 * 真要「服务端强制下线」，得引入 token 黑名单表，属于后续迭代。
 */
import type { Request, RequestHandler, Response } from 'express'
import type { AuthenticatedRequest } from '../middlewares/auth'
import { AUTH_ERRORS, AuthError, authService, AuthService } from '../services/authService'
import type { ApiResponse } from '../types/common'
import type { LoginDTO, RegisterDTO } from '../types/auth.dto'

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
  /** 当前登录用户 */
  me: RequestHandler
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
     * GET /api/auth/me —— 用 Authorization: Bearer <token> 换回当前用户
     * 前端刷新页面时用它恢复登录状态（token 存 localStorage，资料不存）。
     */
    me: async (req, res) => {
      const userId = requireUserId(req)
      sendSuccess(res, await service.getCurrentUser(userId))
    },
  }
}

/** 默认实例：service 用真实仓储层（连接池见 src/config/database.ts） */
export const authController: AuthController = createAuthController(authService)
