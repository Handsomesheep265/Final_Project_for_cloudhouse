/**
 * 搜索接口类型
 * ----------------------------------------------------------------------------
 * 与后端 backend/src/types/search.vo.ts 一一对应：
 *   - 一次请求返回「商品」和「店铺」两组结果，各自带 total/page/pageSize；
 *   - type=product / shop 时另一组为 null（前端统一用 type=all，tab 在本地切）；
 *   - 商品项只有列表卡片需要的字段，详情页再去请求完整详情。
 */

/** 商品搜索结果项 */
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
  total: number
  page: number
  pageSize: number
}

/** GET /api/search */
export interface SearchResultVO {
  /** 清理后的关键词（后端已去首尾空白） */
  keyword: string
  type: string
  /** type=shop 时为 null */
  products: SearchGroupVO<ProductSearchItemVO> | null
  /** type=product 时为 null */
  shops: SearchGroupVO<ShopSearchItemVO> | null
}

/** 搜索范围 */
export type SearchType = 'all' | 'product' | 'shop'
