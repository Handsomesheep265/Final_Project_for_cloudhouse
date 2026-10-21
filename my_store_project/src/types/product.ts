/**
 * 商品详情接口类型
 * ----------------------------------------------------------------------------
 * 与后端 backend/src/types/product.vo.ts 一一对应：
 *   - images 已按 sortOrder 排好，coverImage 就是第一张；
 *   - seller / category 是对象，避免一堆 sellerXxx 前缀字段；
 *   - reviews 没有评价时 count=0、average=0，前端据此显示「暂无评价」；
 *   - isFavorite / cartQuantity 是「当前用户」的状态，未登录时 false / 0。
 */

/** 商品图 */
export interface ProductImageVO {
  id: number
  /** 可直接用于 <img src>：assets 相对路径或 http(s) URL */
  url: string
  /** 越小越靠前，0 为封面 */
  sortOrder: number
}

/** 卖家信息 */
export interface ProductSellerVO {
  id: number
  nickname: string
  avatarUrl: string | null
  bio: string | null
}

/** 分类 */
export interface ProductCategoryVO {
  id: number
  name: string
}

/** 评价统计 */
export interface ProductReviewStatsVO {
  count: number
  /** 平均分（两位小数），count=0 时为 0 */
  average: number
}

/** GET /api/products/:productId */
export interface ProductDetailVO {
  id: number
  title: string
  description: string | null
  /** 售价（元） */
  price: number
  /** 当前库存，0 表示售罄 */
  stock: number
  /** 1 上架，0 下架 */
  status: number
  /** 状态中文：在售 / 已下架 */
  statusText: string
  coverImage: string | null
  images: ProductImageVO[]
  category: ProductCategoryVO
  seller: ProductSellerVO
  reviews: ProductReviewStatsVO
  favoriteCount: number
  isFavorite: boolean
  cartQuantity: number
  createdAt: string
  updatedAt: string
}

/** 相关推荐的一项 */
export interface RelatedProductVO {
  id: number
  title: string
  price: number
  stock: number
  status: number
  coverImage: string | null
  sellerName: string
}

/** GET /api/products/:productId/related */
export interface RelatedProductListVO {
  list: RelatedProductVO[]
  categoryId: number
  categoryName: string
}
