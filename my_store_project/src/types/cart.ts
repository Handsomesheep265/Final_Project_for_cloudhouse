/**
 * 购物车接口类型
 * ----------------------------------------------------------------------------
 * 与后端 backend/src/types/cart.vo.ts 一一对应（已用真实接口响应核对过字段），
 * 后端返回什么这里就声明什么，不要在中间再加工一层。
 *
 * 和旧版本（本地 mock）相比有三处关键变化：
 *   1. 没有 userId —— 后端以鉴权信息为准，不回传给前端；
 *   2. product 只包含购物车需要的字段，没有 rating / sales / tags；
 *   3. 图片字段叫 imageUrl / sellerAvatarUrl（URL 或存储路径），不再叫 image；
 *   4. 多了 lineTotal（服务端算好的小计）。
 */

/** 购物车里的商品快照 */
export interface CartProductVO {
  id: number
  title: string
  price: number
  stock: number
  imageUrl: string | null
  sellerId: number
  sellerName: string
  sellerAvatarUrl: string | null
  categoryId: number
  categoryName: string
}

/** 购物车条目 */
export interface CartItemVO {
  /** cart_items.id */
  id: number
  productId: number
  quantity: number
  isSelected: boolean
  product: CartProductVO
  /** 小计 = 单价 × 数量（服务端已按两位小数取整） */
  lineTotal: number
  createdAt: string
  updatedAt: string
}

/** 购物车汇总（服务端计算，前端不再自己算） */
export interface CartSummaryVO {
  itemCount: number
  totalQuantity: number
  totalAmount: number
  selectedCount: number
  selectedQuantity: number
  /** 选中合计 */
  selectedAmount: number
  allSelected: boolean
}

/** GET /api/cart 以及所有写操作的返回体 */
export interface CartVO {
  items: CartItemVO[]
  summary: CartSummaryVO
}

/** 后端统一响应体 */
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}
