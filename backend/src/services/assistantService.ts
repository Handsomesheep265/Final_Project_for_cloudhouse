/**
 * AI 手帐助手 · 服务层（Service）
 * ----------------------------------------------------------------------------
 * 一句话：把用户的一句自然语言「翻译成商品检索条件」，在商城自己的商品库里查，
 * 再把结果组织成「推荐 + 理由」的回复。
 *
 * 处理链路（全部本地规则，不调用外部模型，也不会编造商品）：
 *   1. 校验消息（非空、≤ 500 字）；
 *   2. 读分类表，把「本子 / 贴纸 / 胶带…」等说法映射到真实分类 id；
 *   3. 解析预算（「100 以内」「50-80」「一百左右」「预算 100」…）与排序偏好；
 *   4. 用分类 + 价格区间 + 风格关键词去 products 表检索（只查在售、有货）；
 *   5. 打分排序，按分类去重后取前 3 件，并逐条生成推荐理由；
 *   6. 查不到时给出「放宽预算 / 换分类」建议，并附上最接近的替代商品。
 *
 * 为什么先用规则而不是直接接大模型：
 *   - 课程项目没有稳定的模型额度，规则版可以离线演示、结果可复现；
 *   - 「只在现有商品库检索」这条约束由 SQL 保证，模型没有机会编造商品；
 *   - 以后接大模型时，本文件的 parse* 可以保留为「兜底 / 预过滤」，
 *     只把 composeReply 换成模型生成即可（返回结构不用动）。
 */
import { assistantRepository, AssistantRepository } from '../repositories/assistantRepositories'
import type { AssistantSort } from '../repositories/assistantRepositories'
import { categoryRepository, CategoryRepository } from '../repositories/categoryRepositories'
import type {
  AssistantChatDTO,
  AssistantPageQueryDTO,
  CreateConversationDTO,
} from '../types/assistant.dto'
import type {
  AssistantConversationEntity,
  AssistantMessageEntity,
  AssistantProductEntity,
  AssistantTurnEntity,
} from '../types/assistant.entity'
import type {
  AssistantConversationDetailVO,
  AssistantConversationListVO,
  AssistantConversationVO,
  AssistantIntentVO,
  AssistantMessageVO,
  AssistantProductVO,
  AssistantReplyVO,
} from '../types/assistant.vo'
import type { CategoryEntity } from '../types/category.entity'

/* ============================== 业务错误 ============================== */

/**
 * 错误码接在认证模块之后（40020~40023 已被认证占用），助手从 40030 开始。
 */
const ASSISTANT_ERROR_SPECS = {
  invalidMessage: { code: 40030, httpStatus: 400, message: '消息不能为空' },
  messageTooLong: { code: 40031, httpStatus: 400, message: '消息太长，请控制在 500 字以内' },
  invalidConversationId: { code: 40032, httpStatus: 400, message: '会话 ID 不合法' },
  invalidPageQuery: { code: 40033, httpStatus: 400, message: '分页参数不合法' },
  invalidTitle: { code: 40034, httpStatus: 400, message: '会话标题不合法' },
  unauthorized: { code: 40102, httpStatus: 401, message: '请先登录' },
  conversationNotFound: { code: 40408, httpStatus: 404, message: '会话不存在或无权访问' },
} as const

export type AssistantErrorSpec = (typeof ASSISTANT_ERROR_SPECS)[keyof typeof ASSISTANT_ERROR_SPECS]

/** 助手业务异常：由统一错误中间件转成 { code, message, data } */
export class AssistantError extends Error {
  readonly code: number
  readonly httpStatus: number

  constructor(spec: AssistantErrorSpec, detail?: string) {
    super(detail ?? spec.message)
    this.name = 'AssistantError'
    this.code = spec.code
    this.httpStatus = spec.httpStatus
  }
}

export const ASSISTANT_ERRORS = ASSISTANT_ERROR_SPECS

/* ============================== 常量与词典 ============================== */

const MAX_MESSAGE_LENGTH = 500
/** 一次检索最多取多少候选（排序后再截前 3 件） */
const MAX_CANDIDATES = 30
/** 最终推荐几件 */
const MAX_RECOMMENDATIONS = 3
/** 同一分类最多占几件，避免 3 件全是贴纸 */
const MAX_PER_CATEGORY = 2
/** 从对话历史里最多取几条用户消息做上下文继承 */
const MAX_HISTORY_MESSAGES = 3

