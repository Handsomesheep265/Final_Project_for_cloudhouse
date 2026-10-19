/**
 * 购物车模块 · 响应 VO（出参）
 * ----------------------------------------------------------------------------
 * 与前端 src/types/index.ts 的 CartItem 保持同一套字段名，
 * 前端拿到 VO 后可以直接替换掉本地 mock 快照。
 *
 * 金额约定：都用 number（元），由 service 统一 round(2) 后返回；
 * 前端 formatePrice() 直接格式化即可。若后续要更严格的精度，
 * 可以整条链路换成“分”的整数或字符串，只需改这一层。
 */

/** 购物车里的商品快照（VO 版，字段与前端 Product 的购物车所需子集一致） */
export interface CartProductVO {
  /** 商品 id */
  id: number
  /** 商品标题 */
  title: string
  /** 单价（元） */
  price: number
  /** 当前库存，前端用它禁用 + 号 */
  stock: number
  /** 封面图 URL，无图为 null */
  imageUrl: string | null
  /** 卖家 id */
  sellerId: number
  /** 卖家昵称 */
  sellerName: string
  /** 卖家头像 URL，无头像为 null */
  sellerAvatarUrl: string | null
  /** 分类 id */
  categoryId: number
  /** 分类名 */
  categoryName: string
}

/** 购物车条目（一行） */
export interface CartItemVO {
  /** cart_items.id */
  id: number
  /** 商品 id，前端用它定位条目（增删改都以 productId 为业务主键） */
  productId: number
  /** 数量 */
  quantity: number
  /** 是否勾选，对应 cart_items.is_selected */
  isSelected: boolean
  /** 商品快照 */
  product: CartProductVO
  /** 小计 = 单价 × 数量，已按两位小数四舍五入 */
  lineTotal: number
  /** 加入时间（ISO 8601） */
  createdAt: string
  /** 最近更新时间（ISO 8601） */
  updatedAt: string
}

/**
 * 购物车汇总
 * ----------------------------------------------------------------------------
 * 字段与前端 stores/cartStore.ts 的派生 selector 一一对应，
 * 前端可以直接用服务端返回值替换本地计算：
 *   itemCount        ↔ selectItemCount
 *   totalQuantity    ↔ selectTotalQuantity
 *   totalAmount      ↔ selectTotalAmount
 *   selectedCount    ↔ selectSelectedCount
 *   selectedQuantity ↔ selectSelectedQuantity
 *   selectedAmount   ↔ selectSelectedAmount（选中合计）
 *   allSelected      ↔ selectAllSelected
 */
export interface CartSummaryVO {
  /** 商品种类数（条目数） */
  itemCount: number
  /** 商品总件数（各条目数量之和），用于底部导航角标 */
  totalQuantity: number
  /** 全部商品合计金额（不区分是否勾选） */
  totalAmount: number
  /** 已勾选的商品种类数 */
  selectedCount: number
  /** 已勾选的商品件数 */
  selectedQuantity: number
  /** 选中合计：只累加已勾选商品 */
  selectedAmount: number
  /** 是否全选（购物车为空时为 false） */
  allSelected: boolean
}

/** GET /api/cart —— 购物车页面的完整响应数据 */
export interface CartVO {
  /** 条目列表，按加入时间升序 */
  items: CartItemVO[]
  /** 汇总数据 */
  summary: CartSummaryVO
}
