/**
 * 认证模块 · 响应 VO（出参）
 * ----------------------------------------------------------------------------
 * 只出不进：这些结构只由 service 组装、controller 返回，绝不参与入参校验。
 *
 * 安全约定：VO 里没有 passwordHash，也没有 status（前端不需要知道自己是 1 还是 0，
 * 被禁用的账号在登录时就被 403 挡掉了）。
 */

/** 当前登录用户（可直接塞进前端全局 store） */
export interface AuthUserVO {
  id: number
  nickname: string
  /** 注册必填，所以这里给空串兜底，前端不用到处判 null */
  email: string
  avatarUrl: string | null
  bio: string | null
  /** 注册时间（ISO 8601），前端显示「加入于 …」 */
  joinedAt: string
}

/** 注册 / 登录成功后的会话：前端存 token，之后放在 Authorization: Bearer 里 */
export interface AuthSessionVO {
  token: string
  /** 固定 'Bearer'，给前端拼请求头时少写死字符串 */
  tokenType: 'Bearer'
  /** 过期时间（ISO 8601） */
  expiresAt: string
  user: AuthUserVO
}

/**
 * POST /api/auth/forgot-password 的返回。
 * 永远 accepted=true（不泄露邮箱是否注册过）；只有非生产环境才带 devResetUrl，
 * 因为本地没配 SMTP，得把链接直接给前端才能验收。
 */
export interface ForgotPasswordResultVO {
  accepted: boolean
  /** 链接有效期（分钟） */
  expiresInMinutes: number
  /** 仅开发环境：可直接打开的重置链接 */
  devResetUrl: string | null
}

/** POST /api/auth/reset-password 的返回 */
export interface ResetPasswordResultVO {
  /** 密码已重置，前端引导用户去登录 */
  reset: boolean
}
