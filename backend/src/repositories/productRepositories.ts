/**
 * 商品仓储层（Repository）
 * ----------------------------------------------------------------------------
 * 只做数据访问：组装 SQL、执行、把行映射成实体。
 * 业务规则（商品是否存在、limit 边界、状态文案）一律在 productService。
 *
 * 详情页一次要拿「商品 + 卖家 + 分类 + 收藏数 + 评价统计 + 我的购物车数量」，
 * 这里用一条 JOIN + 几个相关子查询搞定，避免五六个来回；
 * 商品图是一对多，单独查一次再按 sort_order 排序。
 */
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { pool } from '../config/database'
import type {
  ProductDetailEntity,
  ProductImageEntity,
  ProductListEntity,
  ProductMetaEntity,
  RelatedProductEntity,
} from '../types/product.entity'

/* ============================== 常量 ============================== */

/** 列表排序方式（service 负责校验，这里负责映射成 ORDER BY） */
export type ProductSort = 'default' | 'price-asc' | 'price-desc' | 'sales' | 'rating'

export const PRODUCT_SORTS: readonly ProductSort[] = [
  'default',
  'price-asc',
  'price-desc',
  'sales',
  'rating',
]

/** 列表筛选条件 */
export interface ProductListFilters {
  /** 分类 id；null 表示全部 */
  categoryId: number | null
  /** 只看有货（stock > 0） */
  onlyInStock: boolean
  sort: ProductSort
  limit: number
  offset: number
}

/* ============================== SQL ============================== */

/**
 * 商品详情。
 * ------------------------------------------------------------------
 * 两个子查询都依赖 (product_id) 上的索引（favorites 的唯一索引前缀、
 * idx_reviews_product、idx_cart_user 前缀），不会随数据量线性变慢。
 *
 * 两个 `?` 都传「当前用户 id」：未登录时传 0，因为 user_id 从 1 开始，
 * 所以自然查不到收藏/购物车记录，不需要为「匿名」写第二套 SQL。
 */
const SELECT_DETAIL = `
  SELECT
    p.id            AS id,
    p.title         AS title,
    p.description   AS description,
    p.price         AS price,
    p.stock         AS stock,
    p.status        AS status,
    p.seller_id     AS seller_id,
    p.category_id   AS category_id,
    p.created_at    AS created_at,
    p.updated_at    AS updated_at,
    u.nickname      AS seller_name,
    u.avatar_url    AS seller_avatar_url,
    u.bio           AS seller_bio,
    c.name          AS category_name,
    (
      SELECT COUNT(*) FROM favorites f WHERE f.product_id = p.id
    )               AS favorite_count,
    (
      SELECT COUNT(*) FROM favorites f WHERE f.product_id = p.id AND f.user_id = ?
    )               AS my_favorite,
    (
      SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id
    )               AS review_count,
    (
      SELECT COALESCE(AVG(r.rating), 0) FROM reviews r WHERE r.product_id = p.id
    )               AS rating_average,
    (
      SELECT ci.quantity FROM cart_items ci
      WHERE ci.product_id = p.id AND ci.user_id = ?
      LIMIT 1
    )               AS cart_quantity
  FROM products p
  INNER JOIN users u      ON u.id = p.seller_id
  INNER JOIN categories c ON c.id = p.category_id
  WHERE p.id = ?
  LIMIT 1
`

const SELECT_IMAGES = `
  SELECT id, product_id, image_url, sort_order
  FROM product_images
  WHERE product_id = ?
  ORDER BY sort_order ASC, id ASC
`

/** 相关推荐只需要分类，不用把整套详情再查一遍 */
const SELECT_META = `
  SELECT p.id, p.category_id, c.name AS category_name
  FROM products p
  INNER JOIN categories c ON c.id = p.category_id
  WHERE p.id = ?
  LIMIT 1
`

/**
 * 相关推荐：同分类、在售、排除自己。
 * 排序把有货的排前面，再按上新时间倒序，卖光的商品不会占前几个位置。
 */
const SELECT_RELATED = `
  SELECT
    p.id         AS id,
    p.title      AS title,
    p.price      AS price,
    p.stock      AS stock,
    p.status     AS status,
    u.nickname   AS seller_name,
    (
      SELECT pi.image_url FROM product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.sort_order ASC, pi.id ASC
      LIMIT 1
    )            AS image_url
  FROM products p
  INNER JOIN users u ON u.id = p.seller_id
  WHERE p.category_id = ? AND p.id <> ? AND p.status = 1
  ORDER BY (p.stock > 0) DESC, p.created_at DESC, p.id DESC
`