/* ---------------------------- 会话（落库）相关 ---------------------------- */

/** 会话列表默认 / 最大每页条数 */
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50

/** 会话标题：默认取第一条用户消息的前 24 个字 */
const TITLE_MAX = 24
/** 列表里的最后一条消息预览长度 */
const PREVIEW_MAX = 40
/** 会话标题的硬上限（与表结构 VARCHAR(80) 对齐，留余量） */
const TITLE_HARD_MAX = 40
/** 续写会话时，从数据库读最近多少条消息做上下文 */
const CONTEXT_MESSAGE_LIMIT = 6
/** 用户没指定标题、也没消息时的默认标题 */
const DEFAULT_TITLE = '新的手帐对话'

/**
 * 分类说法 → 真实分类名。
 * 分类 id 以 categories 表为准（这里只做「叫法」映射）。
 */
const CATEGORY_HINTS: Array<{ name: string; keywords: string[] }> = [
  {
    name: '手帐本',
    keywords: ['手帐本', '手账本', '手帐簿', '手账簿', '本子', '笔记本', '记事本', '日程本'],
  },
  { name: '贴纸', keywords: ['贴纸', '贴画', '切膜', '装饰贴', '贴贴'] },
  { name: '胶带', keywords: ['胶带', '和纸胶带', '纸胶带', 'washi'] },
  { name: '印章', keywords: ['印章', '手刻章', '图章', '印台', '章子'] },
  {
    name: '笔类',
    keywords: ['笔类', '马克笔', '针管笔', '中性笔', '圆珠笔', '荧光笔', '钢笔', '铅笔', '水笔'],
  },
  { name: '素材包', keywords: ['素材包', '素材', '模板', '电子手帐', 'goodnotes', '打印'] },
]

/** 风格 / 属性词：命中会参与打分，并写进推荐理由 */
const STYLE_KEYWORDS = [
  '复古',
  '莫兰迪',
  '低饱和',
  '和纸',
  '牛皮纸',
  '咖啡',
  '四季',
  '风景',
  '旅行',
  '美食',
  '电子',
  '针管',
  '马克',
  '木质',
  '日期',
  '格子',
  '计划',
  '排版',
  '模板',
  '切膜',
  '手绘',
  '可爱',
  '简约',
  '清新',
  '文艺',
]

/** 出现这些词就按「想买东西」处理（即使没说具体分类/预算） */
const PRODUCT_HINTS = [
  '推荐',
  '买',
  '想要',
  '想找',
  '有没有',
  '适合',
  '挑',
  '选',
  '入手',
  '送人',
  '新手',
  '预算',
  '元',
  '块',
  '便宜',
  '好看',
]

/** 便宜优先 */
const CHEAP_HINTS = ['便宜', '性价比', '实惠', '学生', '划算', '低价']
/** 贵/质感优先 */
const PREMIUM_HINTS = ['高端', '质感', '贵一点', '高级', '精致']

const DEFAULT_SORT: AssistantSort = 'recommend'

/* ============================== 工具函数 ============================== */

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** 全角数字转半角，统一「１００」这类输入 */
function normalizeDigits(text: string): string {
  return text.replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0),
  )
}

