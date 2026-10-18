/**
 * 线上手帐集市 · 前端领域类型
 * ----------------------------------------------------------------------------
 * 字段命名与 docs/DATABASE_DESIGN.md 中的表结构一一对应，只是把数据库的
 * snake_case 转成了前端习惯的 camelCase；后端返回裸数据时，在 api 层做一次
 * 转换即可直接复用这些类型。
 */

/** 分类（categories 表；id = 0 是前端聚合出来的“全部”） */
export interface Category {
  id: number
  name: string
  parentId: number
  sortOrder: number
}

/** 卖家（当前合并进 users 表） */
export interface SellerInfo {
  sellerName: string
  sellerAvatar: string | null
}

/** 商品原始字段（products 表） */
export interface ProductBase {
  id: number
  sellerId: number
  categoryId: number
  /** 商品标题 */
  title: string
  /** 商品描述 */
  description: string
  /** 价格，单位：元 */
  price: number
  /** 库存数量，0 表示已售罄 */
  stock: number
  /** 累计销量 */
  sales: number
  /** 评分（1-5） */
  rating: number
  /** 被喜欢次数 */
  likedCount: number
  /** 展示用标签 */
  tags: string[]
  /** 是否进入首页推荐位 */
  isRecommended: boolean
  /** 相对 src/assets 的图片路径，如 'products/xxx.png' */
  image: string
}

/** 商品（列表/推荐卡片渲染用的完整数据） */
export interface Product extends ProductBase, SellerInfo {
  categoryName: string
}

/** 商品排序方式 */
export type SortKey = 'default' | 'sales' | 'rating' | 'price-asc' | 'price-desc'

export interface SortOption {
  value: SortKey
  label: string
}

/** 商品筛选条件 */
export interface ProductFilters {
  keyword?: string
  categoryId?: number
  onlyInStock?: boolean
  sortBy?: SortKey
}

/** 界面主题 */
export type Theme = 'light' | 'dark'

/** 底部导航项标识 */
export type NavKey = 'home' | 'cart' | 'profile'

/** 「已加入购物车」提示 */
export interface ToastMessage {
  id: number
  text: string
}

/**
 * 购物车条目（cart_items 表）
 * ----------------------------------------------------------------------------
 * 前六个字段与 cart_items 一一对应（数据库 snake_case -> 前端 camelCase）。
 * 另外内嵌一份商品快照：购物车列表要显示标题、图片、单价、库存才能算总价、
 * 限制数量，这和 order_items 冗余保存 product_title / product_image /
 * unit_price 的思路一致，也避免购物车页再逐个查 products。
 */
export interface CartItem {
  /** cart_items.id，数据库自增；负数表示本地新增、尚未同步到后端 */
  id: number
  /** cart_items.user_id */
  userId: number
  /** cart_items.product_id */
  productId: number
  /** cart_items.quantity */
  quantity: number
  /**
   * cart_items.is_selected：是否勾选（用于“选中合计”）
   * 数据库里是 TINYINT 0/1，由 api 层转成 boolean 后传进来。
   */
  isSelected: boolean
  /** cart_items.created_at（ISO 8601 字符串） */
  createdAt: string
  /** cart_items.updated_at（ISO 8601 字符串） */
  updatedAt: string
  /** 商品快照（来自 products / product_images） */
  product: Product
}
