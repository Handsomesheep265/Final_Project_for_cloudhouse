/**
 * 搜索仓储层（Repository）
 * ----------------------------------------------------------------------------
 * 只做数据访问：用 3.11 节建的 ngram 全文索引做 MATCH ... AGAINST，
 * 按相关度倒序分页；业务规则（关键词长度、type 取值、分页上限）在 searchService。
 *
 * 为什么用 NATURAL LANGUAGE MODE 而不是 BOOLEAN MODE：
 *   关键词是用户随手输入的，BOOLEAN MODE 里 + - * " ( ) @ 都有语法含义，
 *   用户输入「手帐本」没问题，但输入「+手帐」「手帐*」就会被当成运算符，
 *   轻则搜不到、重则语法错误。NATURAL LANGUAGE MODE 把输入当普通词，
 *   多个词按「或」匹配并算相关度，正好符合搜索框的直觉。
 *
 * 商品只返回上架（status = 1）的：搜索页不该出现已下架商品；
 * 店铺只返回状态正常的用户（users.status = 1）。
 */
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { pool } from '../config/database'
import type { ProductSearchEntity, ShopSearchEntity } from '../types/search.entity'

/* ============================== SQL ============================== */

const PRODUCT_SEARCH_HEAD = `
  SELECT
    p.id         AS id,
    p.title      AS title,
    p.price      AS price,
    p.stock      AS stock,
    p.status     AS status,
    p.seller_id  AS seller_id,
    u.nickname   AS seller_name,
    (
      SELECT pi.image_url FROM product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.sort_order ASC, pi.id ASC
      LIMIT 1
    )            AS image_url,
    MATCH(p.title) AGAINST(? IN NATURAL LANGUAGE MODE) AS score
  FROM products p
  INNER JOIN users u ON u.id = p.seller_id
  WHERE MATCH(p.title) AGAINST(? IN NATURAL LANGUAGE MODE)
    AND p.status = 1
  ORDER BY score DESC, p.id ASC
`

const SHOP_SEARCH_HEAD = `
  SELECT
    u.id         AS id,
    u.nickname   AS nickname,
    u.avatar_url AS avatar_url,
    u.bio        AS bio,
    (
      SELECT COUNT(*) FROM products p
      WHERE p.seller_id = u.id AND p.status = 1
    )            AS product_count,
    MATCH(u.nickname) AGAINST(? IN NATURAL LANGUAGE MODE) AS score
  FROM users u
  WHERE MATCH(u.nickname) AGAINST(? IN NATURAL LANGUAGE MODE)
    AND u.status = 1
  ORDER BY score DESC, u.id ASC
`

const COUNT_PRODUCTS = `
  SELECT COUNT(*) AS total
  FROM products p
  WHERE MATCH(p.title) AGAINST(? IN NATURAL LANGUAGE MODE)
    AND p.status = 1
`

const COUNT_SHOPS = `
  SELECT COUNT(*) AS total
  FROM users u
  WHERE MATCH(u.nickname) AGAINST(? IN NATURAL LANGUAGE MODE)
    AND u.status = 1
`

/* ============================ 行类型与映射 ============================ */

interface ProductSearchRow extends RowDataPacket {
  id: number
  title: string
  price: number | string
  stock: number
  status: number
  seller_id: number
  seller_name: string | null
  image_url: string | null
  score: number | string
}

interface ShopSearchRow extends RowDataPacket {
  id: number
  nickname: string
  avatar_url: string | null
  bio: string | null
  product_count: number | string
  score: number | string
}

interface CountRow extends RowDataPacket {
  total: number | string
}

function toNumber(value: number | string | null): number {
  if (value === null) return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapProductRow(row: ProductSearchRow): ProductSearchEntity {
  return {
    id: row.id,
    title: row.title,
    price: toNumber(row.price),
    stock: row.stock,
    status: row.status,
    imageUrl: row.image_url,
    sellerId: row.seller_id,
    sellerName: row.seller_name ?? '匿名手作人',
    score: toNumber(row.score),
  }
}

function mapShopRow(row: ShopSearchRow): ShopSearchEntity {
  return {
    id: row.id,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    productCount: toNumber(row.product_count),
    score: toNumber(row.score),
  }
}

/* ============================== 仓储实现 ============================== */

export interface SearchPageOptions {
  /** 每页条数（service 已校验上限） */
  limit: number
  /** 偏移量 = (page - 1) * pageSize */
  offset: number
}

export class SearchRepository {
  constructor(private readonly db: Pool) {}

  /** 搜商品：按相关度倒序，只返回上架商品 */
  async searchProducts(keyword: string, options: SearchPageOptions): Promise<ProductSearchEntity[]> {
    // LIMIT / OFFSET 直接拼进 SQL：都是 service 校验过的整数，不存在注入风险
    const [rows] = await this.db.execute<ProductSearchRow[]>(
      `${PRODUCT_SEARCH_HEAD} LIMIT ${options.limit} OFFSET ${options.offset}`,
      [keyword, keyword],
    )
    return rows.map(mapProductRow)
  }

  /** 商品命中总数 */
  async countProducts(keyword: string): Promise<number> {
    const [rows] = await this.db.execute<CountRow[]>(COUNT_PRODUCTS, [keyword])
    return toNumber(rows[0]?.total ?? 0)
  }

  /** 搜店铺：按相关度倒序，只返回状态正常的用户 */
  async searchShops(keyword: string, options: SearchPageOptions): Promise<ShopSearchEntity[]> {
    const [rows] = await this.db.execute<ShopSearchRow[]>(
      `${SHOP_SEARCH_HEAD} LIMIT ${options.limit} OFFSET ${options.offset}`,
      [keyword, keyword],
    )
    return rows.map(mapShopRow)
  }

  /** 店铺命中总数 */
  async countShops(keyword: string): Promise<number> {
    const [rows] = await this.db.execute<CountRow[]>(COUNT_SHOPS, [keyword])
    return toNumber(rows[0]?.total ?? 0)
  }
}

/** 默认实例：连接池来自 src/config/database.ts；单元测试可自行 new SearchRepository(mockPool) */
export const searchRepository = new SearchRepository(pool)
