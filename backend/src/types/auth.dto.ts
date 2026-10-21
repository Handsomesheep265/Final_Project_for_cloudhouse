/**
 * 认证模块 · 请求 DTO（入参）
 * ----------------------------------------------------------------------------
 * 字段全部写成「可选 + 宽松类型」：
 * 注册/登录是面向外部的最前线接口，body 可能是任何 JSON（缺字段、类型不对、纯字符串），
 * 让 controller 原样透传，由 service 统一校验并给出可读的业务错误码，
 * 避免非法输入变成 500。
 *
 * 两条约定（同其它模块）：
 *   1. 用户 ID 永远不从 body 读 —— 登录后它来自 token；
 *   2. 不接收 passwordHash / status 这类内部字段，注册接口自己算哈希、自己定状态。
 */

/** POST /api/auth/register —— 注册 */
export interface RegisterDTO {
  /** 昵称：1 ~ 50 字符；不传则用邮箱前缀 */
  nickname?: unknown
  /** 邮箱：必填，最长 100，格式校验在 service */
  email?: unknown
  /** 明文密码：6 ~ 64 字符，服务端加盐哈希后入库 */
  password?: unknown
}

/** POST /api/auth/login —— 登录 */
export interface LoginDTO {
  email?: unknown
  password?: unknown
}
