/**
 * 鉴权中间件
 * ----------------------------------------------------------------------------
 * 两种凭证来源，按优先级：
 *   1. `Authorization: Bearer <token>` —— 正式方式，token 由 /api/auth/login 签发，
 *      载荷里只有用户 ID，签名见 src/utils/token.ts；
 *   2. `x-user-id: <id>` —— 占位方式，仅本地联调用（登录页还没写完时前端靠它跑通）。
 *      生产环境由 env.auth.allowDemoHeader 强制关闭，改个请求头就能冒充别人，
 *      ⚠️ 绝不能上线。
 *
 * 关键安全细节：只要请求带了 Authorization 头，就完全按 token 判定 ——
 * token 无效时不会回退去认 x-user-id，否则攻击者伪造一个坏 token 就能绕过校验。
 *
 * 解析结果只写进 req.userId，绝不从请求体读取用户 ID，
 * 否则客户端可以伪造成别人的用户操作其购物车/订单。
 */
import type { Request, RequestHandler } from 'express'
import { env } from '../config/env'
import { verifyToken } from '../utils/token'

/** 挂上 userId 的请求 */
export interface AuthenticatedRequest extends Request {
  /** 当前登录用户 ID，只能由本中间件写入 */
  userId?: number
  /** 凭证来源：token（正式）/ demo（x-user-id 占位）/ none（未登录） */
  authSource?: 'token' | 'demo' | 'none'
}

/** 临时用户 ID 请求头（仅本地联调） */
const DEMO_USER_ID_HEADER = 'x-user-id'

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
 * 任何失败都不在这里返回 401 —— 由各 controller 的 requireUserId 统一报 40102，
 * 这样「哪些接口必须登录」由路由/控制器决定，而不是中间件一刀切。
 */
export const attachAuth: RequestHandler = (req, _res, next) => {
  const authenticated = req as AuthenticatedRequest

  const token = readBearerToken(req)
  if (token) {
    const result = verifyToken(token)
    if (result.ok) {
      authenticated.userId = result.userId
      authenticated.authSource = 'token'
    } else {
      authenticated.authSource = 'none'
      // 只记服务端日志，不回给客户端：不告诉调用方是过期还是签名错
      console.warn(`[auth] 登录凭证无效（${result.reason}）：${req.method} ${req.originalUrl}`)
    }
    next()
    return
  }

  if (env.auth.allowDemoHeader) {
    const header = req.header(DEMO_USER_ID_HEADER)
    // 格式不对（非纯数字）就当没登录，别静默放过非法值
    if (header && /^\d+$/.test(header)) {
      authenticated.userId = Number(header)
      authenticated.authSource = 'demo'
    }
  }

  next()
}

/**
 * 旧名字，保留是为了不改购物车 / 订单 / 个人主页路由里的 router.use(...)。
 * 行为已经升级成「Bearer token + x-user-id 占位」，那两个模块因此自动支持正式登录。
 */
export const attachDemoUserId: RequestHandler = attachAuth
