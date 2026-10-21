/**
 * 搜索模块 · 实体（Entity）
 * ----------------------------------------------------------------------------
 * 数据来自已建好的两张表，用的是 3.11 节建的 ngram 全文索引：
 *   products.ft_products_title  (title)    商品名搜索
 *   users.ft_users_nickname     (nickname) 店铺名搜索
 *
 * 全文检索的 SQL 形状是固定的：
 *   WHERE MATCH(列) AGAINST(? IN NATURAL LANGUAGE MODE)
 *   ORDER BY MATCH(列) AGAINST(?) DESC
 * 所以实体里都带上 score（相关度），service 不需要它，但排查排序问题时很有用。
 */

/** 商品搜索结果行（商品 + 卖家 + 封面） */
export interface ProductSearchEntity {
  id: number
  title: string
  price: number
  stock: number
  /** 1 上架（搜索只返回上架商品） */
  status: number
  /** 封面图，无图为 null */
  imageUrl: string | null
  sellerId: number
  sellerName: string
  /** MATCH ... AGAINST 的相关度分数 */
  score: number
}

/** 店铺（用户）搜索结果行 */
export interface ShopSearchEntity {
  id: number
  nickname: string
  avatarUrl: string | null
  bio: string | null
  /** 该店铺在售商品数（下架的不算） */
  productCount: number
  /** MATCH ... AGAINST 的相关度分数 */
  score: number
}
