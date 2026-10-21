/**
 * 商品模块 · 请求 DTO（入参）
 * ----------------------------------------------------------------------------
 * 商品详情是公开接口：未登录也能看，只是 isFavorite / cartQuantity 会是 0/false，
 * 所以这里没有 userId 字段（身份由鉴权中间件可选注入）。
 *
 * 查询串里拿到的都是字符串，解析与边界校验放在 service。
 */

/** GET /api/products/:productId/related —— 相关推荐 */
export interface RelatedProductQueryDTO {
  /** 返回条数，1 ~ 12，默认 6 */
  limit: string | undefined
}
