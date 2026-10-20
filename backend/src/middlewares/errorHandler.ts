/**
 * 统一错误中间件
 * ----------------------------------------------------------------------------
 * 挂载在 src/index.ts 的最末尾（所有路由之后），是整个应用唯一的错误出口：
 *
 *   1. 业务异常（CartError / OrderError 等带 code + httpStatus 的错误）
 *      → 原样输出业务码与建议的 HTTP 状态码；
 *   2. express.json() 解析失败等 http-errors（带 4xx 状态）→ 统一 40000「请求格式不正确」；
 *   3. 其它未知异常 → 50000，只在服务端日志里打印细节，不把堆栈泄露给客户端。
 *
 * 为什么用「鸭子类型」而不是 instanceof 判断：
 * 各模块的业务错误类（CartError、OrderError）互不依赖，但都实现了
 * { code: number; httpStatus: number; message: string } 这套约定，
 * 这里按结构判断，新增业务模块时不需要再回来改这个文件。
 */
import type { ErrorRequestHandler } from 'express'
import type { ApiResponse } from '../types/common'

/** 业务异常的结构约定（见各模块 service 里的 *Error 类） */
export interface BusinessErrorShape {
  code: number
  httpStatus: number
  message: string
}

/** 判断是不是业务异常 */
export function isBusinessError(error: unknown): error is BusinessErrorShape {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as Partial<BusinessErrorShape>
  return (
    typeof candidate.code === 'number' &&
    Number.isInteger(candidate.code) &&
    typeof candidate.httpStatus === 'number' &&
    candidate.httpStatus >= 400 &&
    candidate.httpStatus < 600 &&
    typeof candidate.message === 'string'
  )
}

/** 取出 http-errors 等中间件抛出的状态码 */
function readHttpStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const raw = (error as { status?: unknown; statusCode?: unknown }).status
    ?? (error as { statusCode?: unknown }).statusCode
  const status = Number(raw)
  return Number.isInteger(status) ? status : null
}

function send(res: Parameters<ErrorRequestHandler>[2], status: number, code: number, message: string): void {
  const body: ApiResponse<null> = { code, message, data: null }
  res.status(status).json(body)
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // 1. 业务异常：code / httpStatus 由 service 决定
  if (isBusinessError(error)) {
    send(res, error.httpStatus, error.code, error.message)
    return
  }

  // 2. 请求本身有问题（JSON 格式错误、body 过大等），透传状态码
  const status = readHttpStatus(error)
  if (status !== null && status >= 400 && status < 500) {
    send(res, status, 40000, '请求格式不正确')
    return
  }

  // 3. 兜底：未知异常
  console.error('[server] 未捕获异常:', error)
  send(res, 500, 50000, '服务器内部错误')
}
