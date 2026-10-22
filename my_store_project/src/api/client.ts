import type { ApiResponse } from '../types/cart'
import { clearSession, getToken } from '../utils/authSession'
import { notifyUnauthorized } from '../utils/authEvents'

/** 后端地址：默认本地 3000，可用 .env 里的 VITE_API_BASE 覆盖 */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

/** 统一的接口错误：code 为后端业务码，网络失败时为 -1 */
export class ApiError extends Error {
  readonly code: number
  readonly status: number
  readonly isNetworkError: boolean

  constructor(message: string, options: { code: number; status: number; isNetworkError?: boolean }) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code
    this.status = options.status
    this.isNetworkError = options.isNetworkError ?? false
  }

  /** 401：没登录 / 凭证过期，调用方一般不用自己判断，拦截器已经处理过跳转 */
  get isUnauthorized(): boolean {
    return this.status === 401
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /**
   * 401 时不做全局跳转（默认会：清凭证 + 跳登录页）。
   * 只给「登录 / 注册 / 启动时的身份校验」用 —— 它们的 401 属于正常业务失败，
   * 不应该被当成「登录态失效」把用户踢走。
   */
  silentUnauthorized?: boolean
}

/** 这两个接口的 401 表示「账号或密码不对」，不是登录态失效 */
const CREDENTIAL_PATHS = ['/api/auth/login', '/api/auth/register']

function isCredentialCheck(path: string): boolean {
  return CREDENTIAL_PATHS.some((prefix) => path.startsWith(prefix))
}

/** 拼鉴权头：有 token 就带 Bearer，没有就不带（公开接口照样能访问） */
function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}

/**
 * 统一请求封装：
 *   - 自动带 Authorization: Bearer <token>（没有 token 就是匿名请求）
 *   - 解析 { code, message, data }，code !== 0 时抛 ApiError
 *   - 401 全局拦截：清本地凭证 → 通知 AuthBootstrap 跳登录页（登录页会记住来的位置）
 *   - 网络不通（后端没启动）也转成 ApiError，页面可以给出可读提示
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, silentUnauthorized = false } = options

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...authHeaders(),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('无法连接后端服务，请确认 backend 已启动（npm run dev）', {
      code: -1,
      status: 0,
      isNetworkError: true,
    })
  }

  let payload: ApiResponse<T> | null = null
  try {
    payload = (await response.json()) as ApiResponse<T>
  } catch {
    // 响应不是 JSON（例如网关/代理返回了 HTML 错误页），按未知失败处理
  }

  if (!response.ok || payload === null || payload.code !== 0) {
    // 401 = 没登录 / token 过期：清掉本地凭证并交给全局拦截器处理
    if (response.status === 401 && !silentUnauthorized && !isCredentialCheck(path)) {
      clearSession()
      notifyUnauthorized(payload?.message)
    }

    throw new ApiError(payload?.message ?? `请求失败（HTTP ${response.status}）`, {
      code: payload?.code ?? -1,
      status: response.status,
    })
  }

  return payload.data
}
