/**
 * 购物车服务层（Service）
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. 业务校验 —— 商品是否存在、是否上架、库存是否足够、参数是否合法；
 *   2. 业务规则 —— 加购合并数量、数量上限截断、删除不存在的条目要报错；
 *   3. 数据组装 —— 实体 → VO，算小计与汇总（选中合计等），金额统一按分取整。
 *
 * 不负责：
 *   - SQL / 数据库行映射（repositories）
 *   - HTTP 状态码与响应包装（controllers，从 CartError 上取 code / httpStatus）
 *
 * 所有方法都要求调用方传入 userId：由鉴权中间件从 token 解析后传入，
 * 绝不能从请求体里读，否则可以操作别人的购物车。
 */
import { cartRepository, CartRepository } from '../repositories/cartRepositories'
import type { CartItemWithProductEntity } from '../types/cart.entity'
import type {
  AddCartItemDTO,
  UpdateAllSelectedDTO,
  UpdateCartItemQuantityDTO,
  UpdateCartItemSelectedDTO,
} from '../types/cart.dto'
import type {
  CartItemVO,
  CartProductVO,
  CartSummaryVO,
  CartVO,
} from '../types/cart.vo'

/* ============================== 业务错误 ============================== */

/**
 * 错误码分段约定：
 *   400xx 参数问题   404xx 资源不存在   409xx 状态冲突
 * controller 直接取 error.code / error.httpStatus 组装 ApiResponse。
 */
const CART_ERROR_SPECS = {
  invalidUserId: { code: 40000, httpStatus: 400, message: '用户信息缺失或非法' },
  invalidProductId: { code: 40002, httpStatus: 400, message: '商品 ID 不合法' },
  invalidQuantity: { code: 40001, httpStatus: 400, message: '数量必须是大于 0 的整数' },
  productNotFound: { code: 40401, httpStatus: 404, message: '商品不存在或已删除' },
  itemNotFound: { code: 40402, httpStatus: 404, message: '购物车中没有该商品' },
  productOffShelf: { code: 40901, httpStatus: 409, message: '商品已下架' },
  productSoldOut: { code: 40902, httpStatus: 409, message: '商品已售罄' },
  stockNotEnough: { code: 40903, httpStatus: 409, message: '库存不足' },
} as const

export type CartErrorSpec = (typeof CART_ERROR_SPECS)[keyof typeof CART_ERROR_SPECS]

/** 购物车业务异常：携带业务码与建议的 HTTP 状态码 */
export class CartError extends Error {
  readonly code: number
  readonly httpStatus: number

  constructor(spec: CartErrorSpec, detail?: string) {
    super(detail ?? spec.message)
    this.name = 'CartError'
    this.code = spec.code
    this.httpStatus = spec.httpStatus
  }
}

/** 供 controller / 测试引用错误码，避免散落魔法数字 */
export const CART_ERRORS = CART_ERROR_SPECS

/* ============================== 工具函数 ============================== */

/** 金额按分四舍五入，避免 15.5 * 3 出现 46.50000000000001 */
function roundToCents(value: number): number {
  return Math.round(value * 100) / 100
}

/** 数量/ID 必须是正整数（NaN、小数、负数、字符串都挡掉） */
function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function assertUserId(userId: number): void {
  if (!isPositiveInteger(userId)) {
    throw new CartError(CART_ERROR_SPECS.invalidUserId)
  }
}

function assertProductId(productId: number): void {
  if (!isPositiveInteger(productId)) {
    throw new CartError(CART_ERROR_SPECS.invalidProductId)
  }
}

/** 实体 → 条目 VO */
function toItemVO(entity: CartItemWithProductEntity): CartItemVO {
  const product: CartProductVO = {
    id: entity.product.id,
    title: entity.product.title,
    price: entity.product.price,
    stock: entity.product.stock,
    imageUrl: entity.product.imageUrl,
    sellerId: entity.product.sellerId,
    sellerName: entity.product.sellerName,
    sellerAvatarUrl: entity.product.sellerAvatarUrl,
    categoryId: entity.product.categoryId,
    categoryName: entity.product.categoryName,
  }

  return {
    id: entity.id,
    productId: entity.productId,
    quantity: entity.quantity,
    isSelected: entity.isSelected,
    product,
    lineTotal: roundToCents(entity.product.price * entity.quantity),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  }
}

/**
 * 汇总计算（选中合计就出在这里）
 * 字段与前端 stores/cartStore.ts 的 selector 一一对应。
 */
function buildSummary(items: CartItemVO[]): CartSummaryVO {
  let totalQuantity = 0
  let totalAmount = 0
  let selectedCount = 0
  let selectedQuantity = 0
  let selectedAmount = 0

  for (const item of items) {
    totalQuantity += item.quantity
    totalAmount += item.lineTotal
    if (item.isSelected) {
      selectedCount += 1
      selectedQuantity += item.quantity
      selectedAmount += item.lineTotal
    }
  }

  return {
    itemCount: items.length,
    totalQuantity,
    totalAmount: roundToCents(totalAmount),
    selectedCount,
    selectedQuantity,
    selectedAmount: roundToCents(selectedAmount),
    // 空购物车不算“全选”，否则前端全选框会显示成勾选状态
    allSelected: items.length > 0 && selectedCount === items.length,
  }
}

