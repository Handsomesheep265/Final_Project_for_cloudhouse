/**
 * 搜索模块 · 响应 VO（出参）
 * ----------------------------------------------------------------------------
 * 一次请求同时返回「商品」和「店铺」两组结果，前端渲染两个 tab 不用发两次请求：
 *   - type=all     两组都有
 *   - type=product 只返回 products，shops 为 null
 *   - type=shop    只返回 shops，products 为 null
 *
 * 两组结构一致（list / total / page / pageSize），前端可以复用同一个列表组件。
 */

/** 商品搜索结果项（列表卡片够用的字段） */
export interface ProductSearchItemVO {
  id: number
  title: string
  price: number
  /** 库存，0 表示售罄 */
  stock: number
  /** 1 上架（搜索结果只会是在售商品） */
  status: number
  /** 封面图，无图为 null */
  coverImage: string | null
  sellerId: number
  sellerName: string
}

/** 店铺搜索结果项 */
export interface ShopSearchItemVO {
  id: number
  nickname: string
  avatarUrl: string | null
  bio: string | null
  /** 该店铺在售商品数 */
  productCount: number
}

/** 一组结果 */
export interface SearchGroupVO<T> {
  list: T[]
  /** 符合关键词的总条数（用于分页器与「共 N 个商品」提示） */
  total: number
  page: number
  pageSize: number
}

/** GET /api/search */
export interface SearchResultVO {
  /** 回显清理后的关键词（去首尾空白），前端可直接用于高亮 */
  keyword: string
  /** 实际搜索范围 */
  type: string
  /** type=shop 时为 null */
  products: SearchGroupVO<ProductSearchItemVO> | null
  /** type=product 时为 null */
  shops: SearchGroupVO<ShopSearchItemVO> | null
}
