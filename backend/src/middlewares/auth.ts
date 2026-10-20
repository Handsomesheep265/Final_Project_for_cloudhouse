/**
 * 鉴权（占位实现）
 * ----------------------------------------------------------------------------
 * 目前还没有登录功能，用请求头 x-user-id 冒充「当前登录用户」，仅限本地联调。
 *
 * ⚠️ 绝不能上线：任何人改个请求头就能冒充其他用户。
 * TODO(auth): 登录功能落地后，把 attachDemoUserId 换成解析 JWT/session 的实现，
 *             签名保持不变（RequestHandler），各路由文件里的 router.use(...) 不用动。
 *
 * 为什么单独抽一个文件：购物车和订单两套路由都要用同一个占位中间件，
 * 放在 routes 里会导致「订单路由 import 购物车路由」的怪依赖。
 */
import type { Request, RequestHandler } from 'express'

/**
 * 挂上 userId 的请求。
 * userId 只能由鉴权中间件从 token 解析后写入，绝不从请求体读取，
 * 否则客户端可以伪造成别人的用户操作其购物车/订单。
 */
export interface AuthenticatedRequest extends Request {
  userId?: number
}

/** 临时用户 ID 请求头（仅本地联调） */
const DEMO_USER_ID_HEADER = 'x-user-id'

/**
 * 从请求头解析 userId；格式不对（非纯数字）就当没登录，
 * 由各 controller 的 requireUserId 统一报 40000，避免这里静默放过非法值。
 */
export const attachDemoUserId: RequestHandler = (req, _res, next) => {
  const header = req.header(DEMO_USER_ID_HEADER)
  if (header && /^\d+$/.test(header)) {
    ;(req as AuthenticatedRequest).userId = Number(header)
  }
  next()
}
