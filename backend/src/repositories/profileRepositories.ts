/**
 * 个人主页仓储层（Repository）
 * ----------------------------------------------------------------------------
 * 只做数据访问：组装 SQL、执行、把行映射成实体。
 * 业务规则（昵称长度、商品是否存在、分页边界）一律在 profileService。
 *
 * 约定：
 *   - 所有查询都带 user_id 条件，service 从鉴权信息传入，杜绝看/改别人的主页；
 *   - 密码哈希不查、不映射 —— 需要校验密码时应走专门的鉴权模块；
 *   - 封面图统一取 product_images 里 sort_order 最小的那张（同序取 id 最小）。
 */
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { pool } from '../config/database'
import type {
  FavoriteItemEntity,
  ProfileStatsEntity,
  SellerProductEntity,
  UserEntity,
  UserProfilePatch,
} from '../types/profile.entity'

/** SQL 参数类型（mysql2 的 execute 只接受标量） */
type SqlParam = string | number | null

/* ============================== SQL ============================== */

const USER_COLUMNS = `
  id, nickname, avatar_url, bio, email, status, created_at, updated_at
`

const SELECT_USER = `
  SELECT ${USER_COLUMNS}
  FROM users
  WHERE id = ?
  LIMIT 1
`

/**
 * 个人主页的四个统计数字。
 * 一次查询用四个子查询算完，比调四次 COUNT 少三次往返；
 * 四个条件都命中索引（idx_products_seller / uk_user_product / idx_orders_user_created）。
 */
const COUNT_STATS = `
  SELECT
    (SELECT COUNT(*) FROM products  WHERE seller_id = ?) AS product_count,
    (SELECT COUNT(*) FROM favorites WHERE user_id   = ?) AS favorite_count,
    (SELECT COUNT(*) FROM orders    WHERE user_id   = ?) AS order_count,
    (SELECT COUNT(*) FROM reviews   WHERE user_id   = ?) AS review_count
`

/**
 * 收藏列表 + 商品快照 + 卖家昵称 + 封面图。
 * INNER JOIN：商品被物理删除后该收藏不再展示（前端「我的收藏」同样不显示）。
 */
const SELECT_FAVORITES = `
  SELECT
    f.id          AS id,
    f.user_id     AS user_id,
    f.product_id  AS product_id,
    f.created_at  AS created_at,
    p.title       AS title,
    p.price       AS price,
    p.stock       AS stock,
    p.status      AS status,
    p.seller_id   AS seller_id,
    u.nickname    AS seller_name,
    (
      SELECT pi.image_url
      FROM product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.sort_order ASC, pi.id ASC
      LIMIT 1
    )             AS image_url
  FROM favorites f
  INNER JOIN products p ON p.id = f.product_id
  INNER JOIN users u    ON u.id = p.seller_id
  WHERE f.user_id = ?
`

const COUNT_FAVORITES = `
  SELECT COUNT(*) AS total
  FROM favorites
  WHERE user_id = ?
`

const SELECT_FAVORITE_ONE = `
  ${SELECT_FAVORITES} AND f.product_id = ?
  LIMIT 1
`

/** 加收藏：唯一索引保证不会重复；重复时影响行数为 0（幂等） */
const INSERT_FAVORITE = `
  INSERT IGNORE INTO favorites (user_id, product_id)
  VALUES (?, ?)
`

const DELETE_FAVORITE = `
  DELETE FROM favorites
  WHERE user_id = ? AND product_id = ?
`

/** 收藏前校验商品是否存在（并顺手拿到快照，用于返回完整条目） */
const SELECT_PRODUCT_FOR_FAVORITE = `
  SELECT
    p.id        AS id,
    p.title     AS title,
    p.price     AS price,
    p.stock     AS stock,
    p.status    AS status,
    p.seller_id AS seller_id,
    u.nickname  AS seller_name,
    (
      SELECT pi.image_url
      FROM product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.sort_order ASC, pi.id ASC
      LIMIT 1
    )           AS image_url
  FROM products p
  INNER JOIN users u ON u.id = p.seller_id
  WHERE p.id = ?
  LIMIT 1
`

