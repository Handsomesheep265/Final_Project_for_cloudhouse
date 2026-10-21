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

/** 排序方式（与后端 /api/products 的 sort 参数一一对应） */
export type ProductSort = 'default' | 'price-asc' | 'price-desc' | 'sales' | 'rating'

/**
 * 商品列表项（首页列表 / 分类筛选）
 * ----------------------------------------------------------------------------
 * 除了卡片需要的字段，还带派生指标 rating / sales（后端现算，不是表里的列），
 * 以及分类、卖家信息，前端不用再逐个请求。
 */
export interface ProductListItemVO {
  id: number
  title: string
  description: string | null
  price: number
  /** 库存，0 表示售罄 */
  stock: number
  /** 1 上架（列表只会返回上架商品） */
  status: number
  coverImage: string | null
  sellerId: number
  sellerName: string
  sellerAvatarUrl: string | null
  categoryId: number
  categoryName: string
  /** 评价平均分，没有评价为 0 */
  rating: number
  /** 累计销量（不含已取消订单），没有成交为 0 */
  sales: number
  createdAt: string
}

/** GET /api/products */
export interface ProductListVO {
  list: ProductListItemVO[]
  total: number
  page: number
  pageSize: number
  /** 实际筛选的分类 id；null 表示全部 */
  categoryId: number | null
}