function trimText(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`
}

/** 金额展示：整数不带小数，其它保留两位 */
function formatYuan(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2)
}

/* ---------------------------- 中文数字 ---------------------------- */

const CN_DIGITS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

/**
 * 把「一百五 / 两百 / 八十 / 五十」这类中文数字转成整数。
 * 只支持 0 ~ 9999 的常见写法：口语里的「一百五」按 150 处理（而不是 105）。
 */
function parseChineseNumber(text: string): number | null {
  let total = 0
  let current = 0
  let matched = false
  let lastUnit = ''

  for (const char of text) {
    if (char in CN_DIGITS) {
      current = CN_DIGITS[char] ?? 0
      matched = true
      continue
    }
    if (char === '十' || char === '百' || char === '千') {
      const unit = char === '十' ? 10 : char === '百' ? 100 : 1000
      total += (current === 0 ? 1 : current) * unit
      current = 0
      matched = true
      lastUnit = char
      continue
    }
    return null
  }

  if (!matched) return null
  // 「一百五」这类省略「十」的口语写法：末尾数字直接跟单位时按「几十」补
  if (current > 0 && (lastUnit === '百' || lastUnit === '千')) {
    return total + current * 10
  }
  return total + current
}

/* ---------------------------- 预算解析 ---------------------------- */

interface Budget {
  min: number | null
  max: number | null
}

/** 「以内 / 以下 / 不超过」→ 上限；「以上 / 起」→ 下限 */
const MAX_QUALIFIERS = ['以内', '以下', '不超过', '最多', '低于', '小于', '预算', '左右', '大概']
const MIN_QUALIFIERS = ['以上', '起', '至少', '不低于', '高于']

/**
 * 从一句中文里解析预算区间。
 * 支持：50-100 / 50到100 / 一百以内 / 预算 100 / 100 元左右 / 100 以上。
 * 解析不出来返回 null（不限制价格）。
 */
function parseBudget(raw: string): Budget | null {
  const text = normalizeDigits(raw)

  // 1）区间写法：50-100、50 到 100、50~100
  const range = text.match(
    /(\d+(?:\.\d+)?)\s*(?:元|块)?\s*(?:-|~|～|—|到|至)\s*(\d+(?:\.\d+)?)/,
  )
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { min: Math.min(a, b), max: Math.max(a, b) }
    }
  }

  // 2）中文区间：五十到一百
  const cnRange = text.match(
    /([零一二三四五六七八九十百千两]+)\s*(?:元|块)?\s*(?:到|至|-|~|～)\s*([零一二三四五六七八九十百千两]+)/,
  )
  if (cnRange) {
    const a = parseChineseNumber(cnRange[1] ?? '')
    const b = parseChineseNumber(cnRange[2] ?? '')
    if (a !== null && b !== null) {
      return { min: Math.min(a, b), max: Math.max(a, b) }
    }
  }

  // 3）单个数字 + 限定词
  const single = text.match(/(\d+(?:\.\d+)?)/)
  if (single) {
    const value = Number(single[1])
    if (!Number.isFinite(value)) return null

    const around = text.slice(Math.max(0, (single.index ?? 0) - 6), (single.index ?? 0) + single[0].length + 6)
    if (MAX_QUALIFIERS.some((word) => around.includes(word))) return { min: null, max: value }
    if (MIN_QUALIFIERS.some((word) => around.includes(word))) return { min: value, max: null }
    // 只说「预算 100 / 100 元」时，按「不超过 100」理解（更符合买东西的语境）
    return { min: null, max: value }
  }

  // 4）中文数字 + 限定词：一百以内 / 两百左右
  const cnSingle = text.match(/([零一二三四五六七八九十百千两]+)\s*(?:元|块)?/)
  if (cnSingle) {
    const value = parseChineseNumber(cnSingle[1] ?? '')
    if (value === null) return null

    const around = text
    if (MAX_QUALIFIERS.some((word) => around.includes(word))) return { min: null, max: value }
    if (MIN_QUALIFIERS.some((word) => around.includes(word))) return { min: value, max: null }
    return { min: null, max: value }
  }

  return null
}

/* ---------------------------- 意图解析 ---------------------------- */

function detectCategories(
  text: string,
  categories: CategoryEntity[],
): CategoryEntity[] {
  const matched: CategoryEntity[] = []

  for (const category of categories) {
    const hints = CATEGORY_HINTS.find((item) => item.name === category.name)
    const keywords = hints ? hints.keywords : [category.name]
    if (keywords.some((keyword) => text.includes(keyword))) {
      matched.push(category)
    }
  }

  // 最多保留两个分类：三个以上基本是「什么都想买」，范围太散反而不像推荐
  return matched.slice(0, 2)
}

function detectKeywords(text: string): string[] {
  return STYLE_KEYWORDS.filter((keyword) => text.includes(keyword))
}

function detectSort(text: string): AssistantSort {
  if (CHEAP_HINTS.some((keyword) => text.includes(keyword))) return 'price-asc'
  if (PREMIUM_HINTS.some((keyword) => text.includes(keyword))) return 'price-desc'
  return DEFAULT_SORT
}

function looksLikeProductRequest(text: string, categories: CategoryEntity[], budget: Budget | null): boolean {
  if (categories.length > 0 || budget !== null) return true
  return PRODUCT_HINTS.some((keyword) => text.includes(keyword))
}

/** 从历史里取用户说过的话（只取最近几条），用于「便宜点的呢」这类追问 */
function collectHistoryTexts(history: unknown): string[] {
  if (!Array.isArray(history)) return []

  const texts: string[] = []
  for (const item of history) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as { role?: unknown; content?: unknown }
    if (record.role !== 'user') continue
    if (typeof record.content !== 'string') continue
    const content = record.content.trim()
    if (content.length === 0) continue
    texts.push(content)
  }

  return texts.slice(-MAX_HISTORY_MESSAGES)
}

/* ---------------------------- 检索与打分 ---------------------------- */

interface RecommendationContext {
  categories: CategoryEntity[]
  keywords: string[]
  budget: Budget | null
  sort: AssistantSort
}

function scoreProduct(product: AssistantProductEntity, context: RecommendationContext): number {
  let score = 0

  if (context.categories.some((category) => category.id === product.categoryId)) score += 30

  for (const keyword of context.keywords) {
    if (product.title.includes(keyword) || (product.description ?? '').includes(keyword)) {
      score += 12
    }
  }

  if (context.budget?.max !== null && context.budget?.max !== undefined && product.price <= context.budget.max) {
    score += 15
  }
  if (product.stock > 0) score += 5
  // 销量与评分是「同等条件下谁更值得买」的轻微加权，不至于盖过分类/预算的硬匹配
  score += Math.min(product.sales, 50) * 0.3
  score += product.rating * 2

  return score
}

/** 按分数排序，并按「同分类最多 N 件」做多样性截断 */
function pickRecommendations(
  candidates: AssistantProductEntity[],
  context: RecommendationContext,
  maxPerCategory: number,
): AssistantProductEntity[] {
  const sorted = [...candidates].sort((a, b) => {
    const diff = scoreProduct(b, context) - scoreProduct(a, context)
    return diff !== 0 ? diff : a.price - b.price
  })

  const picked: AssistantProductEntity[] = []
  const perCategory = new Map<number, number>()

  for (const product of sorted) {
    if (picked.length >= MAX_RECOMMENDATIONS) break
    const used = perCategory.get(product.categoryId) ?? 0
    if (used >= maxPerCategory) continue
    perCategory.set(product.categoryId, used + 1)
    picked.push(product)
  }

  return picked
}

/** 生成一条推荐理由（拼 3~4 个理由点，避免一句话太长） */
function buildReason(product: AssistantProductEntity, context: RecommendationContext): string {
  const points: string[] = []

  points.push(`属于「${product.categoryName}」分类`)

  if (context.budget?.max !== null && context.budget?.max !== undefined) {
    points.push(`标价 ¥${formatYuan(product.price)}，在 ${formatYuan(context.budget.max)} 元预算内`)
  } else {
    points.push(`标价 ¥${formatYuan(product.price)}`)
  }

  const matchedKeywords = context.keywords.filter(
    (keyword) => product.title.includes(keyword) || (product.description ?? '').includes(keyword),
  )
  if (matchedKeywords.length > 0) {
    points.push(`提到「${matchedKeywords.join('、')}」，和你的描述贴近`)
  }

  if (product.description) {
    points.push(`卖点：${trimText(product.description, 36)}`)
  }

  if (product.sales > 0) {
    points.push(`已售 ${product.sales} 件`)
  }
  if (product.stock > 0 && product.stock <= 10) {
    points.push(`库存仅 ${product.stock} 件`)
  }

  return points.join('；')
}

function toProductVO(product: AssistantProductEntity, context: RecommendationContext): AssistantProductVO {
  return {
    id: product.id,
    title: product.title,
    price: product.price,
    stock: product.stock,
    coverImage: product.imageUrl,
    categoryId: product.categoryId,
    categoryName: product.categoryName,
    sellerName: product.sellerName,
    reason: buildReason(product, context),
    score: Math.round(scoreProduct(product, context) * 10) / 10,
  }
}

/* ---------------------------- 回复文案 ---------------------------- */

/** 把解析结果写成「贴纸 · 预算 ≤ 100 元」这样的短标签 */
function describeFilters(context: RecommendationContext): string {
  const parts: string[] = []

  if (context.categories.length > 0) {
    parts.push(context.categories.map((category) => category.name).join(' / '))
  }

  const min = context.budget?.min ?? null
  const max = context.budget?.max ?? null
  if (min !== null && max !== null) {
    parts.push(`预算 ${formatYuan(min)}~${formatYuan(max)} 元`)
  } else if (max !== null) {
    parts.push(`预算 ≤ ${formatYuan(max)} 元`)
  } else if (min !== null) {
    parts.push(`预算 ≥ ${formatYuan(min)} 元`)
  }

  if (context.keywords.length > 0) {
    parts.push(context.keywords.join('、'))
  }

  return parts.join(' · ')
}

function composeProductReply(
  recommendations: AssistantProductVO[],
  context: RecommendationContext,
  totalCandidates: number,
  options: { relaxedKeywords: boolean; relaxedBudget: boolean },
): string {
  const lines: string[] = []
  const filterLabel = describeFilters(context)

  if (recommendations.length === 0) {
    lines.push('我在商城的在售商品里没有找到符合条件的商品。')
    return lines.join('\n')
  }

  if (options.relaxedKeywords) {
    lines.push(`没找到同时满足「${filterLabel}」的在售商品，下面这些同类商品可能也合适：`)
  } else if (filterLabel) {
    lines.push(
      recommendations.length >= totalCandidates
        ? `按「${filterLabel}」找到 ${totalCandidates} 件在售商品，都列在下面：`
        : `按「${filterLabel}」找到 ${totalCandidates} 件在售商品，挑了最契合的 ${recommendations.length} 件：`,
    )
  } else {
    lines.push(`没有限定条件，就从商城销量靠前的在售商品里挑了 ${recommendations.length} 件：`)
  }

  lines.push('')

  recommendations.forEach((product, index) => {
    lines.push(`${index + 1}. ${product.title} · ¥${formatYuan(product.price)}（${product.sellerName}）`)
    lines.push(`   推荐理由：${product.reason}`)
  })

  lines.push('')
  lines.push(
    options.relaxedBudget
      ? '这些已经是最接近你预算的选择了；想更贴合的话，可以把预算再放宽一点点。'
      : '想再缩小范围的话，可以补充用途（送人 / 自用 / 新手）或风格（复古 / 莫兰迪 / 可爱），我再帮你筛。',
  )

  return lines.join('\n')
}

const CHITCHAT_REPLY = [
  '我是手帐集市的小助手，只做一件事：帮你在商城的在售商品里挑东西。',
  '告诉我「类型 + 预算 + 风格」就行，比如：',
  '· 「100 元以内的贴纸，复古风」',
  '· 「新手用的手帐本，预算 50 元」',
  '· 「送人的胶带，莫兰迪色」',
].join('\n')

/* ============================== 会话相关工具 ============================== */

/** 校验会话 id：不传 / null / 空串 → null（表示开新会话）；其余必须是正整数 */
function parseConversationId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null

  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new AssistantError(ASSISTANT_ERROR_SPECS.invalidConversationId)
  }
  return value
}

/** 路径参数里的会话 id：必须传，且是正整数 */
function parseRequiredConversationId(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new AssistantError(ASSISTANT_ERROR_SPECS.invalidConversationId)
  }
  return value
}

/** 会话接口必须登录；controller 已用 requireAuth 挡了一层，这里再兜一次 */
function assertUserId(userId: number): void {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new AssistantError(ASSISTANT_ERROR_SPECS.unauthorized)
  }
}

/** 分页参数：不传用默认值，非法值报 40033 */
function parsePageNumber(raw: string | undefined, fallback: number, max?: number): number {
  if (raw === undefined || raw === '') return fallback

  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || (max !== undefined && value > max)) {
    throw new AssistantError(ASSISTANT_ERROR_SPECS.invalidPageQuery)
  }
  return value
}

/** 用第一条用户消息生成会话标题 */
function makeTitle(message: string): string {
  const title = message.replace(/\s+/g, ' ').trim()
  if (title.length === 0) return DEFAULT_TITLE
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX)}…` : title
}

