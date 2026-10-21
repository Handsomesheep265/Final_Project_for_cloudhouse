/**
 * 商品模块 · 响应 VO（出参）
 * ----------------------------------------------------------------------------
 * 字段与前端 src/types/product.ts 一一对应：
 *   - images 按 sort_order 排好序，coverImage 就是第一张，前端不用再挑；
 *   - seller / category 拆成对象，避免详情页出现一堆 sellerXxx 前缀字段；
 *   - reviews 没有评价时 count=0、average=0，前端据此显示「暂无评价」；
 *   - isFavorite / cartQuantity 是「当前用户」的状态，未登录时分别是 false / 0。
 */

/** 商品图 */
export interface ProductImageVO {
  id: number
  /** 可直接用于 <img src>：后端存的是 assets 相对路径或 http(s) URL */
  url: string
  /** 越小越靠前，0 为封面 */
  sortOrder: number
}

/** 卖家（详情页顶部的店铺信息） */
export interface ProductSellerVO {
  id: number
  nickname: string
  avatarUrl: string | null
  /** 店铺/个人简介，卖家的 bio */
  bio: string | null
}

/** 分类 */
export interface ProductCategoryVO {
  id: number
  name: string
}

/** 评价统计 */
export interface ProductReviewStatsVO {
  /** 评价条数 */
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
  /** 封面图（images[0]），无图为 null */
  coverImage: string | null
  /** 全部商品图，按 sort_order 升序 */
  images: ProductImageVO[]
  category: ProductCategoryVO
  seller: ProductSellerVO
  reviews: ProductReviewStatsVO
  /** 收藏该商品的用户数 */
  favoriteCount: number
  /** 当前用户是否已收藏（未登录为 false） */
  isFavorite: boolean
  /** 当前用户购物车中的数量（未加购/未登录为 0） */
  cartQuantity: number
  /** 上架时间（ISO 8601） */
  createdAt: string
  /** 更新时间（ISO 8601） */
  updatedAt: string
}

/** 相关推荐的一项（列表卡片够用的字段） */
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
  /** 推荐依据的分类，前端可用于「更多同类」入口 */
  categoryId: number
  categoryName: string
}

/**
 * 商品列表项（首页列表 / 分类筛选）
 * ----------------------------------------------------------------------------
 * 字段按「卡片需要什么就给什么」：
 *   - 卡片渲染：title / price / coverImage / stock / sellerName
 *   - 排序与角标：rating（评价均分）、sales（累计销量）
 *   - 分类筛选：categoryId / categoryName
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
  /** 评价平均分（两位小数），没有评价为 0 */
  rating: number
  /** 累计销量（order_items 数量之和），没有成交为 0 */
  sales: number
  /** 上架时间（ISO 8601） */
  createdAt: string
}

/** GET /api/products */
export interface ProductListVO {
  list: ProductListItemVO[]
  total: number
  page: number
  pageSize: number
  /** 实际筛选的分类 id；null 表示「全部」 */
  categoryId: number | null
}
