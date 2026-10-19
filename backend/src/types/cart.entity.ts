/**
 * 购物车模块 · 实体（Entity）
 * ----------------------------------------------------------------------------
 * 与 docs/DATABASE_DESIGN.md 3.5 节 cart_items 表一一对应。
 *
 * 命名约定：
 *   - 数据库列名是 snake_case，仓库层（repositories）负责转成这里的 camelCase，
 *     映射只发生在这一层，service 及以上不再关心列名；
 *   - DECIMAL(10,2) 在本层用 number 表示。若用 mysql2 直连，DECIMAL 默认返回字符串，
 *     需要在查询时开启 decimalNumbers: true，或在映射时 Number(value)；
 *   - DATETIME 在本层用 Date（驱动返回 Date），转成 ISO 字符串是 VO 的职责。
 */

/** cart_items 表的一行（对应一个“用户 × 商品”的购物车条目） */
export interface CartItemEntity {
  /** cart_items.id 主键 */
  id: number
  /** cart_items.user_id 所属用户 */
  userId: number
  /** cart_items.product_id 商品 */
  productId: number
  /** cart_items.quantity 数量，取值 1 ~ 商品库存 */
  quantity: number
  /** cart_items.is_selected：数据库是 TINYINT(0/1)，仓库层转成 boolean */
  isSelected: boolean
  /** cart_items.created_at */
  createdAt: Date
  /** cart_items.updated_at */
  updatedAt: Date
}

/**
 * 商品快照（联表结果）
 * ----------------------------------------------------------------------------
 * 购物车要显示标题、单价、库存、封面图、卖家才能算小计并限制数量。
 * 数据来源：products + users(卖家) + categories + product_images(封面)。
 * 与 order_items 冗余保存 product_title / product_image / unit_price 的思路一致。
 */
export interface CartProductSnapshotEntity {
  /** products.id */
  id: number
  /** products.title */
  title: string
  /** products.price（单价） */
  price: number
  /** products.stock（当前库存，用于限制数量上限） */
  stock: number
  /** product_images 中 sort_order 最小的一张图；商品没图时为 null */
  imageUrl: string | null
  /** products.seller_id */
  sellerId: number
  /** users.nickname（卖家昵称） */
  sellerName: string
  /** users.avatar_url（卖家头像） */
  sellerAvatarUrl: string | null
  /** products.category_id */
  categoryId: number
  /** categories.name */
  categoryName: string
}

/** 购物车条目 + 商品快照：仓库层联表查询后交给 service 的结构 */
export interface CartItemWithProductEntity extends CartItemEntity {
  product: CartProductSnapshotEntity
}