/** 校验用户自填的会话标题 */
function normalizeTitle(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') {
    throw new AssistantError(ASSISTANT_ERROR_SPECS.invalidTitle)
  }

  const title = raw.replace(/\s+/g, ' ').trim()
  if (title.length === 0) return null
  if (title.length > TITLE_HARD_MAX) {
    throw new AssistantError(
      ASSISTANT_ERROR_SPECS.invalidTitle,
      `标题不能超过 ${TITLE_HARD_MAX} 个字符`,
    )
  }
  return title
}

/** 列表里的最后一条消息预览 */
function previewOf(content: string | null): string | null {
  if (content === null) return null
  const text = content.replace(/\s+/g, ' ').trim()
  if (text.length === 0) return null
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text
}

/** 给「生成结果」补齐公共字段（引擎、时间、会话 id 先占位 null） */
function toReplyVO(partial: {
  reply: string
  intent: AssistantIntentVO
  recommendations: AssistantProductVO[]
  totalCandidates: number
}): AssistantReplyVO {
  return {
    ...partial,
    engine: 'local-catalog',
    generatedAt: new Date().toISOString(),
    conversationId: null,
  }
}

function toConversationVO(entity: AssistantConversationEntity): AssistantConversationVO {
  return {
    id: entity.id,
    title: entity.title,
    messageCount: entity.messageCount,
    lastMessagePreview: previewOf(entity.lastMessage),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  }
}

