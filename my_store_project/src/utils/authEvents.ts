/**
 * 401 通知（极简事件总线）
 * ----------------------------------------------------------------------------
 * 为什么需要它：登录态失效的发现点是 api/client.ts（收到 401 的那一刻），
 * 而「清状态 + 跳登录页」需要 React store 和 react-router。
 * client 是纯请求层，不该 import store / router（会形成环），所以：
 *
 *   client  ──notifyUnauthorized()──▶  本模块  ──回调──▶  AuthBootstrap（页面内组件）
 *
 * 全项目只允许注册一个监听者（由 AuthBootstrap 在挂载时注册、卸载时注销）。
 */
type UnauthorizedListener = (message?: string) => void

let listener: UnauthorizedListener | null = null

/** 注册 / 注销监听者；传 null 表示注销 */
export function setUnauthorizedHandler(next: UnauthorizedListener | null): void {
  listener = next
}

/** 请求层收到 401 时调用；message 来自后端响应体（如「登录状态已过期，请重新登录」） */
export function notifyUnauthorized(message?: string): void {
  listener?.(message)
}
