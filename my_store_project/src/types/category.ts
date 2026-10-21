/**
 * 分类接口类型
 * ----------------------------------------------------------------------------
 * 与后端 backend/src/types/category.vo.ts 一一对应：
 *   - list 已按 sortOrder 排好，直接用于顶部导航；
 *   - productCount 是该分类的在售商品数；
 *   - productTotal 是全站在售商品数（导航里「全部」用）。
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
  /** 全站在售商品数 */
  productTotal: number
}
