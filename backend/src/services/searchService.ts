/**
 * 搜索服务层（Service）
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. 校验关键词（去空白、至少 2 个字符、最长 50）—— 2 个字符是 ngram 的下限；
 *   2. 校验搜索范围（all / product / shop）与分页参数；
 *   3. 并发查「商品」和「店铺」两组结果，各自带总数，一次返回给前端；
 *   4. 实体 → VO（字段改名、金额已是 number，不需要二次换算）。
 *
 * 不负责：SQL 与 MATCH ... AGAINST（repositories）、HTTP 状态码与响应包装（controllers）。
 *
 * 设计取舍：
 *   - 用 NATURAL LANGUAGE MODE，用户输入的 + - * 等符号不会被当成运算符；
 *   - 商品只搜上架商品、店铺只搜状态正常的用户，规则写在仓储层的 WHERE 里。
 */
import { searchRepository, SearchRepository } from '../repositories/searchRepositories'
import type { SearchQueryDTO } from '../types/search.dto'
import type { ProductSearchEntity, ShopSearchEntity } from '../types/search.entity'
import type {
  ProductSearchItemVO,
  SearchGroupVO,
  SearchResultVO,
  ShopSearchItemVO,
} from '../types/search.vo'

/* ============================== 业务错误 ============================== */

/**
 * 错误码继续往后排（40000 ~ 40012 已被购物车/订单/个人主页/商品占用）。
 */
const SEARCH_ERROR_SPECS = {
  invalidKeyword: { code: 40013, httpStatus: 400, message: '关键词不合法' },
  invalidType: { code: 40014, httpStatus: 400, message: '搜索范围不合法' },
  invalidQuery: { code: 40015, httpStatus: 400, message: '分页参数不合法' },
} as const

export type SearchErrorSpec = (typeof SEARCH_ERROR_SPECS)[keyof typeof SEARCH_ERROR_SPECS]

/** 搜索业务异常：带业务码与建议的 HTTP 状态码，由统一错误中间件转换 */
export class SearchError extends Error {
  readonly code: number
  readonly httpStatus: number

  constructor(spec: SearchErrorSpec, detail?: string) {
    super(detail ?? spec.message)
    this.name = 'SearchError'
    this.code = spec.code
    this.httpStatus = spec.httpStatus
  }
}

/** 供 controller / 测试引用错误码 */
export const SEARCH_ERRORS = SEARCH_ERROR_SPECS

/* ============================== 常量与工具 ============================== */

/** ngram_token_size = 2：单字查询必然 0 条，所以最少 2 个字符 */
const KEYWORD_MIN_LENGTH = 2
const KEYWORD_MAX_LENGTH = 50

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 20

/** 搜索范围 */
export type SearchType = 'all' | 'product' | 'shop'
const SEARCH_TYPES: readonly SearchType[] = ['all', 'product', 'shop']

/** 关键词：去首尾空白，按「字符数」而不是 UTF-16 长度算（避免 emoji 被算成 2） */
function normalizeKeyword(raw: string | undefined): string {
  const keyword = typeof raw === 'string' ? raw.trim() : ''
  const length = [...keyword].length

  if (length < KEYWORD_MIN_LENGTH) {
    throw new SearchError(
      SEARCH_ERROR_SPECS.invalidKeyword,
      `请至少输入 ${KEYWORD_MIN_LENGTH} 个字符再搜索`,
    )
  }
  if (length > KEYWORD_MAX_LENGTH) {
    throw new SearchError(
      SEARCH_ERROR_SPECS.invalidKeyword,
      `关键词不能超过 ${KEYWORD_MAX_LENGTH} 个字符`,
    )
  }
  return keyword
}

/** 搜索范围：不传默认 all */
function parseType(raw: string | undefined): SearchType {
  if (raw === undefined || raw === '') return 'all'
  if (!SEARCH_TYPES.includes(raw as SearchType)) {
    throw new SearchError(
      SEARCH_ERROR_SPECS.invalidType,
      `type 只能是 ${SEARCH_TYPES.join(' / ')}`,
    )
  }
  return raw as SearchType
}

/** 分页参数：不传用默认值，传了必须是正整数 */
function parsePositiveInt(raw: string | undefined, fallback: number, field: string): number {
  if (raw === undefined || raw === '') return fallback

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new SearchError(SEARCH_ERROR_SPECS.invalidQuery, `${field} 必须是正整数`)
  }
  return parsed
}

function toProductVO(entity: ProductSearchEntity): ProductSearchItemVO {
  return {
    id: entity.id,
    title: entity.title,
    price: entity.price,
    stock: entity.stock,
    status: entity.status,
    coverImage: entity.imageUrl,
    sellerId: entity.sellerId,
    sellerName: entity.sellerName,
  }
}

function toShopVO(entity: ShopSearchEntity): ShopSearchItemVO {
  return {
    id: entity.id,
    nickname: entity.nickname,
    avatarUrl: entity.avatarUrl,
    bio: entity.bio,
    productCount: entity.productCount,
  }
}

/* ============================== 服务实现 ============================== */

export class SearchService {
  constructor(private readonly repo: SearchRepository) {}

  /**
   * 首页搜索：关键词 → 商品 + 店铺
   * ------------------------------------------------------------------
   * type=all 时两组并发查（共 4 条 SQL），只查需要的那组时另外一组直接返回 null，
   * 前端据此决定显示几个 tab。
   */
  async search(query: SearchQueryDTO): Promise<SearchResultVO> {
    const keyword = normalizeKeyword(query.keyword)
    const type = parseType(query.type)

    const page = parsePositiveInt(query.page, DEFAULT_PAGE, 'page')
    const rawPageSize = parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE, 'pageSize')
    const pageSize = Math.min(rawPageSize, MAX_PAGE_SIZE)
    const options = { limit: pageSize, offset: (page - 1) * pageSize }

    const wantProducts = type === 'all' || type === 'product'
    const wantShops = type === 'all' || type === 'shop'

    const [productList, productTotal, shopList, shopTotal] = await Promise.all([
      wantProducts ? this.repo.searchProducts(keyword, options) : Promise.resolve<ProductSearchEntity[]>([]),
      wantProducts ? this.repo.countProducts(keyword) : Promise.resolve(0),
      wantShops ? this.repo.searchShops(keyword, options) : Promise.resolve<ShopSearchEntity[]>([]),
      wantShops ? this.repo.countShops(keyword) : Promise.resolve(0),
    ])

    const products: SearchGroupVO<ProductSearchItemVO> | null = wantProducts
      ? { list: productList.map(toProductVO), total: productTotal, page, pageSize }
      : null

    const shops: SearchGroupVO<ShopSearchItemVO> | null = wantShops
      ? { list: shopList.map(toShopVO), total: shopTotal, page, pageSize }
      : null

    return { keyword, type, products, shops }
  }
}

/** 默认实例：仓储层用 src/config/database.ts 的连接池；单元测试可 new SearchService(fakeRepo) */
export const searchService = new SearchService(searchRepository)
