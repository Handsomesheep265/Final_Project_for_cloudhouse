/**
 * 登录 / 注册接口类型
 * ----------------------------------------------------------------------------
 * 与 backend/src/types/auth.vo.ts 一一对应：
 *   注册/登录成功 → AuthSessionVO（token + 过期时间 + 用户资料）
 *   GET /api/auth/me → AuthUserVO（只有用户资料）
 *
 * token 是后端签的 HS256 JWT，前端不解析内容（只存起来、放进请求头），
 * 需要用户资料时调 /api/auth/me，避免前后端两套「解 token」的逻辑。
 */

/** 当前登录用户（不含密码等敏感字段，后端也不会返回） */
export interface AuthUserVO {
  id: number
  nickname: string
  email: string
  /** 头像地址，未设置时为 null */
  avatarUrl: string | null
  /** 个人简介，未设置为 null */
  bio: string | null
  /** 注册时间（ISO 8601） */
  joinedAt: string
}

/** 注册 / 登录成功的会话 */
export interface AuthSessionVO {
  token: string
  /** 固定 'Bearer'，拼 Authorization 头时用它 */
  tokenType: 'Bearer'
  /** 过期时间（ISO 8601） */
  expiresAt: string
  user: AuthUserVO
}

/** POST /api/auth/login 的请求体 */
export interface LoginPayload {
  email: string
  password: string
}

/** POST /api/auth/register 的请求体（昵称可以不填，后端用邮箱前缀） */
export interface RegisterPayload {
  nickname?: string
  email: string
  password: string
}

/** POST /api/auth/forgot-password 的请求体 */
export interface ForgotPasswordPayload {
  email: string
}

/** POST /api/auth/reset-password 的请求体 */
export interface ResetPasswordPayload {
  /** 邮件链接里的令牌（前端从 ?token= 取） */
  token: string
  password: string
}

/**
 * POST /api/auth/forgot-password 的返回。
 * 后端永远 accepted=true（不暴露邮箱是否注册过）；devResetUrl 只在开发环境有值
 * ——本地没接 SMTP，得把链接直接给前端才能验收。
 */
export interface ForgotPasswordResultVO {
  accepted: boolean
  expiresInMinutes: number
  devResetUrl: string | null
}

/** POST /api/auth/reset-password 的返回 */
export interface ResetPasswordResultVO {
  reset: boolean
}
