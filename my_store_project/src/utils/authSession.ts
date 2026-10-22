/**
 * 登录凭证的本地存储
 * ----------------------------------------------------------------------------
 * 目标很窄：把后端返回的 token / user / expiresAt 存进 localStorage / 读出来。
 * 真正的「登录态」在 stores/authStore.ts，本文件只负责存取与结构校验。
 *
 * 跨标签页同步也依赖这里导出的键名：
 * 浏览器只会在「别的标签页」修改 localStorage 时触发 storage 事件，
 * AuthBootstrap 监听它就能做到「一个标签登录/退出，其它标签立刻跟上」。
 *
 * 为什么带过期判断：token 过期后请求必然 401，不如提前当作「未登录」，
 * 让导航栏直接给登录入口，少一次失败请求。
 */
import type { AuthSessionVO, AuthUserVO } from '../types/auth'

/** localStorage 键名：带业务前缀，避免和其它项目/工具撞车 */
export const AUTH_STORAGE_KEY = 'journal-market:auth'

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
    raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
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

/** 登录/注册成功、续期成功后保存会话（只存必要字段） */
export function saveSession(session: AuthSessionVO): void {
  const stored: StoredSession = {
    token: session.token,
    tokenType: session.tokenType,
    expiresAt: session.expiresAt,
    user: session.user,
  }
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // 存不进去也不该让登录流程失败：本次会话内页面还能用，刷新后需要重新登录
  }
}

/** 退出登录 / 凭证失效时清掉 */
export function clearSession(): void {
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  } catch {
    // 忽略：清不掉也没有更好的处理办法
  }
}

/** 当前 token（已过期或不存在时返回 null）—— 登录态请用 stores/authStore */
export function getToken(): string | null {
  return readSession()?.token ?? null
}