function toMessageVO(entity: AssistantMessageEntity): AssistantMessageVO {
  return {
    id: entity.id,
    role: entity.role,
    content: entity.content,
    recommendations: entity.recommendations,
    intent: entity.intent,
    createdAt: entity.createdAt.toISOString(),
  }
}

function toConversationDetail(
  conversation: AssistantConversationEntity,
  messages: AssistantMessageEntity[],
): AssistantConversationDetailVO {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messages: messages.map(toMessageVO),
  }
}

/* ============================== 服务实现 ============================== */

export class AssistantService {
  constructor(
    private readonly repo: AssistantRepository,
    private readonly categoryRepo: CategoryRepository,
  ) {}

  /**
   * 处理一次聊天请求。
   * userId 由控制器从鉴权中间件传入：
   *   - null（未登录）：只回答、不落库，conversationId 返回 null；
   *   - 有值：把这一轮问答写进会话（没带 conversationId 就自动开一个新会话）。
   */
  async chat(dto: AssistantChatDTO, userId: number | null): Promise<AssistantReplyVO> {
    const message = this.parseMessage(dto.message)
    const requestedConversationId = parseConversationId(dto.conversationId)

    let conversationId: number | null = requestedConversationId
    let historyTexts: string[]

    // 续写已有会话：先确认归属（别人的会话一律 404），再用数据库里的消息做上下文，
    // 这样「便宜点的呢」这种追问不依赖客户端传的 history，也就无法被篡改。
    if (userId !== null && conversationId !== null) {
      const conversation = await this.repo.findConversation(userId, conversationId)
      if (!conversation) {
        throw new AssistantError(ASSISTANT_ERROR_SPECS.conversationNotFound)
      }
      const recent = await this.repo.findRecentMessages(conversationId, CONTEXT_MESSAGE_LIMIT)
      historyTexts = recent.filter((item) => item.role === 'user').map((item) => item.content)
    } else {
      historyTexts = collectHistoryTexts(dto.history)
    }

    const reply = await this.buildReply(message, historyTexts)

    // 只有登录用户才落库：匿名对话仍然可用，只是不留历史
    if (userId !== null) {
      const turn: AssistantTurnEntity = {
        userContent: message,
        assistantContent: reply.reply,
        recommendations: reply.recommendations,
        intent: reply.intent,
      }

      if (conversationId !== null) {
        await this.repo.appendTurn(conversationId, turn)
      } else {
        conversationId = await this.repo.createConversationWithTurn(
          userId,
          makeTitle(message),
          turn,
        )
      }
    }

    return { ...reply, conversationId: userId !== null ? conversationId : null }
  }

