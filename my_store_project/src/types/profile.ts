/**
 * 个人主页接口类型
 * ----------------------------------------------------------------------------
 * 与后端 backend/src/types/profile.vo.ts 一一对应：
 *   - 资料字段来自 users 表（昵称 / 头像 / 简介 / 邮箱 / 状态）；
 *   - stats 是服务端一次算好的四个数字，前端直接用；
 *   - 收藏与「我的商品」都是分页结构，字段名与订单列表一致（list/total/page/pageSize）。
 *
 * 注意：接口永远返回「当前登录用户」的数据（userId 由请求头注入），
 * 所以这里没有 userId 参数，也不存在查看别人的主页。
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

/** GET /api/profile、PATCH /api/profile */
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

/** 收藏列表的一项 */
export interface FavoriteItemVO {
  /** favorites.id */
  id: number
  productId: number
  title: string
  /** 当前售价（元） */
  price: number
  /** 当前库存，0 表示售罄 */
  stock: number
  /** 商品状态：1 上架，0 下架 */
  status: number
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

/** POST / DELETE /api/profile/favorites/:productId */
export interface FavoriteToggleVO {
  favorited: boolean
  item: FavoriteItemVO | null
}

/** 「我的商品」的一项（卖家视角，含下架） */
export interface SellerProductVO {
  id: number
  title: string
  price: number
  stock: number
  /** 1 上架，0 下架 */
  status: number
  imageUrl: string | null
  createdAt: string
}

/** GET /api/profile/products */
export interface SellerProductListVO {
  list: SellerProductVO[]
  total: number
  page: number
  pageSize: number
}

/**
 * PATCH /api/profile 的请求体。
 * 只传要改的字段；传 null / 空串表示清空（对应后端「PATCH 语义」）。
 */
export interface UpdateProfilePayload {
  nickname?: string
  avatarUrl?: string | null
  bio?: string | null
}
