/**
 * 登录凭证的本地存储
 * ----------------------------------------------------------------------------
 * 目标很窄：把后端返回的 token / user / expiresAt 存进 localStorage，
 * 之后请求时取出来拼 Authorization 头。**这不是「全局登录态」**——
 * 没有 store、没有订阅、没有登录态变化通知，等后面接全局状态时把这层换掉即可，
 * 使用方（client.ts / AuthPage / BottomNavBar）的调用签名会保持不变。
 *
 * 为什么带过期判断：token 过期后请求必然 401，不如提前当作「未登录」，
 * 让导航栏直接给登录入口，少一次失败请求。
 */
import type { AuthSessionVO, AuthUserVO } from '../types/auth'

/** localStorage 键名：带业务前缀，避免和其它项目/工具撞车 */
const STORAGE_KEY = 'journal-market:auth'

export interface StoredSession {
  token: string
  /** 目前恒为 Bearer */
  tokenType: string
  /** 过期时间（ISO 8601） */
  expiresAt: string
  user: AuthUserVO
}

/** 校验 localStorage 里读出来的对象：来源不可信，逐字段检查 */
function isAuthUser(value: unknown): value is AuthUserVO {
  if (typeof value !== 'object' || value === null) return false
  const user = value as Partial<AuthUserVO>
  return (
    typeof user.id === 'number' &&
    typeof user.nickname === 'string' &&
    typeof user.email === 'string'
  )
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false
  const session = value as Partial<StoredSession>
  return (
    typeof session.token === 'string' &&
    session.token.length > 0 &&
    typeof session.tokenType === 'string' &&
    typeof session.expiresAt === 'string' &&
    isAuthUser(session.user)
  )
}

/** token 是否已过期；时间格式不对也按过期处理（宁可让用户重登） */
function isExpired(expiresAt: string): boolean {
  const time = Date.parse(expiresAt)
  return Number.isNaN(time) || time <= Date.now()
}

/**
 * 读取会话。
 * 读不到、JSON 坏了、结构不对、已过期都返回 null，调用方只判 null 即可；
 * 过期的会顺手清掉，避免每次渲染都做一次无用判断。
 */
export function readSession(): StoredSession | null {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // 隐私模式 / 禁用存储：当作未登录
    return null
  }
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    clearSession()
    return null
  }

  if (!isStoredSession(parsed)) {
    clearSession()
    return null
  }
  if (isExpired(parsed.expiresAt)) {
    clearSession()
    return null
  }
  return parsed
}

/** 登录/注册成功后保存会话（只存必要字段） */
export function saveSession(session: AuthSessionVO): void {
  const stored: StoredSession = {
    token: session.token,
    tokenType: session.tokenType,
    expiresAt: session.expiresAt,
    user: session.user,
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // 存不进去也不该让登录流程失败：本次会话内页面还能用，刷新后需要重新登录
  }
}

/** 退出登录 / 凭证失效时清掉 */
export function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 忽略：清不掉也没有更好的处理办法
  }
}

/** 当前 token（已过期或不存在时返回 null） */
export function getToken(): string | null {
  return readSession()?.token ?? null
}

/** 当前登录用户（已过期或不存在时返回 null） */
export function getCurrentUser(): AuthUserVO | null {
  return readSession()?.user ?? null
}

/** 是否处于「已登录且未过期」状态 */
export function isLoggedIn(): boolean {
  return readSession() !== null
}