  /** 生成一次回复（纯计算、不落库）：解析意图 → 检索商品 → 组织文案 */
  private async buildReply(message: string, historyTexts: string[]): Promise<AssistantReplyVO> {
    // 追问场景（「便宜点的呢」）需要结合上一轮；这里把最近几条用户消息拼成上下文
    const contextText = [...historyTexts, message].join(' ')

    const categories = await this.categoryRepo.findAll()

    const currentCategories = detectCategories(message, categories)
    const contextCategories = detectCategories(contextText, categories)
    const resolvedCategories = currentCategories.length > 0 ? currentCategories : contextCategories

    const currentBudget = parseBudget(message)
    const contextBudget = parseBudget(contextText)
    const resolvedBudget = currentBudget ?? contextBudget

    const keywords = detectKeywords(message)
    const sort = detectSort(message)

    const context: RecommendationContext = {
      categories: resolvedCategories,
      keywords,
      budget: resolvedBudget,
      sort,
    }

    const intent: AssistantIntentVO = {
      type: looksLikeProductRequest(message, resolvedCategories, resolvedBudget) ? 'product' : 'chitchat',
      categories: resolvedCategories.map((category) => ({ id: category.id, name: category.name })),
      keywords,
      budget: resolvedBudget,
      sort,
    }

    if (intent.type === 'chitchat') {
      return toReplyVO({
        reply: CHITCHAT_REPLY,
        intent,
        recommendations: [],
        totalCandidates: 0,
      })
    }

    /* ---------- 第一轮：按分类 + 预算 + 关键词检索 ---------- */
    const baseFilters = {
      categoryIds: resolvedCategories.map((category) => category.id),
      minPrice: resolvedBudget?.min ?? null,
      maxPrice: resolvedBudget?.max ?? null,
      keywords,
    }

    let candidates = await this.repo.searchCandidates({
      ...baseFilters,
      sort,
      limit: MAX_CANDIDATES,
    })
    let totalCandidates = await this.repo.countCandidates(baseFilters)
    let relaxedKeywords = false

    /* ---------- 第二轮：关键词太窄 → 去掉关键词只按分类/预算找 ---------- */
    if (candidates.length === 0 && keywords.length > 0) {
      relaxedKeywords = true
      const relaxed = { ...baseFilters, keywords: [] }
      candidates = await this.repo.searchCandidates({ ...relaxed, sort, limit: MAX_CANDIDATES })
      totalCandidates = await this.repo.countCandidates(relaxed)
    }

    /* ---------- 第三轮：还是空 → 说明预算/分类没货，给替代方案 ---------- */
    if (candidates.length === 0) {
      const priceRange = await this.repo.findPriceRange(baseFilters.categoryIds)

      // 预算内没货时，优先给「最接近预算」的商品：
      //   有上限 → 先看略高于上限的（最便宜的）；都没有 → 看略低于下限的（最贵的）；
      //   都没有 → 全站/该分类最便宜的几件。
      const alternatives = await this.findAlternatives(baseFilters.categoryIds, resolvedBudget)

      const recommendations = alternatives.map((product) => ({
        ...toProductVO(product, context),
        reason: buildReason(product, { ...context, budget: null }),
      }))

      const lines: string[] = []
      const label = describeFilters(context)
      lines.push(
        label
          ? `按「${label}」在商城里没有找到符合条件的在售商品。`
          : '商城目前在售商品里没有找到合适的商品。',
      )

      if (priceRange.productCount > 0 && priceRange.minPrice !== null && priceRange.maxPrice !== null) {
        const categoryLabel = resolvedCategories.length > 0
          ? `「${resolvedCategories.map((category) => category.name).join(' / ')}」分类`
          : '全站'
        lines.push(
          `目前${categoryLabel}的在售商品共 ${priceRange.productCount} 件，价格在 ¥${formatYuan(priceRange.minPrice)} ~ ¥${formatYuan(priceRange.maxPrice)} 之间。`,
        )
      }

      if (recommendations.length > 0) {
        lines.push('')
        lines.push('这几件价格最接近，可以看看：')
        recommendations.forEach((product, index) => {
          lines.push(`${index + 1}. ${product.title} · ¥${formatYuan(product.price)}（${product.sellerName}）`)
          lines.push(`   推荐理由：${product.reason}`)
        })
      }

      lines.push('')
      lines.push('要不要把预算或分类放宽一点？也可以直接说说「预算 + 类型」，我再帮你找。')

      return toReplyVO({
        reply: lines.join('\n'),
        intent,
        recommendations,
        totalCandidates: 0,
      })
    }

    /* ---------- 有候选：打分、去重、生成理由 ---------- */
    // 只命中一个分类时，允许 3 件都来自该分类（用户就是专门找这个的）；
    // 命中多个分类时才限制「同分类最多 2 件」，避免列表太单一。
    const maxPerCategory =
      resolvedCategories.length === 1 ? MAX_RECOMMENDATIONS : MAX_PER_CATEGORY
    const picked = pickRecommendations(candidates, context, maxPerCategory)
    const recommendations = picked.map((product) => toProductVO(product, context))

    return toReplyVO({
      reply: composeProductReply(recommendations, context, totalCandidates, {
        relaxedKeywords,
        relaxedBudget: false,
      }),
      intent,
      recommendations,
      totalCandidates,
    })
  }

