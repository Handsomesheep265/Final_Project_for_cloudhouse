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
