/**
 * 购物车仓储层（Repository）
 * ----------------------------------------------------------------------------
 * 职责：只做数据访问 —— 组装 SQL、执行、把数据库行映射成实体。
 * 业务规则（库存校验、金额合计、是否上架）一律留给 service，不在这里判断。
 *
 * 约定：
 *   - 所有查询都带 user_id 条件，service 从鉴权信息传入，杜绝越权访问别人的购物车；
 *   - cart_items 在数据库里有 uk_user_product(user_id, product_id) 唯一索引，
 *     所以仓储层以 (userId, productId) 作为业务主键，而不是自增 id；
 *   - DECIMAL 由连接池的 decimalNumbers 转成 number，但映射函数同时兼容字符串，
 *     以便有人关掉该选项或用别的驱动时不会静默算错。
 */
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { pool } from '../config/database'
import type { CartItemWithProductEntity, CartProductSnapshotEntity } from '../types/cart.entity'

/** 加购 / 改数量前校验用的商品信息：商品快照 + 上架状态 */
export interface ProductForCartEntity extends CartProductSnapshotEntity {
  /** products.status：1 上架，0 下架 */
  status: number
}

/* ============================== SQL ============================== */

/**
 * 购物车 + 商品 + 卖家 + 分类 + 封面图
 * ------------------------------------------------------------------
 * 封面图取 product_images 里 sort_order 最小的那张（同序号再按 id 兜底）。
 * 用 INNER JOIN：商品被物理删除后条目自然不返回，service 侧可据此清理脏数据。
 */
const CART_ITEM_SELECT = `
  SELECT
    ci.id           AS id,
    ci.user_id      AS user_id,
    ci.product_id   AS product_id,
    ci.quantity     AS quantity,
    ci.is_selected  AS is_selected,
    ci.created_at   AS created_at,
    ci.updated_at   AS updated_at,
    p.title         AS title,
    p.price         AS price,
    p.stock         AS stock,
    p.seller_id     AS seller_id,
    p.category_id   AS category_id,
    u.nickname      AS seller_name,
    u.avatar_url    AS seller_avatar_url,
    c.name          AS category_name,
    (
      SELECT pi.image_url
      FROM product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.sort_order ASC, pi.id ASC
      LIMIT 1
    )               AS image_url
  FROM cart_items ci
  INNER JOIN products p   ON p.id = ci.product_id
  INNER JOIN users u      ON u.id = p.seller_id
  INNER JOIN categories c ON c.id = p.category_id
`

const SELECT_BY_USER = `
  ${CART_ITEM_SELECT}
  WHERE ci.user_id = ?
  ORDER BY ci.created_at ASC, ci.id ASC
`

const SELECT_ONE = `
  ${CART_ITEM_SELECT}
  WHERE ci.user_id = ? AND ci.product_id = ?
  LIMIT 1
`

const SELECT_PRODUCT_FOR_CART = `
  SELECT
    p.id         AS id,
    p.title      AS title,
    p.price      AS price,
    p.stock      AS stock,
    p.status     AS status,
    p.seller_id  AS seller_id,
    p.category_id AS category_id,
    u.nickname   AS seller_name,
    u.avatar_url AS seller_avatar_url,
    c.name       AS category_name,
    (
      SELECT pi.image_url
      FROM product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.sort_order ASC, pi.id ASC
      LIMIT 1
    )            AS image_url
  FROM products p
  INNER JOIN users u      ON u.id = p.seller_id
  INNER JOIN categories c ON c.id = p.category_id
  WHERE p.id = ?
  LIMIT 1
`

/** 加购物车时锁住该用户的这一行，避免并发重复插入 */
const SELECT_QUANTITY_FOR_UPDATE = `
  SELECT quantity
  FROM cart_items
  WHERE user_id = ? AND product_id = ?
  FOR UPDATE
`

const INSERT_ITEM = `
  INSERT INTO cart_items (user_id, product_id, quantity, is_selected)
  VALUES (?, ?, ?, 1)
`

const UPDATE_QUANTITY = `
  UPDATE cart_items
  SET quantity = ?, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = ? AND product_id = ?
`

