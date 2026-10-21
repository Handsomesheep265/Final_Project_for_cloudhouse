/**
 * 商品服务层（Service）
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. 校验商品 ID / limit；
 *   2. 拼装详情 VO：商品 + 全部图片 + 卖家 + 分类 + 评价统计 + 收藏/购物车状态；
 *   3. 相关推荐：同分类、在售、排除自己；
 *   4. 决定「下架 / 售罄」怎么表达 —— 详情照常返回（用户点进来要能看到原因），
 *      由 statusText + stock 让前端决定按钮是否可用；只有商品真的不存在才 404。
 *
 * 不负责：SQL 与行映射（repositories）、HTTP 状态码与响应包装（controllers）。
 *
 * 注意：详情是公开接口，userId 允许为 null（未登录访客），
 * 此时 isFavorite=false、cartQuantity=0，不影响其余字段。
 */
import { productRepository, ProductRepository } from '../repositories/productRepositories'
import type { RelatedProductQueryDTO } from '../types/product.dto'
import type { ProductDetailEntity, ProductImageEntity, RelatedProductEntity } from '../types/product.entity'
import type {
  ProductDetailVO,
  ProductImageVO,
  RelatedProductListVO,
  RelatedProductVO,
} from '../types/product.vo'

/* ============================== 业务错误 ============================== */

/**
 * 错误码继续往后排，避免和购物车 / 订单 / 个人主页冲突：
 *   400xx 参数问题   404xx 资源不存在
 */
const PRODUCT_ERROR_SPECS = {
  invalidProductId: { code: 40011, httpStatus: 400, message: '商品 ID 不合法' },
  invalidLimit: { code: 40012, httpStatus: 400, message: '相关推荐条数不合法' },
  productNotFound: { code: 40407, httpStatus: 404, message: '商品不存在或已删除' },
} as const

export type ProductErrorSpec = (typeof PRODUCT_ERROR_SPECS)[keyof typeof PRODUCT_ERROR_SPECS]

/** 商品业务异常：带业务码与建议的 HTTP 状态码，由统一错误中间件转换 */
export class ProductError extends Error {
  readonly code: number
  readonly httpStatus: number

  constructor(spec: ProductErrorSpec, detail?: string) {
    super(detail ?? spec.message)
    this.name = 'ProductError'
    this.code = spec.code
    this.httpStatus = spec.httpStatus
  }
}

/** 供 controller / 测试引用错误码 */
export const PRODUCT_ERRORS = PRODUCT_ERROR_SPECS

/* ============================== 常量与工具 ============================== */

const DEFAULT_RELATED_LIMIT = 6
const MAX_RELATED_LIMIT = 12

/** 状态文案：详情页顶部的角标直接用 */
const STATUS_TEXT: Record<number, string> = {
  1: '在售',
  0: '已下架',
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function assertProductId(productId: number): void {
  if (!isPositiveInteger(productId)) {
    throw new ProductError(PRODUCT_ERROR_SPECS.invalidProductId, '商品 ID 必须是正整数')
  }
}

/** 评分保留两位小数，避免 4.333333333333333 直接怼到前端 */
function roundTo2(value: number): number {
  return Math.round(value * 100) / 100
}

/** 相关推荐条数：默认 6，必须是 1 ~ 12 的整数 */
function parseLimit(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_RELATED_LIMIT

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_RELATED_LIMIT) {
    throw new ProductError(
      PRODUCT_ERROR_SPECS.invalidLimit,
      `limit 必须是 1 ~ ${MAX_RELATED_LIMIT} 的整数`,
    )
  }
  return parsed
}

/** 实体 + 图片 → 详情 VO */
function toDetailVO(entity: ProductDetailEntity, images: ProductImageEntity[]): ProductDetailVO {
  const imageVOs: ProductImageVO[] = images.map((image) => ({
    id: image.id,
    url: image.imageUrl,
    sortOrder: image.sortOrder,
  }))

  return {
    id: entity.id,
    title: entity.title,
    description: entity.description,
    price: entity.price,
    stock: entity.stock,
    status: entity.status,
    statusText: STATUS_TEXT[entity.status] ?? '未知状态',
    // 图片已按 sort_order 升序，第一张就是封面
    coverImage: imageVOs[0]?.url ?? null,
    images: imageVOs,
    category: { id: entity.categoryId, name: entity.categoryName },
    seller: {
      id: entity.sellerId,
      nickname: entity.sellerName,
      avatarUrl: entity.sellerAvatarUrl,
      bio: entity.sellerBio,
    },
    reviews: {
      count: entity.reviewCount,
      average: roundTo2(entity.ratingAverage),
    },
    favoriteCount: entity.favoriteCount,
    isFavorite: entity.isFavorite,
    cartQuantity: entity.cartQuantity,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  }
}

function toRelatedVO(entity: RelatedProductEntity): RelatedProductVO {
  return {
    id: entity.id,
    title: entity.title,
    price: entity.price,
    stock: entity.stock,
    status: entity.status,
    coverImage: entity.imageUrl,
    sellerName: entity.sellerName,
  }
}

/* ============================== 服务实现 ============================== */

export class ProductService {
  constructor(private readonly repo: ProductRepository) {}

  /**
   * 商品详情。
   * @param userId 当前用户 id；未登录（或身份非法）传 null
   */
  async getProductDetail(userId: number | null, productId: number): Promise<ProductDetailVO> {
    assertProductId(productId)

    // 身份不合法就当匿名访客，而不是把商品详情也一起拒绝掉
    const viewerId = isPositiveInteger(userId) ? userId : null

    const [detail, images] = await Promise.all([
      this.repo.findDetail(productId, viewerId),
      this.repo.findImages(productId),
    ])

    if (!detail) {
      throw new ProductError(PRODUCT_ERROR_SPECS.productNotFound)
    }

    return toDetailVO(detail, images)
  }

  /** 相关推荐：同分类、在售、排除自己 */
  async listRelatedProducts(
    productId: number,
    query: RelatedProductQueryDTO,
  ): Promise<RelatedProductListVO> {
    assertProductId(productId)
    const limit = parseLimit(query.limit)

    const meta = await this.repo.findMeta(productId)
    if (!meta) {
      throw new ProductError(PRODUCT_ERROR_SPECS.productNotFound)
    }

    const related = await this.repo.findRelated(meta.categoryId, productId, limit)

    return {
      list: related.map(toRelatedVO),
      categoryId: meta.categoryId,
      categoryName: meta.categoryName,
    }
  }
}

/** 默认实例：仓储层用 src/config/database.ts 的连接池；单元测试可 new ProductService(fakeRepo) */
export const productService = new ProductService(productRepository)
