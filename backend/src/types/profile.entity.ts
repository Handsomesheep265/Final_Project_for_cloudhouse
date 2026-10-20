/**
 * 个人主页模块 · 实体（Entity）
 * ----------------------------------------------------------------------------
 * 数据来自 docs/DATABASE_DESIGN.md 里已有的表，不新增表结构：
 *   users      账号信息（昵称 / 头像 / 简介 / 邮箱 / 状态）
 *   products   该用户作为卖家的商品（products.seller_id）
 *   favorites  该用户收藏的商品
 *   orders     该用户的订单（个人主页只统计数量，列表走 /api/orders）
 *   reviews    该用户写的评价（个人主页只统计数量）
 *
 * 注意：password_hash 也在 users 表里，但任何实体/查询都不带它 ——
 * 密码哈希绝不能进入 API 响应。需要登录校验时由专门的鉴权模块读取。
 */

/** users 表的一行（不含 password_hash） */
export interface UserEntity {
  id: number
  nickname: string
  avatarUrl: string | null
  bio: string | null
  email: string | null
  /** 1 正常，0 禁用 */
  status: number
  createdAt: Date
  updatedAt: Date
}

/** 个人主页的统计数字（一次查询出来，避免四次往返） */
export interface ProfileStatsEntity {
  /** 我上架/下架的商品总数（products.seller_id = me） */
  productCount: number
  /** 我的收藏数 */
  favoriteCount: number
  /** 我的订单数 */
  orderCount: number
  /** 我写过的评价数 */
  reviewCount: number
}

/** 收藏列表里展示的商品快照（联表 products + users + product_images 封面） */
export interface FavoriteProductEntity {
  id: number
  title: string
  price: number
  stock: number
  /** products.status：1 上架，0 下架 */
  status: number
  /** 封面图，无图为 null */
  imageUrl: string | null
  sellerId: number
  sellerName: string
}

/** favorites 一行 + 商品快照 */
export interface FavoriteItemEntity {
  /** favorites.id */
  id: number
  userId: number
  productId: number
  /** 收藏时间 */
  createdAt: Date
  product: FavoriteProductEntity
}

/** 卖家视角的商品（个人主页「我的商品」） */
export interface SellerProductEntity {
  id: number
  title: string
  price: number
  stock: number
  status: number
  imageUrl: string | null
  createdAt: Date
}

/** 待更新的资料字段：只有显式给出的字段才会写库 */
export interface UserProfilePatch {
  nickname?: string
  avatarUrl?: string | null
  bio?: string | null
}