  /**
   * 预算/分类内没货时的替代商品。
   * 顺序依次是：略高于预算上限 → 略低于预算下限 → 该范围内最便宜的。
   * 这样「50~80 元的胶带」不会推荐 8.5 元的细胶带，而是给 45 元那款最接近的。
   */
  private async findAlternatives(
    categoryIds: number[],
    budget: Budget | null,
  ): Promise<AssistantProductEntity[]> {
    if (budget?.max !== null && budget?.max !== undefined) {
      const above = await this.repo.searchCandidates({
        categoryIds,
        minPrice: budget.max,
        maxPrice: null,
        keywords: [],
        sort: 'price-asc',
        limit: MAX_RECOMMENDATIONS,
      })
      if (above.length > 0) return above
    }

    if (budget?.min !== null && budget?.min !== undefined) {
      const below = await this.repo.searchCandidates({
        categoryIds,
        minPrice: null,
        maxPrice: budget.min,
        keywords: [],
        sort: 'price-desc',
        limit: MAX_RECOMMENDATIONS,
      })
      if (below.length > 0) return below
    }

    return this.repo.searchCandidates({
      categoryIds,
      minPrice: null,
      maxPrice: null,
      keywords: [],
      sort: 'price-asc',
      limit: MAX_RECOMMENDATIONS,
    })
  }