const UPDATE_SELECTED = `
  UPDATE cart_items
  SET is_selected = ?, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = ? AND product_id = ?
`

const UPDATE_ALL_SELECTED = `
  UPDATE cart_items
  SET is_selected = ?, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = ?
`

const DELETE_ONE = `
  DELETE FROM cart_items
  WHERE user_id = ? AND product_id = ?
`

const DELETE_SELECTED = `
  DELETE FROM cart_items
  WHERE user_id = ? AND is_selected = 1
`

const DELETE_ALL = `
  DELETE FROM cart_items
  WHERE user_id = ?
`

/* ============================ 行类型与映射 ============================ */

/** 联表查询的一行（列名保持数据库的 snake_case） */
interface CartItemJoinRow extends RowDataPacket {
  id: number
  user_id: number
  product_id: number
  quantity: number
  /** TINYINT，开启 decimalNumbers 也不影响；兼容 0/1、'0'/'1'、boolean */
  is_selected: number | string | boolean
  created_at: Date | string
  updated_at: Date | string
  title: string
  /** DECIMAL(10,2)：连接池开了 decimalNumbers 时是 number，否则可能是 string */
  price: number | string
  stock: number
  seller_id: number
  category_id: number
  seller_name: string | null
  seller_avatar_url: string | null
  category_name: string
  image_url: string | null
}

interface ProductForCartRow extends RowDataPacket {
  id: number
  title: string
  price: number | string
  stock: number
  status: number
  seller_id: number
  category_id: number
  seller_name: string | null
  seller_avatar_url: string | null
  category_name: string
  image_url: string | null
}

interface QuantityRow extends RowDataPacket {
  quantity: number
}

function toNumber(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toBoolean(value: number | string | boolean): boolean {
  return value === true || value === 1 || value === '1'
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function mapCartItemRow(row: CartItemJoinRow): CartItemWithProductEntity {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    quantity: row.quantity,
    isSelected: toBoolean(row.is_selected),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    product: {
      // 没单独查 p.id，product 的 id 就是 cart_items.product_id
      id: row.product_id,
      title: row.title,
      price: toNumber(row.price),
      stock: row.stock,
      imageUrl: row.image_url,
      sellerId: row.seller_id,
      sellerName: row.seller_name ?? '匿名手作人',
      sellerAvatarUrl: row.seller_avatar_url,
      categoryId: row.category_id,
      categoryName: row.category_name,
    },
  }
}

function mapProductRow(row: ProductForCartRow): ProductForCartEntity {
  return {
    id: row.id,
    title: row.title,
    price: toNumber(row.price),
    stock: row.stock,
    imageUrl: row.image_url,
    sellerId: row.seller_id,
    sellerName: row.seller_name ?? '匿名手作人',
    sellerAvatarUrl: row.seller_avatar_url,
    categoryId: row.category_id,
    categoryName: row.category_name,
    status: row.status,
  }
}

/* ============================== 事务工具 ============================== */

async function withTransaction<T>(
  connectionPool: Pool,
  run: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await connectionPool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await run(connection)
    await connection.commit()
    return result
  } catch (error) {
    try {
      await connection.rollback()
    } catch {
      // 连接已断开时回滚也会失败，忽略它，抛出原始错误更有价值
    }
    throw error
  } finally {
    connection.release()
  }
}

/* ============================== 仓储实现 ============================== */

export class CartRepository {
  constructor(private readonly db: Pool) {}

  /** 购物车列表（按加入时间升序） */
  async findByUserId(userId: number): Promise<CartItemWithProductEntity[]> {
    const [rows] = await this.db.execute<CartItemJoinRow[]>(SELECT_BY_USER, [userId])
    return rows.map(mapCartItemRow)
  }

  /** 单个条目；不存在返回 null */
  async findOne(userId: number, productId: number): Promise<CartItemWithProductEntity | null> {
    const [rows] = await this.db.execute<CartItemJoinRow[]>(SELECT_ONE, [userId, productId])
    return rows[0] ? mapCartItemRow(rows[0]) : null
  }

