/**
 * 个人主页服务层（Service）
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. 资料读写 —— 校验昵称/头像/简介，只更新用户显式给出的字段；
 *   2. 统计数字 —— 商品 / 收藏 / 订单 / 评价，一次查询算完；
 *   3. 收藏管理 —— 加收藏前校验商品存在，重复收藏与重复取消都按幂等处理；
 *   4. 我的商品 —— 卖家视角（含下架），分页返回。
 *
 * 不负责：SQL 与行映射（repositories）、HTTP 状态码与响应包装（controllers）。
 *
 * 所有方法都要求调用方传入 userId：URL 里没有用户参数，
 * 「只能看/改自己的主页」由鉴权中间件保证。
 */
import { profileRepository, ProfileRepository } from '../repositories/profileRepositories'
import type { ProfilePageQueryDTO, UpdateProfileDTO } from '../types/profile.dto'
import type {
  FavoriteItemEntity,
  ProfileStatsEntity,
  SellerProductEntity,
  UserEntity,
  UserProfilePatch,
} from '../types/profile.entity'
import type {
  FavoriteItemVO,
  FavoriteListVO,
  FavoriteToggleVO,
  ProfileVO,
  SellerProductListVO,
  SellerProductVO,
} from '../types/profile.vo'

/* ============================== 业务错误 ============================== */

/**
 * 错误码分段（与购物车 / 订单模块错开，不重复占用）：
 *   400xx 参数问题   404xx 资源不存在
 */
const PROFILE_ERROR_SPECS = {
  invalidUserId: { code: 40000, httpStatus: 400, message: '用户信息缺失或非法' },
  invalidNickname: { code: 40005, httpStatus: 400, message: '昵称不合法' },
  invalidBio: { code: 40006, httpStatus: 400, message: '个人简介不合法' },
  invalidAvatar: { code: 40007, httpStatus: 400, message: '头像地址不合法' },
  emptyUpdate: { code: 40008, httpStatus: 400, message: '没有需要更新的内容' },
  invalidQuery: { code: 40009, httpStatus: 400, message: '查询参数不合法' },
  invalidProductId: { code: 40010, httpStatus: 400, message: '商品 ID 不合法' },
  userNotFound: { code: 40405, httpStatus: 404, message: '用户不存在' },
  productNotFound: { code: 40406, httpStatus: 404, message: '商品不存在或已删除' },
} as const

export type ProfileErrorSpec = (typeof PROFILE_ERROR_SPECS)[keyof typeof PROFILE_ERROR_SPECS]

/** 个人主页业务异常：带业务码与建议的 HTTP 状态码，由统一错误中间件转换 */
export class ProfileError extends Error {
  readonly code: number
  readonly httpStatus: number

  constructor(spec: ProfileErrorSpec, detail?: string) {
    super(detail ?? spec.message)
    this.name = 'ProfileError'
    this.code = spec.code
    this.httpStatus = spec.httpStatus
  }
}

/** 供 controller / 测试引用错误码 */
export const PROFILE_ERRORS = PROFILE_ERROR_SPECS

/* ============================== 常量与工具 ============================== */

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 12
const MAX_PAGE_SIZE = 50

const NICKNAME_MAX = 50
const BIO_MAX = 200
const AVATAR_MAX = 500

/** 头像地址不允许出现空白字符（URL / assets 相对路径都不该有） */
const WHITESPACE = /\s/

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function assertUserId(userId: number): void {
  if (!isPositiveInteger(userId)) {
    throw new ProfileError(PROFILE_ERROR_SPECS.invalidUserId)
  }
}

function assertProductId(productId: number): void {
  if (!isPositiveInteger(productId)) {
    throw new ProfileError(PROFILE_ERROR_SPECS.invalidProductId)
  }
}

