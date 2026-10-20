/**
 * 个人主页模块 · 响应 VO（出参）
 * ----------------------------------------------------------------------------
 * 字段与前端 src/types/profile.ts 一一对应：
 *   - 昵称 / 头像 / 简介 / 加入时间 来自 users；
 *   - stats 是四个 COUNT，由服务端一次查出，前端不再分别请求；
 *   - 收藏与「我的商品」都是分页结构，字段名与订单列表保持一致（list/total/page/pageSize）。
 */

/** 个人主页统计数字 */
export interface ProfileStatsVO {
  /** 我发布的商品数（含下架） */
  productCount: number
  /** 我的收藏数 */
  favoriteCount: number
  /** 我的订单数 */
  orderCount: number
  /** 我写过的评价数 */
  reviewCount: number
}

/** GET /api/profile、PATCH /api/profile —— 个人资料 */
export interface ProfileVO {
  id: number
  nickname: string
  /** 头像地址，未设置为 null */
  avatarUrl: string | null
  /** 个人简介，未设置为 null */
  bio: string | null
  email: string | null
  /** 1 正常，0 禁用 */
  status: number
  /** 注册时间（ISO 8601） */
  createdAt: string
  stats: ProfileStatsVO
}

/** 收藏列表的一项（商品快照，只读） */
export interface FavoriteItemVO {
  /** favorites.id */
  id: number
  productId: number
  /** 商品标题 */
  title: string
  /** 当前售价（元） */
  price: number
  /** 当前库存，前端可据此禁用「加入购物车」 */
  stock: number
  /** 商品状态：1 上架，0 下架 */
  status: number
  /** 封面图，无图为 null */
  imageUrl: string | null
  sellerId: number
  sellerName: string
  /** 收藏时间（ISO 8601） */
  favoritedAt: string
}

/** GET /api/profile/favorites */
export interface FavoriteListVO {
  list: FavoriteItemVO[]
  total: number
  page: number
  pageSize: number
}

/** 收藏 / 取消收藏的返回体 */
export interface FavoriteToggleVO {
  /** 操作后的最终状态 */
  favorited: boolean
  /** 收藏时带上完整条目，前端可以直接插进列表，不用再拉一次 */
  item: FavoriteItemVO | null
}

/** 「我的商品」的一项（卖家视角，含下架商品） */
export interface SellerProductVO {
  id: number
  title: string
  price: number
  stock: number
  /** 1 上架，0 下架 */
  status: number
  imageUrl: string | null
  /** 发布时间（ISO 8601） */
  createdAt: string
}

/** GET /api/profile/products */
export interface SellerProductListVO {
  list: SellerProductVO[]
  total: number
  page: number
  pageSize: number
}
