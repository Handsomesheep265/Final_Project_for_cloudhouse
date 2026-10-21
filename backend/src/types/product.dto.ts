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

/**
 * GET /api/products —— 商品列表（首页 + 分类筛选）
 * ----------------------------------------------------------------------------
 * 全部参数都可选；不传 categoryId 就是「全部」。
 * 关键词搜索走 /api/search（那边有商品 + 店铺两组结果），列表接口不重复做。
 */
export interface ProductListQueryDTO {
  /** 分类 id；不传或 0 表示全部分类 */
  categoryId: string | undefined
  /** 只看有货：1 / true 表示只看库存 > 0 的商品 */
  onlyInStock: string | undefined
  /** 排序：default（默认）/ price-asc / price-desc / sales / rating */
  sort: string | undefined
  /** 页码，从 1 开始，默认 1 */
  page: string | undefined
  /** 每页条数，默认 12，上限 50 */
  pageSize: string | undefined
}