/** 昵称：去空白后 1 ~ 50 字符 */
function normalizeNickname(raw: string): string {
  const nickname = typeof raw === 'string' ? raw.trim() : ''
  if (nickname.length === 0) {
    throw new ProfileError(PROFILE_ERROR_SPECS.invalidNickname, '昵称不能为空')
  }
  if (nickname.length > NICKNAME_MAX) {
    throw new ProfileError(
      PROFILE_ERROR_SPECS.invalidNickname,
      `昵称不能超过 ${NICKNAME_MAX} 个字符`,
    )
  }
  return nickname
}

/** 简介：去空白后最长 200 字符；空串表示清空（存 null） */
function normalizeBio(raw: string | null): string | null {
  if (raw === null) return null

  const bio = typeof raw === 'string' ? raw.trim() : ''
  if (bio.length === 0) return null
  if (bio.length > BIO_MAX) {
    throw new ProfileError(PROFILE_ERROR_SPECS.invalidBio, `个人简介不能超过 ${BIO_MAX} 个字符`)
  }
  return bio
}

/** 头像：最长 500，不允许空白字符；空串表示清除（存 null） */
function normalizeAvatarUrl(raw: string | null): string | null {
  if (raw === null) return null

  const avatarUrl = typeof raw === 'string' ? raw.trim() : ''
  if (avatarUrl.length === 0) return null
  if (avatarUrl.length > AVATAR_MAX) {
    throw new ProfileError(PROFILE_ERROR_SPECS.invalidAvatar, `头像地址不能超过 ${AVATAR_MAX} 个字符`)
  }
  if (WHITESPACE.test(avatarUrl)) {
    throw new ProfileError(PROFILE_ERROR_SPECS.invalidAvatar, '头像地址不能包含空格')
  }
  return avatarUrl
}

/**
 * 校验并整理要写入的字段。
 * 只有「显式给出」的字段才会进 patch —— 这正是 PATCH 的语义：
 * 不传就不改，传 null / 空串才是清空。
 */
function buildPatch(dto: UpdateProfileDTO): UserProfilePatch {
  const patch: UserProfilePatch = {}

  if (dto.nickname !== undefined) patch.nickname = normalizeNickname(dto.nickname)
  if (dto.avatarUrl !== undefined) patch.avatarUrl = normalizeAvatarUrl(dto.avatarUrl)
  if (dto.bio !== undefined) patch.bio = normalizeBio(dto.bio)

  if (Object.keys(patch).length === 0) {
    throw new ProfileError(
      PROFILE_ERROR_SPECS.emptyUpdate,
      '请至少提供一个要更新的字段（nickname / avatarUrl / bio）',
    )
  }
  return patch
}

/** 解析分页参数：不传用默认值，传了就必须是正整数 */
function parsePositiveInt(raw: string | undefined, fallback: number, field: string): number {
  if (raw === undefined || raw === '') return fallback

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProfileError(PROFILE_ERROR_SPECS.invalidQuery, `${field} 必须是正整数`)
  }
  return parsed
}

/** 实体 → VO */
function toProfileVO(user: UserEntity, stats: ProfileStatsEntity): ProfileVO {
  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    email: user.email,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    stats: {
      productCount: stats.productCount,
      favoriteCount: stats.favoriteCount,
      orderCount: stats.orderCount,
      reviewCount: stats.reviewCount,
    },
  }
}

function toFavoriteVO(entity: FavoriteItemEntity): FavoriteItemVO {
  return {
    id: entity.id,
    productId: entity.productId,
    title: entity.product.title,
    price: entity.product.price,
    stock: entity.product.stock,
    status: entity.product.status,
    imageUrl: entity.product.imageUrl,
    sellerId: entity.product.sellerId,
    sellerName: entity.product.sellerName,
    favoritedAt: entity.createdAt.toISOString(),
  }
}

function toSellerProductVO(entity: SellerProductEntity): SellerProductVO {
  return {
    id: entity.id,
    title: entity.title,
    price: entity.price,
    stock: entity.stock,
    status: entity.status,
    imageUrl: entity.imageUrl,
    createdAt: entity.createdAt.toISOString(),
  }
}

