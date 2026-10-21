/**
 * 分类模块 · 实体（Entity）
 * ----------------------------------------------------------------------------
 * categories 表的一行 + 聚合出来的在售商品数。
 *
 * 说明：商品表的分类字段是 products.category_id（外键式设计），
 * 分类名只存在 categories 表里，不做冗余存储 —— 改名只需要改一处。
 */

/** categories 表的一行（带该分类在售商品数） */
export interface CategoryEntity {
  id: number
  name: string
  /** 0 表示一级分类（当前所有分类都是一级） */
  parentId: number
  /** 导航栏展示顺序 */
  sortOrder: number
  /** 该分类下的在售商品数 */
  productCount: number
}
