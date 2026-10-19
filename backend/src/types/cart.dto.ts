/**
 * 购物车模块 · 请求 DTO（入参）
 * ----------------------------------------------------------------------------
 * 只描述 HTTP 请求体的形状，一条链路一个 DTO（比复用一个 CartItemDTO 更好校验）。
 *
 * 两条通用约定：
 *   1. userId 一律不放进 DTO —— 由鉴权中间件解析 token 后注入，
 *      否则客户端可以伪造 userId 操作别人的购物车；
 *   2. 这里只有类型，没有运行时校验。落地时需要加校验中间件（如 zod），
 *      校验规则见各字段的 JSDoc，与 docs/AGENTS.md 的「数据校验」要求对应。
 *
 * 注意：tsconfig 开启了 exactOptionalPropertyTypes，
 * 可选字段只能「不传」，不能显式传 undefined。
 */

/** POST /api/cart/items —— 加入购物车 */
export interface AddCartItemDTO {
  /** products.id，正整数，且商品必须存在、状态为上架 */
  productId: number
  /**
   * 购买数量，默认 1；必须为 1 ~ 当前库存的整数。
   * 前端已经把重复加购合并成同一行，服务端按 (user_id, product_id) upsert 累加。
   */
  quantity?: number
}

/** PATCH /api/cart/items/:productId —— 修改数量 */
export interface UpdateCartItemQuantityDTO {
  /**
   * 新数量，整数且 1 <= quantity <= 库存。
   * 传 0 不用于删除（删除请走 DELETE 接口），避免“数量清空”和“移除商品”两种语义混淆。
   */
  quantity: number
}

/** PATCH /api/cart/items/:productId/selected —— 单项勾选 / 取消勾选 */
export interface UpdateCartItemSelectedDTO {
  /** 目标勾选状态，对应 cart_items.is_selected */
  isSelected: boolean
}

/** PATCH /api/cart/selected —— 全选 / 取消全选 */
export interface UpdateAllSelectedDTO {
  /** true 全选，false 取消全选（作用于该用户购物车里的所有条目） */
  isSelected: boolean
}