/* ============================== 服务实现 ============================== */

export class ProfileService {
  constructor(private readonly repo: ProfileRepository) {}

  /** 个人主页主体：资料 + 统计 */
  async getProfile(userId: number): Promise<ProfileVO> {
    assertUserId(userId)

    const user = await this.repo.findUserById(userId)
    if (!user) {
      throw new ProfileError(PROFILE_ERROR_SPECS.userNotFound)
    }

    const stats = await this.repo.countStats(userId)
    return toProfileVO(user, stats)
  }

  /**
   * 更新资料（PATCH 语义）
   * 只写用户给出的字段；返回更新后的完整资料，前端直接替换本地状态。
   */
  async updateProfile(userId: number, dto: UpdateProfileDTO): Promise<ProfileVO> {
    assertUserId(userId)

    const patch = buildPatch(dto)
    const updated = await this.repo.updateUser(userId, patch)
    if (!updated) {
      throw new ProfileError(PROFILE_ERROR_SPECS.userNotFound)
    }

    return this.getProfile(userId)
  }

  /** 我的收藏：分页 */
  async listFavorites(userId: number, query: ProfilePageQueryDTO): Promise<FavoriteListVO> {
    assertUserId(userId)

    const page = parsePositiveInt(query.page, DEFAULT_PAGE, 'page')
    const rawPageSize = parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE, 'pageSize')
    const pageSize = Math.min(rawPageSize, MAX_PAGE_SIZE)

    const [items, total] = await Promise.all([
      this.repo.findFavorites(userId, { limit: pageSize, offset: (page - 1) * pageSize }),
      this.repo.countFavorites(userId),
    ])

    return { list: items.map(toFavoriteVO), total, page, pageSize }
  }

  /**
   * 加收藏
   * ------------------------------------------------------------------
   * 幂等：重复收藏不报错，直接返回当前条目（前端可以无脑点）。
   * 商品不存在才报 404 —— 下架商品允许收藏（当作心愿单）。
   */
  async addFavorite(userId: number, productId: number): Promise<FavoriteToggleVO> {
    assertUserId(userId)
    assertProductId(productId)

    const product = await this.repo.findProductForFavorite(productId)
    if (!product) {
      throw new ProfileError(PROFILE_ERROR_SPECS.productNotFound)
    }

    await this.repo.addFavorite(userId, productId)

    // 重新读一次：拿到 favorites.id 与收藏时间（首次收藏和重复收藏同一套逻辑）
    const favorite = await this.repo.findFavorite(userId, productId)
    return {
      favorited: true,
      item: favorite ? toFavoriteVO(favorite) : null,
    }
  }

  /** 取消收藏（幂等：本来没收藏也返回 favorited=false） */
  async removeFavorite(userId: number, productId: number): Promise<FavoriteToggleVO> {
    assertUserId(userId)
    assertProductId(productId)

    await this.repo.removeFavorite(userId, productId)
    return { favorited: false, item: null }
  }

  /** 我的商品（卖家视角，含下架）：分页 */
  async listMyProducts(userId: number, query: ProfilePageQueryDTO): Promise<SellerProductListVO> {
    assertUserId(userId)

    const page = parsePositiveInt(query.page, DEFAULT_PAGE, 'page')
    const rawPageSize = parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE, 'pageSize')
    const pageSize = Math.min(rawPageSize, MAX_PAGE_SIZE)

    const [items, total] = await Promise.all([
      this.repo.findMyProducts(userId, { limit: pageSize, offset: (page - 1) * pageSize }),
      this.repo.countMyProducts(userId),
    ])

    return { list: items.map(toSellerProductVO), total, page, pageSize }
  }
}

/** 默认实例：仓储层用 src/config/database.ts 的连接池；单元测试可 new ProfileService(fakeRepo) */
export const profileService = new ProfileService(profileRepository)
