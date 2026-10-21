/**
 * 分类仓储层（Repository）
 * ----------------------------------------------------------------------------
 * 只做数据访问：分类列表 + 每个分类的在售商品数。
 * 商品本身按分类筛选的查询在 productRepositories（那边还要排序、分页、卖家信息）。
 *
 * 为什么用子查询算 productCount 而不是 JOIN + GROUP BY：
 *   分类只有个位数，子查询写法更直观，也不会因为某个分类没商品就把它漏掉
 *   （LEFT JOIN + GROUP BY 也能做到，但结果集合并顺序需要额外处理）。
 */
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { pool } from '../config/database'
import type { CategoryEntity } from '../types/category.entity'

/* ============================== SQL ============================== */

const SELECT_CATEGORIES = `
  SELECT
    c.id          AS id,
    c.name        AS name,
    c.parent_id   AS parent_id,
    c.sort_order  AS sort_order,
    (
      SELECT COUNT(*) FROM products p
      WHERE p.category_id = c.id AND p.status = 1
    )             AS product_count
  FROM categories c
  ORDER BY c.sort_order ASC, c.id ASC
`

/** 全站在售商品数，给导航里的「全部」用 */
const COUNT_ALL_PRODUCTS = `
  SELECT COUNT(*) AS total
  FROM products p
  WHERE p.status = 1
`

/* ============================ 行类型与映射 ============================ */

interface CategoryRow extends RowDataPacket {
  id: number
  name: string
  parent_id: number
  sort_order: number
  product_count: number | string
}

interface CountRow extends RowDataPacket {
  total: number | string
}

function toNumber(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapCategoryRow(row: CategoryRow): CategoryEntity {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    productCount: toNumber(row.product_count),
  }
}

/* ============================== 仓储实现 ============================== */

export class CategoryRepository {
  constructor(private readonly db: Pool) {}

  /** 全部分类，按 sortOrder 升序（导航栏顺序） */
  async findAll(): Promise<CategoryEntity[]> {
    const [rows] = await this.db.execute<CategoryRow[]>(SELECT_CATEGORIES)
    return rows.map(mapCategoryRow)
  }

  /** 全站在售商品数 */
  async countAllProducts(): Promise<number> {
    const [rows] = await this.db.execute<CountRow[]>(COUNT_ALL_PRODUCTS)
    return toNumber(rows[0]?.total ?? 0)
  }
}

/** 默认实例：连接池来自 src/config/database.ts */
export const categoryRepository = new CategoryRepository(pool)