const SELECT_MY_PRODUCTS = `
  SELECT
    p.id         AS id,
    p.title      AS title,
    p.price      AS price,
    p.stock      AS stock,
    p.status     AS status,
    p.created_at AS created_at,
    (
      SELECT pi.image_url
      FROM product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.sort_order ASC, pi.id ASC
      LIMIT 1
    )            AS image_url
  FROM products p
  WHERE p.seller_id = ?
`

const COUNT_MY_PRODUCTS = `
  SELECT COUNT(*) AS total
  FROM products
  WHERE seller_id = ?
`

/* ============================ 行类型与映射 ============================ */

interface UserRow extends RowDataPacket {
  id: number
  nickname: string
  avatar_url: string | null
  bio: string | null
  email: string | null
  status: number
  created_at: Date | string
  updated_at: Date | string
}

interface StatsRow extends RowDataPacket {
  product_count: number | string
  favorite_count: number | string
  order_count: number | string
  review_count: number | string
}

interface FavoriteRow extends RowDataPacket {
  id: number
  user_id: number
  product_id: number
  created_at: Date | string
  title: string
  price: number | string
  stock: number
  status: number
  seller_id: number
  seller_name: string | null
  image_url: string | null
}

interface SellerProductRow extends RowDataPacket {
  id: number
  title: string
  price: number | string
  stock: number
  status: number
  created_at: Date | string
  image_url: string | null
}

/** 收藏前查的商品快照（没有 favorites 的列） */
interface ProductSnapshotRow extends RowDataPacket {
  id: number
  title: string
  price: number | string
  stock: number
  status: number
  seller_id: number
  seller_name: string | null
  image_url: string | null
}

interface CountRow extends RowDataPacket {
  total: number | string
}

function toNumber(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function mapUserRow(row: UserRow): UserEntity {
  return {
    id: row.id,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    email: row.email,
    status: row.status,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  }
}

function mapStatsRow(row: StatsRow | undefined): ProfileStatsEntity {
  return {
    productCount: toNumber(row?.product_count ?? 0),
    favoriteCount: toNumber(row?.favorite_count ?? 0),
    orderCount: toNumber(row?.order_count ?? 0),
    reviewCount: toNumber(row?.review_count ?? 0),
  }
}

function mapFavoriteRow(row: FavoriteRow): FavoriteItemEntity {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    createdAt: toDate(row.created_at),
    product: {
      id: row.product_id,
      title: row.title,
      price: toNumber(row.price),
      stock: row.stock,
      status: row.status,
      imageUrl: row.image_url,
      sellerId: row.seller_id,
      sellerName: row.seller_name ?? '匿名手作人',
    },
  }
}

function mapSellerProductRow(row: SellerProductRow): SellerProductEntity {
  return {
    id: row.id,
    title: row.title,
    price: toNumber(row.price),
    stock: row.stock,
    status: row.status,
    imageUrl: row.image_url,
    createdAt: toDate(row.created_at),
  }
}

/* ============================== 仓储实现 ============================== */

export interface PageOptions {
  /** 每页条数（service 已校验上限） */
  limit: number
  /** 偏移量 = (page - 1) * pageSize */
  offset: number
}

export class ProfileRepository {
  constructor(private readonly db: Pool) {}

  /** 按 id 查用户；不存在返回 null */
  async findUserById(userId: number): Promise<UserEntity | null> {
    const [rows] = await this.db.execute<UserRow[]>(SELECT_USER, [userId])
    const row = rows[0]
    return row ? mapUserRow(row) : null
  }

  /** 个人主页统计：商品 / 收藏 / 订单 / 评价 */
  async countStats(userId: number): Promise<ProfileStatsEntity> {
    const [rows] = await this.db.execute<StatsRow[]>(COUNT_STATS, [
      userId,
      userId,
      userId,
      userId,
    ])
    return mapStatsRow(rows[0])
  }