/**
 * 商品列表（首页 / 分类筛选）。
 * ------------------------------------------------------------------
 * rating 与 sales 是派生指标：products 表没有这两列，
 * 用 reviews 平均分、order_items 累计件数现算，排序和卡片角标都用它。
 * WHERE 里的分类 / 有货条件、ORDER BY、LIMIT 由 buildListWhere + 排序表拼接，
 * 拼接进去的只有 service 校验过的枚举与整数，没有用户原样字符串。
 */
const SELECT_LIST = `
  SELECT
    p.id            AS id,
    p.title         AS title,
    p.description   AS description,
    p.price         AS price,
    p.stock         AS stock,
    p.status        AS status,
    p.seller_id     AS seller_id,
    p.category_id   AS category_id,
    p.created_at    AS created_at,
    u.nickname      AS seller_name,
    u.avatar_url    AS seller_avatar_url,
    c.name          AS category_name,
    (
      SELECT pi.image_url FROM product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.sort_order ASC, pi.id ASC
      LIMIT 1
    )               AS image_url,
    (
      SELECT COALESCE(AVG(r.rating), 0) FROM reviews r WHERE r.product_id = p.id
    )               AS rating,
    (
      SELECT COALESCE(SUM(oi.quantity), 0)
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id = p.id AND o.status <> 'CANCELED'
    )               AS sales
  FROM products p
  INNER JOIN users u      ON u.id = p.seller_id
  INNER JOIN categories c ON c.id = p.category_id
  WHERE p.status = 1
`

const COUNT_LIST = `
  SELECT COUNT(*) AS total
  FROM products p
  WHERE p.status = 1
`

/** 列表排序方式 → ORDER BY（别名可直接用于 ORDER BY） */
const LIST_ORDER_BY: Record<ProductSort, string> = {
  default: 'p.created_at DESC, p.id DESC',
  'price-asc': 'p.price ASC, p.id ASC',
  'price-desc': 'p.price DESC, p.id ASC',
  sales: 'sales DESC, p.id ASC',
  rating: 'rating DESC, p.id ASC',
}

/* ============================ 行类型与映射 ============================ */

interface ProductListRow extends RowDataPacket {
  id: number
  title: string
  description: string | null
  price: number | string
  stock: number
  status: number
  seller_id: number
  category_id: number
  created_at: Date | string
  seller_name: string | null
  seller_avatar_url: string | null
  category_name: string
  image_url: string | null
  rating: number | string
  sales: number | string
}

interface CountRow extends RowDataPacket {
  total: number | string
}

interface ProductDetailRow extends RowDataPacket {
  id: number
  title: string
  description: string | null
  /** DECIMAL(10,2)：连接池开了 decimalNumbers 是 number，否则可能是 string */
  price: number | string
  stock: number
  status: number
  seller_id: number
  category_id: number
  created_at: Date | string
  updated_at: Date | string
  seller_name: string | null
  seller_avatar_url: string | null
  seller_bio: string | null
  category_name: string
  favorite_count: number | string
  my_favorite: number | string
  review_count: number | string
  rating_average: number | string
  cart_quantity: number | null
}

interface ProductImageRow extends RowDataPacket {
  id: number
  product_id: number
  image_url: string
  sort_order: number
}

interface ProductMetaRow extends RowDataPacket {
  id: number
  category_id: number
  category_name: string
}

interface RelatedProductRow extends RowDataPacket {
  id: number
  title: string
  price: number | string
  stock: number
  status: number
  seller_name: string | null
  image_url: string | null
}

function toNumber(value: number | string | null): number {
  if (value === null) return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function mapDetailRow(row: ProductDetailRow): ProductDetailEntity {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: toNumber(row.price),
    stock: row.stock,
    status: row.status,
    sellerId: row.seller_id,
    sellerName: row.seller_name ?? '匿名手作人',
    sellerAvatarUrl: row.seller_avatar_url,
    sellerBio: row.seller_bio,
    categoryId: row.category_id,
    categoryName: row.category_name,
    favoriteCount: toNumber(row.favorite_count),
    isFavorite: toNumber(row.my_favorite) > 0,
    reviewCount: toNumber(row.review_count),
    ratingAverage: toNumber(row.rating_average),
    cartQuantity: toNumber(row.cart_quantity),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  }
}

function mapImageRow(row: ProductImageRow): ProductImageEntity {
  return {
    id: row.id,
    productId: row.product_id,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
  }
}