  /** 校验并清洗用户消息 */
  private parseMessage(raw: unknown): string {
    if (typeof raw !== 'string') {
      throw new AssistantError(ASSISTANT_ERROR_SPECS.invalidMessage)
    }
    const message = raw.trim()
    if (message.length === 0) {
      throw new AssistantError(ASSISTANT_ERROR_SPECS.invalidMessage)
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new AssistantError(ASSISTANT_ERROR_SPECS.messageTooLong)
    }
    return message
  }

  /* ------------------------------ 历史会话（落库） ------------------------------ */

  /**
   * 开启一轮新对话。
   * 只建一个空会话（不产生消息），前端拿到 id 后带着它聊天即可；
   * 这样「新对话」有明确边界，不会把新问题续到旧上下文里。
   */
  async startConversation(
    userId: number,
    dto: CreateConversationDTO,
  ): Promise<AssistantConversationDetailVO> {
    assertUserId(userId)

    const title = normalizeTitle(dto.title) ?? DEFAULT_TITLE
    const conversationId = await this.repo.createConversation(userId, title)

    const conversation = await this.repo.findConversation(userId, conversationId)
    if (!conversation) {
      throw new AssistantError(ASSISTANT_ERROR_SPECS.conversationNotFound)
    }

    return toConversationDetail(conversation, [])
  }

  /** 我的历史对话列表（按最近聊的倒序，分页） */
  async listConversations(
    userId: number,
    query: AssistantPageQueryDTO,
  ): Promise<AssistantConversationListVO> {
    assertUserId(userId)

    const page = parsePageNumber(query.page, DEFAULT_PAGE)
    const rawPageSize = parsePageNumber(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const pageSize = Math.min(rawPageSize, MAX_PAGE_SIZE)

    const [items, total] = await Promise.all([
      this.repo.listConversations(userId, { limit: pageSize, offset: (page - 1) * pageSize }),
      this.repo.countConversations(userId),
    ])

    return { list: items.map(toConversationVO), total, page, pageSize }
  }

  /** 查看某个会话的完整对话（历史回放，商品卡按当时的快照还原） */
  async getConversation(
    userId: number,
    rawConversationId: unknown,
  ): Promise<AssistantConversationDetailVO> {
    assertUserId(userId)

    const conversationId = parseRequiredConversationId(rawConversationId)
    const conversation = await this.repo.findConversation(userId, conversationId)
    if (!conversation) {
      throw new AssistantError(ASSISTANT_ERROR_SPECS.conversationNotFound)
    }

    const messages = await this.repo.findMessages(conversationId)
    return toConversationDetail(conversation, messages)
  }

  /** 删除一个会话及其消息；不是本人的会话按「不存在」处理 */
  async deleteConversation(userId: number, rawConversationId: unknown): Promise<void> {
    assertUserId(userId)

    const conversationId = parseRequiredConversationId(rawConversationId)
    const deleted = await this.repo.deleteConversation(userId, conversationId)
    if (!deleted) {
      throw new AssistantError(ASSISTANT_ERROR_SPECS.conversationNotFound)
    }
  }
}

/** 默认实例：仓储层用连接池；单元测试可 new AssistantService(fakeRepo, fakeCategoryRepo) */
export const assistantService: AssistantService = new AssistantService(
  assistantRepository,
  categoryRepository,
)
