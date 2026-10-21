/**
 * 商品模块 · 实体（Entity）
 * ----------------------------------------------------------------------------
 * 对应 docs/DATABASE_DESIGN.md 里已有的表，没有新增表结构：
 *   products        商品本体（标题 / 描述 / 价格 / 库存 / 状态 / 卖家 / 分类）
 *   product_images  商品图（sort_order 最小的作为封面）
 *   users           卖家信息（昵称 / 头像 / 简介）
 *   categories      分类名
 *   favorites       收藏数 + 当前用户是否已收藏
 *   reviews         评价数 + 平均分
 *   cart_items      当前用户已加入购物车的数量
 *
 * 详情页要把这些拼成一个响应，所以实体分两层：
 *   - ProductDetailEntity：一条 SQL 就把商品 + 卖家 + 分类 + 收藏/评价/购物车统计查回来；
 *   - ProductImageEntity：一对多，单独查一次再按 sort_order 排序。
 */

/** product_images 表的一行 */
export interface ProductImageEntity {
  id: number
  productId: number
  imageUrl: string
  /** 越小越靠前，0 是封面 */
  sortOrder: number
}

/**
 * 商品详情（联表 + 统计）
 * ----------------------------------------------------------------------------
 * 金额在连接池里已由 decimalNumbers 转成 number；评价平均分保留两位小数由 service 处理。
 */
export interface ProductDetailEntity {
  id: number
  title: string
  /** 商品描述，可能为空 */
  description: string | null
  /** 售价（元） */
  price: number
  /** 当前库存，0 表示售罄 */
  stock: number
  /** 1 上架，0 下架 */
  status: number

  sellerId: number
  sellerName: string
  sellerAvatarUrl: string | null
  sellerBio: string | null

  categoryId: number
  categoryName: string

  /** 收藏该商品的用户数 */
  favoriteCount: number
  /** 当前用户是否已收藏（未登录时恒为 false） */
  isFavorite: boolean
  /** 评价条数 */
  reviewCount: number
  /** 平均评分，没有评价时为 0 */
  ratingAverage: number
  /** 当前用户购物车里的数量，没加购为 0（未登录时也是 0） */
  cartQuantity: number

  createdAt: Date
  updatedAt: Date
}

/** 「相关推荐」用的轻量商品行 */
export interface RelatedProductEntity {
  id: number
  title: string
  price: number
  stock: number
  status: number
  /** 封面图，无图为 null */
  imageUrl: string | null
  sellerName: string
}

/** 相关推荐需要的商品归属信息（只查分类，不查全套详情） */
export interface ProductMetaEntity {
  id: number
  categoryId: number
  categoryName: string
}
