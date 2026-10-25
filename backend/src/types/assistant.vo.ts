/**
 * AI 手帐助手 · 响应 VO（出参）
 * ----------------------------------------------------------------------------
 * 一次聊天回复包含：
 *   1. reply           —— 直接能显示在聊天气泡里的自然语言；
 *   2. intent          —— 这次「听懂了什么」（分类 / 关键词 / 预算 / 排序）；
 *   3. recommendations —— 结构化商品列表（前端渲染成商品卡）；
 *   4. conversationId  —— 落库后的会话 id；未登录（不落库）时为 null。
 *
 * 历史对话相关：
 *   GET  /api/assistant/conversations             → AssistantConversationListVO
 *   GET  /api/assistant/conversations/:id         → AssistantConversationDetailVO
 *   POST /api/assistant/conversations             → AssistantConversationDetailVO（空会话）
 *
 * 所有推荐项都来自 products 表（在售、有货），不存在模型编造商品的情况。
 */

/** 助手理解出的意图类型 */
export type AssistantIntentType = 'product' | 'chitchat'

/** 预算区间（元）；一端为 null 表示不限制 */
export interface AssistantBudgetVO {
  min: number | null
  max: number | null
}

/** 命中的分类 */
export interface AssistantCategoryVO {
  id: number
  name: string
}

/** 本次请求的解析结果 */
export interface AssistantIntentVO {
  type: AssistantIntentType
  /** 命中的分类（最多两个） */
  categories: AssistantCategoryVO[]
  /** 命中的风格 / 属性关键词（复古、莫兰迪、和纸…） */
  keywords: string[]
  /** 解析出的预算；没提到为 null */
  budget: AssistantBudgetVO | null
  /** 排序偏好：综合 / 价格从低到高 / 价格从高到低 */
  sort: 'recommend' | 'price-asc' | 'price-desc'
}

/** 一条推荐 */
export interface AssistantProductVO {
  id: number
  title: string
  price: number
  stock: number
  /** 封面图，无图为 null */
  coverImage: string | null
  categoryId: number
  categoryName: string
  sellerName: string
  /** 推荐理由（一句话，能直接读给用户听） */
  reason: string
  /** 相对匹配分（只用于展示排序/高亮，不代表绝对值） */
  score: number
}

/** POST /api/assistant/chat 的返回 */
export interface AssistantReplyVO {
  /** 自然语言回复（含换行，前端按行渲染） */
  reply: string
  intent: AssistantIntentVO
  recommendations: AssistantProductVO[]
  /** 本次检索到的候选总数（应用过滤后、截断前） */
  totalCandidates: number
  /** 生成引擎：local-catalog 表示「本地规则 + 商品库检索」，没有调用外部模型 */
  engine: 'local-catalog'
  /** 生成时间（ISO 8601） */
  generatedAt: string
  /** 本次对话所属的会话 id；未登录或未落库时为 null */
  conversationId: number | null
}

/** 历史会话里的一条消息 */
export interface AssistantMessageVO {
  id: number
  role: 'user' | 'assistant'
  content: string
  /** 当时的推荐商品快照；没有推荐时为空数组 */
  recommendations: AssistantProductVO[]
  /** 当时的意图解析；老数据/用户消息为 null */
  intent: AssistantIntentVO | null
  /** 发送时间（ISO 8601） */
  createdAt: string
}

/** 历史会话列表项 */
export interface AssistantConversationVO {
  id: number
  title: string
  /** 消息条数（用户 + 助手） */
  messageCount: number
  /** 最后一条消息的预览（截断到 40 字） */
  lastMessagePreview: string | null
  createdAt: string
  updatedAt: string
}

/** GET /api/assistant/conversations */
export interface AssistantConversationListVO {
  list: AssistantConversationVO[]
  total: number
  page: number
  pageSize: number
}

/** GET /api/assistant/conversations/:id */
export interface AssistantConversationDetailVO {
  id: number
  title: string
  createdAt: string
  updatedAt: string
  /** 按时间正序（最早的在最上面） */
  messages: AssistantMessageVO[]
}
