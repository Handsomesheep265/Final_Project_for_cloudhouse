/**
 * 分类模块 · 响应 VO（出参）
 * ----------------------------------------------------------------------------
 * 与前端 src/types/category.ts 对应：
 *   - list 按 sortOrder 升序，直接用于顶部导航；
 *   - 每个分类带 productCount，前端可以在 chip 上显示数量；
 *   - productTotal 是「全部」的兜底数字（前端「全部」是个聚合项，不落库）。
 */

/** 分类 */
export interface CategoryVO {
  id: number
  name: string
  parentId: number
  sortOrder: number
  /** 该分类在售商品数 */
  productCount: number
}

/** GET /api/categories */
export interface CategoryListVO {
  list: CategoryVO[]
  /** 分类个数 */
  total: number
  /** 全站在售商品数（给导航里的「全部」用） */
  productTotal: number
}
