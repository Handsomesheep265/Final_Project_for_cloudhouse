import type { ApiResponse } from '../types/cart'

/** 后端地址：默认本地 3000，可用 .env 里的 VITE_API_BASE 覆盖 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

/**
 * 临时鉴权占位：与后端 cartRoutes.ts 的 x-user-id 方案对应。
 * 登录功能落地后改成从 token / context 里取，这里只保留一个入口。
 */
export const DEMO_USER_ID = 1

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
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
}

/**
 * 统一请求封装：
 *   - 自动带 x-user-id 与 JSON 头
 *   - 解析 { code, message, data }，code !== 0 时抛 ApiError
 *   - 网络不通（后端没启动）也转成 ApiError，页面可以给出可读提示
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'x-user-id': String(DEMO_USER_ID),
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
    throw new ApiError(payload?.message ?? `请求失败（HTTP ${response.status}）`, {
      code: payload?.code ?? -1,
      status: response.status,
    })
  }

  return payload.data
}
