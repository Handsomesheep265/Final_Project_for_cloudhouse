/**
 * 个人主页模块 · 请求 DTO（入参）
 * ----------------------------------------------------------------------------
 * 两条通用约定（同购物车 / 订单模块）：
 *   1. userId 不进 DTO —— 由鉴权中间件注入，URL 里也不出现，
 *      所以「只能看/改自己的主页」是天然的，不存在越权参数；
 *   2. 这里只有类型，没有运行时校验，规则集中在 profileService。
 *
 * tsconfig 开了 exactOptionalPropertyTypes：
 *   - UpdateProfileDTO 的字段是「可选」，表示不传就不改；
 *   - 想清空某个字段要显式传 null（例如把简介删掉），传 undefined 不算。
 */

/** PATCH /api/profile —— 更新个人资料 */
export interface UpdateProfileDTO {
  /** 昵称：1 ~ 50 字符，会去掉首尾空白 */
  nickname?: string
  /** 头像地址：http(s) 链接或 assets 相对路径，最长 500；传 null / 空串表示清除 */
  avatarUrl?: string | null
  /** 个人简介：最长 200 字符，会去掉首尾空白；传 null / 空串表示清除 */
  bio?: string | null
}

/**
 * 分页查询参数（收藏列表 / 我的商品共用）
 * 查询串拿到的都是字符串，解析与边界校验在 service 里做。
 */
export interface ProfilePageQueryDTO {
  /** 页码，从 1 开始，默认 1 */
  page: string | undefined
  /** 每页条数，默认 12，上限 50 */
  pageSize: string | undefined
}