  /** 取商品快照 + 库存 + 上架状态，供 service 做加购/改数量校验 */
  async findProductForCart(productId: number): Promise<ProductForCartEntity | null> {
    const [rows] = await this.db.execute<ProductForCartRow[]>(SELECT_PRODUCT_FOR_CART, [productId])
    return rows[0] ? mapProductRow(rows[0]) : null
  }

  /**
   * 加购：同一 (user_id, product_id) 已存在则累加数量，否则插入。
   * ------------------------------------------------------------------
   * 用「事务 + SELECT ... FOR UPDATE」实现，而不是 INSERT ... ON DUPLICATE KEY UPDATE：
   * 后者在 MySQL 8.0.19+/MariaDB 上的语法不同（别名 vs VALUES()），
   * 这里换个写法保证 5.7 / 8.x / MariaDB 都能跑，同时锁住行避免并发重复插入。
   *
   * @param maxQuantity 数量上限（通常是商品库存），累加结果不会超过它
   * @returns 写入后的条目快照；商品不存在时返回 null
   */
  async addItem(
    userId: number,
    productId: number,
    quantity: number,
    maxQuantity: number,
  ): Promise<CartItemWithProductEntity | null> {
    await withTransaction(this.db, async (connection) => {
      const [rows] = await connection.execute<QuantityRow[]>(SELECT_QUANTITY_FOR_UPDATE, [
        userId,
        productId,
      ])
      const existing = rows[0]
      const baseQuantity = existing ? existing.quantity : 0
      // 至少 1 件，且不超过库存上限
      const nextQuantity = Math.max(1, Math.min(baseQuantity + quantity, maxQuantity))

      if (existing) {
        // 已经存在就只改数量，保留用户之前的勾选状态
        await connection.execute<ResultSetHeader>(UPDATE_QUANTITY, [
          nextQuantity,
          userId,
          productId,
        ])
      } else {
        await connection.execute<ResultSetHeader>(INSERT_ITEM, [userId, productId, nextQuantity])
      }
    })

    return this.findOne(userId, productId)
  }

  /**
   * 设置数量。
   * @param maxQuantity 数量上限（库存），超出会被截到该值
   * @returns 是否命中记录（需要连接池开启 FOUND_ROWS，否则“值没变化”也会返回 false）
   */
  async updateQuantity(
    userId: number,
    productId: number,
    quantity: number,
    maxQuantity: number,
  ): Promise<boolean> {
    const nextQuantity = Math.max(1, Math.min(quantity, maxQuantity))
    const [result] = await this.db.execute<ResultSetHeader>(UPDATE_QUANTITY, [
      nextQuantity,
      userId,
      productId,
    ])
    return result.affectedRows > 0
  }

  /** 单项勾选 / 取消勾选 */
  async updateSelected(
    userId: number,
    productId: number,
    isSelected: boolean,
  ): Promise<boolean> {
    const [result] = await this.db.execute<ResultSetHeader>(UPDATE_SELECTED, [
      isSelected ? 1 : 0,
      userId,
      productId,
    ])
    return result.affectedRows > 0
  }

  /** 全选 / 取消全选，返回受影响的条目数 */
  async updateAllSelected(userId: number, isSelected: boolean): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(UPDATE_ALL_SELECTED, [
      isSelected ? 1 : 0,
      userId,
    ])
    return result.affectedRows
  }

  /** 移除单个商品 */
  async removeItem(userId: number, productId: number): Promise<boolean> {
    const [result] = await this.db.execute<ResultSetHeader>(DELETE_ONE, [userId, productId])
    return result.affectedRows > 0
  }

  /** 删除所有已勾选的条目（结算前清理 / 批量删除），返回删除条数 */
  async removeSelected(userId: number): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(DELETE_SELECTED, [userId])
    return result.affectedRows
  }

  /** 清空该用户的购物车，返回删除条数 */
  async clearByUserId(userId: number): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(DELETE_ALL, [userId])
    return result.affectedRows
  }
}

/** 默认实例：连接池来自 src/config/database.ts；单元测试可自行 new CartRepository(mockPool) */
export const cartRepository = new CartRepository(pool)