  /**
   * 更新资料，只写显式给出的字段。
   * @returns 是否命中记录（id 不存在时为 false）
   */
  async updateUser(userId: number, patch: UserProfilePatch): Promise<boolean> {
    const sets: string[] = []
    const params: SqlParam[] = []

    if (patch.nickname !== undefined) {
      sets.push('nickname = ?')
      params.push(patch.nickname)
    }
    if (patch.avatarUrl !== undefined) {
      sets.push('avatar_url = ?')
      params.push(patch.avatarUrl)
    }
    if (patch.bio !== undefined) {
      sets.push('bio = ?')
      params.push(patch.bio)
    }

    // 什么都没传：当作成功但不写库（service 会先拦掉这种情况）
    if (sets.length === 0) return true

    params.push(userId)
    const [result] = await this.db.execute<ResultSetHeader>(
      `UPDATE users SET ${sets.join(', ')} WHERE id = ?`,
      params,
    )
    return result.affectedRows > 0
  }

  /**
   * 我的收藏（按收藏时间倒序）
   * LIMIT / OFFSET 直接拼进 SQL：都是 service 校验过的整数，不存在注入风险。
   */
  async findFavorites(userId: number, options: PageOptions): Promise<FavoriteItemEntity[]> {
    const [rows] = await this.db.execute<FavoriteRow[]>(
      `${SELECT_FAVORITES} ORDER BY f.created_at DESC, f.id DESC LIMIT ${options.limit} OFFSET ${options.offset}`,
      [userId],
    )
    return rows.map(mapFavoriteRow)
  }

  async countFavorites(userId: number): Promise<number> {
    const [rows] = await this.db.execute<CountRow[]>(COUNT_FAVORITES, [userId])
    return toNumber(rows[0]?.total ?? 0)
  }

  /** 单个收藏；不存在返回 null */
  async findFavorite(userId: number, productId: number): Promise<FavoriteItemEntity | null> {
    const [rows] = await this.db.execute<FavoriteRow[]>(SELECT_FAVORITE_ONE, [userId, productId])
    const row = rows[0]
    return row ? mapFavoriteRow(row) : null
  }

  /** 加收藏；已经收藏过返回 false（幂等，不报错） */
  async addFavorite(userId: number, productId: number): Promise<boolean> {
    const [result] = await this.db.execute<ResultSetHeader>(INSERT_FAVORITE, [userId, productId])
    return result.affectedRows > 0
  }

  /** 取消收藏；本来没收藏返回 false */
  async removeFavorite(userId: number, productId: number): Promise<boolean> {
    const [result] = await this.db.execute<ResultSetHeader>(DELETE_FAVORITE, [userId, productId])
    return result.affectedRows > 0
  }

  /** 收藏前取商品快照；商品不存在返回 null */
  async findProductForFavorite(productId: number): Promise<FavoriteItemEntity['product'] | null> {
    const [rows] = await this.db.execute<ProductSnapshotRow[]>(SELECT_PRODUCT_FOR_FAVORITE, [
      productId,
    ])
    const row = rows[0]
    if (!row) return null

    return {
      id: row.id,
      title: row.title,
      price: toNumber(row.price),
      stock: row.stock,
      status: row.status,
      imageUrl: row.image_url,
      sellerId: row.seller_id,
      sellerName: row.seller_name ?? '匿名手作人',
    }
  }

  /** 我的商品（含下架），按发布时间倒序 */
  async findMyProducts(userId: number, options: PageOptions): Promise<SellerProductEntity[]> {
    const [rows] = await this.db.execute<SellerProductRow[]>(
      `${SELECT_MY_PRODUCTS} ORDER BY p.created_at DESC, p.id DESC LIMIT ${options.limit} OFFSET ${options.offset}`,
      [userId],
    )
    return rows.map(mapSellerProductRow)
  }

  async countMyProducts(userId: number): Promise<number> {
    const [rows] = await this.db.execute<CountRow[]>(COUNT_MY_PRODUCTS, [userId])
    return toNumber(rows[0]?.total ?? 0)
  }
}

/** 默认实例：连接池来自 src/config/database.ts；单元测试可自行 new ProfileRepository(mockPool) */
export const profileRepository = new ProfileRepository(pool)
