/**
 * 鉴权中间件
 * ----------------------------------------------------------------------------
 * 唯一的凭证来源：`Authorization: Bearer <token>`，token 由 /api/auth/login 签发
 * （格式与签名校验见 src/utils/token.ts）。
 *
 * 两个中间件分工明确：
 *   attachAuth  —— 解析凭证，不拦请求：
 *                  1. 验签 + 检查过期（无状态，纯计算）；
 *                  2. 查服务端黑名单（登出 / 改密码后的 token 必须失效）；
 *                  3. 成功才挂 req.userId，失败记下原因继续往下走。
 *                  给「登录可选」的接口用（例如商品列表要按登录状态返回是否已收藏）。
 *   requireAuth —— 必须登录：没有 userId 直接 401 { code: 40102 }。
 *                  购物车 / 订单 / 个人主页 / 登出 / me 的路由都挂它。
 *
 * 为什么黑名单要在 attachAuth 里查而不是 requireAuth 里：
 *   公开接口（如商品详情）也会用 userId 拼「我的收藏 / 我的购物车数量」，
 *   已作废的 token 不该再被当成有效身份。
 *
 * 安全约定：
 *   - userId 只来自 token，绝不从请求体 / 查询串 / 自定义请求头读取；
 *   - 不再保留「x-user-id 冒充用户」的占位方案（见 git 历史里的 attachDemoUserId）；
 *   - 黑名单表只存 token 的 SHA-256 指纹，不存原文。
 */
import type { Request, RequestHandler } from 'express'
import { authRepository } from '../repositories/authRepositories'
import { verifyToken } from '../utils/token'
import { hashToken } from '../utils/token'
import type { ApiResponse } from '../types/common'

/** 未登录 / 凭证无效时的业务码（与 authService 的 unauthorized 保持一致） */
export const UNAUTHORIZED_CODE = 40102

/** 挂上 userId 的请求 */
export interface AuthenticatedRequest extends Request {
  /** 当前登录用户 ID，只能由本中间件写入 */
  userId?: number
  /** 本次请求携带的原始 token（登出时要拿它算指纹） */
  authToken?: string
  /** 本次 token 的过期时间（写黑名单时用来记 expires_at） */
  tokenExpiresAt?: Date
  /**
   * 凭证解析失败的原因，供 requireAuth 决定提示文案：
   * expired = 过期；revoked = 已被登出/改密码作废；invalid = 伪造 / 格式错。
   */
  authError?: 'expired' | 'revoked' | 'invalid'
}

const BEARER_PATTERN = /^bearer\s+(\S+)$/i

/** 从 Authorization 头里取 token；没有或格式不对返回 null */
function readBearerToken(req: Request): string | null {
  const header = req.header('authorization')
  if (!header) return null
  const matched = BEARER_PATTERN.exec(header.trim())
  const token = matched ? matched[1] : undefined
  return token && token.length > 0 ? token : null
}

/**
 * 解析登录凭证并挂到 req.userId。
 * 永不抛错、永不返回 401 —— 需要强制登录的接口由 requireAuth 负责。
 *
 * 是 async 的：验签之后还要查一次黑名单（数据库）。
 * Express 5 会自动接管 async 中间件抛出的异常，这里仍然自己兜住 DB 错误，
 * 避免一次数据库抖动把所有请求变成 500。
 */
export const attachAuth: RequestHandler = async (req, _res, next) => {
  const authenticated = req as AuthenticatedRequest

  const token = readBearerToken(req)
  if (!token) {
    next()
    return
  }

  const result = verifyToken(token)
  if (!result.ok) {
    authenticated.authError = result.reason === 'expired' ? 'expired' : 'invalid'
    // 只记服务端日志，不回给客户端：不告诉调用方是过期还是签名错
    console.warn(`[auth] 登录凭证无效（${result.reason}）：${req.method} ${req.originalUrl}`)
    next()
    return
  }

  try {
    // 无状态校验通过后再问一次数据库：这条 token 是否已被登出 / 被改密码作废
    const rejected = await authRepository.isTokenRejected(
      result.userId,
      hashToken(token),
      result.issuedAt,
    )
    if (rejected) {
      authenticated.authError = 'revoked'
      console.warn(`[auth] 登录凭证已被撤销：${req.method} ${req.originalUrl}`)
      next()
      return
    }
  } catch (error) {
    // 数据库不可用时按「未登录」处理（fail closed），别把写操作放行
    console.error('[auth] 校验登录凭证时数据库出错：', error)
    authenticated.authError = 'invalid'
    next()
    return
  }

  authenticated.userId = result.userId
  authenticated.authToken = token
  authenticated.tokenExpiresAt = result.expiresAt
  next()
}

/**
 * 必须登录。
 * 挂在需要用户身份的 router 上，形如：
 *     router.use(attachAuth, requireAuth)
 *
 * 直接返回统一响应体（而不是抛错），因为这是「网关级」判断，
 * 不需要经过业务错误类；状态码与错误码都和 authService 的 40102 对齐，
 * 前端拦截器只认 401 就能统一处理。
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  const { userId, authError } = req as AuthenticatedRequest
  if (typeof userId === 'number' && Number.isInteger(userId) && userId > 0) {
    next()
    return
  }

  const messages: Record<'expired' | 'revoked' | 'invalid', string> = {
    expired: '登录状态已过期，请重新登录',
    revoked: '登录状态已失效，请重新登录',
    invalid: '登录凭证无效，请重新登录',
  }

  const body: ApiResponse<null> = {
    code: UNAUTHORIZED_CODE,
    message: authError ? messages[authError] : '请先登录',
    data: null,
  }
  res.status(401).json(body)
}