function mapRelatedRow(row: RelatedProductRow): RelatedProductEntity {
  return {
    id: row.id,
    title: row.title,
    price: toNumber(row.price),
    stock: row.stock,
    status: row.status,
    imageUrl: row.image_url,
    sellerName: row.seller_name ?? '匿名手作人',
  }
}

function mapListRow(row: ProductListRow): ProductListEntity {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: toNumber(row.price),
    stock: row.stock,
    status: row.status,
    imageUrl: row.image_url,
    sellerId: row.seller_id,
    sellerName: row.seller_name ?? '匿名手作人',
    sellerAvatarUrl: row.seller_avatar_url,
    categoryId: row.category_id,
    categoryName: row.category_name,
    rating: toNumber(row.rating),
    sales: toNumber(row.sales),
    createdAt: toDate(row.created_at),
  }
}

/**
 * 拼 WHERE 片段（分类 / 有货）。
 * 返回的字符串只包含 `AND xxx = ?` 与 `AND p.stock > 0`，
 * 参数走占位符，不会有注入。
 */
function buildListWhere(filters: Pick<ProductListFilters, 'categoryId' | 'onlyInStock'>): {
  where: string
  params: number[]
} {
  const conditions: string[] = []
  const params: number[] = []

  if (filters.categoryId !== null) {
    conditions.push('p.category_id = ?')
    params.push(filters.categoryId)
  }
  if (filters.onlyInStock) {
    conditions.push('p.stock > 0')
  }

  return { where: conditions.map((condition) => ` AND ${condition}`).join(''), params }
}

/* ============================== 仓储实现 ============================== */

export class ProductRepository {
  constructor(private readonly db: Pool) {}

  /**
   * 商品详情（含当前用户的收藏/购物车状态）。
   * @param userId 当前用户；未登录传 null（SQL 里按 0 处理，查不到即为默认值）
   */
  async findDetail(productId: number, userId: number | null): Promise<ProductDetailEntity | null> {
    const uid = userId ?? 0
    const [rows] = await this.db.execute<ProductDetailRow[]>(SELECT_DETAIL, [uid, uid, productId])
    const row = rows[0]
    return row ? mapDetailRow(row) : null
  }

  /** 商品图（sort_order 升序，第一张是封面） */
  async findImages(productId: number): Promise<ProductImageEntity[]> {
    const [rows] = await this.db.execute<ProductImageRow[]>(SELECT_IMAGES, [productId])
    return rows.map(mapImageRow)
  }

  /** 商品归属信息（存在性 + 分类），相关推荐用 */
  async findMeta(productId: number): Promise<ProductMetaEntity | null> {
    const [rows] = await this.db.execute<ProductMetaRow[]>(SELECT_META, [productId])
    const row = rows[0]
    return row ? { id: row.id, categoryId: row.category_id, categoryName: row.category_name } : null
  }

  /** 相关推荐：同分类在售商品，排除自己，按「有货优先 + 上新时间」排序 */
  async findRelated(
    categoryId: number,
    excludeProductId: number,
    limit: number,
  ): Promise<RelatedProductEntity[]> {
    // LIMIT 直接拼进 SQL：它是 service 校验过的整数，不存在注入风险
    const [rows] = await this.db.execute<RelatedProductRow[]>(
      `${SELECT_RELATED} LIMIT ${limit}`,
      [categoryId, excludeProductId],
    )
    return rows.map(mapRelatedRow)
  }

  /**
   * 商品列表（分类筛选 + 排序 + 分页）。
   * LIMIT / OFFSET / ORDER BY 都是 service 校验过的枚举与整数，直接拼接。
   */
  async findList(filters: ProductListFilters): Promise<ProductListEntity[]> {
    const { where, params } = buildListWhere(filters)
    const [rows] = await this.db.execute<ProductListRow[]>(
      `${SELECT_LIST}${where} ORDER BY ${LIST_ORDER_BY[filters.sort]} LIMIT ${filters.limit} OFFSET ${filters.offset}`,
      params,
    )
    return rows.map(mapListRow)
  }

  /** 列表命中总数（配合分页器 / 「共 N 件」提示） */
  async countList(
    filters: Pick<ProductListFilters, 'categoryId' | 'onlyInStock'>,
  ): Promise<number> {
    const { where, params } = buildListWhere(filters)
    const [rows] = await this.db.execute<CountRow[]>(`${COUNT_LIST}${where}`, params)
    return toNumber(rows[0]?.total ?? 0)
  }
}

/** 默认实例：连接池来自 src/config/database.ts；单元测试可自行 new ProductRepository(mockPool) */
export const productRepository = new ProductRepository(pool)