function toCartVO(entities: CartItemWithProductEntity[]): CartVO {
  const items = entities.map(toItemVO)
  return { items, summary: buildSummary(items) }
}

/* ============================== 服务实现 ============================== */

export class CartService {
  constructor(private readonly repo: CartRepository) {}

  /** 购物车页数据：条目列表 + 汇总 */
  async getCart(userId: number): Promise<CartVO> {
    assertUserId(userId)
    return toCartVO(await this.repo.findByUserId(userId))
  }

  /**
   * 加入购物车（同一商品合并数量）
   * ------------------------------------------------------------------
   * 校验链：商品存在 → 已上架 → 有库存 → 加完不超过库存。
   * 仓储层在事务里还会按库存再截断一次，用于兜住并发下的竞态，
   * 所以这里的检查主要是为了给出准确的错误信息。
   */
  async addItem(userId: number, dto: AddCartItemDTO): Promise<CartVO> {
    assertUserId(userId)
    assertProductId(dto.productId)

    const quantity = dto.quantity ?? 1
    if (!isPositiveInteger(quantity)) {
      throw new CartError(CART_ERROR_SPECS.invalidQuantity)
    }

    const product = await this.repo.findProductForCart(dto.productId)
    if (!product) {
      throw new CartError(CART_ERROR_SPECS.productNotFound)
    }
    if (product.status !== 1) {
      throw new CartError(CART_ERROR_SPECS.productOffShelf, `「${product.title}」已下架`)
    }
    if (product.stock <= 0) {
      throw new CartError(CART_ERROR_SPECS.productSoldOut, `「${product.title}」已售罄`)
    }

    // 已在购物车里就按合并后的总量判断，避免加着加着超库存
    const existing = await this.repo.findOne(userId, dto.productId)
    const alreadyInCart = existing ? existing.quantity : 0
    if (alreadyInCart + quantity > product.stock) {
      const remainder = product.stock - alreadyInCart
      throw new CartError(
        CART_ERROR_SPECS.stockNotEnough,
        remainder > 0
          ? `「${product.title}」库存仅剩 ${product.stock} 件，最多还能再加 ${remainder} 件`
          : `「${product.title}」库存仅剩 ${product.stock} 件`,
      )
    }

    await this.repo.addItem(userId, dto.productId, quantity, product.stock)
    return this.getCart(userId)
  }

  /**
   * 修改数量
   * ------------------------------------------------------------------
   * 条目不存在时报 404 而不是静默成功，免得前端以为改成功了。
   * 上限取购物车条目里快照的库存（下单前的最后一道校验由数据库/下单接口负责）。
   */
  async updateQuantity(
    userId: number,
    productId: number,
    dto: UpdateCartItemQuantityDTO,
  ): Promise<CartVO> {
    assertUserId(userId)
    assertProductId(productId)

    const quantity = dto.quantity
    if (!isPositiveInteger(quantity)) {
      throw new CartError(CART_ERROR_SPECS.invalidQuantity)
    }

    const existing = await this.repo.findOne(userId, productId)
    if (!existing) {
      throw new CartError(CART_ERROR_SPECS.itemNotFound)
    }
    if (quantity > existing.product.stock) {
      throw new CartError(
        CART_ERROR_SPECS.stockNotEnough,
        `「${existing.product.title}」库存仅剩 ${existing.product.stock} 件`,
      )
    }

    await this.repo.updateQuantity(userId, productId, quantity, existing.product.stock)
    return this.getCart(userId)
  }

  /** 单项勾选 / 取消勾选 */
  async updateSelected(
    userId: number,
    productId: number,
    dto: UpdateCartItemSelectedDTO,
  ): Promise<CartVO> {
    assertUserId(userId)
    assertProductId(productId)

    if (typeof dto.isSelected !== 'boolean') {
      throw new CartError(CART_ERROR_SPECS.invalidQuantity, 'isSelected 必须是布尔值')
    }

    const updated = await this.repo.updateSelected(userId, productId, dto.isSelected)
    if (!updated) {
      throw new CartError(CART_ERROR_SPECS.itemNotFound)
    }
    return this.getCart(userId)
  }

  /** 全选 / 取消全选（空购物车时直接返回空结果，不算错误） */
  async updateAllSelected(userId: number, dto: UpdateAllSelectedDTO): Promise<CartVO> {
    assertUserId(userId)

    if (typeof dto.isSelected !== 'boolean') {
      throw new CartError(CART_ERROR_SPECS.invalidQuantity, 'isSelected 必须是布尔值')
    }

    await this.repo.updateAllSelected(userId, dto.isSelected)
    return this.getCart(userId)
  }

  /** 移除单个商品 */
  async removeItem(userId: number, productId: number): Promise<CartVO> {
    assertUserId(userId)
    assertProductId(productId)

    const removed = await this.repo.removeItem(userId, productId)
    if (!removed) {
      throw new CartError(CART_ERROR_SPECS.itemNotFound)
    }
    return this.getCart(userId)
  }

  /** 清空购物车（幂等：本来就空也返回空购物车） */
  async clearCart(userId: number): Promise<CartVO> {
    assertUserId(userId)
    await this.repo.clearByUserId(userId)
    return this.getCart(userId)
  }
}

/** 默认实例：仓储层用 src/config/database.ts 的连接池；单元测试可 new CartService(fakeRepo) */
export const cartService = new CartService(cartRepository)
