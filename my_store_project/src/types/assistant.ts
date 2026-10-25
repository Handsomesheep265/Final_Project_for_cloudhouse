/**
 * AI 手帐助手接口类型
 * ----------------------------------------------------------------------------
 * 与 backend/src/types/assistant.vo.ts 一一对应：
 *   POST /api/assistant/chat → AssistantReplyVO
 *
 * 后端保证：recommendations 里的商品全部来自商城在售、有货的商品，
 * 且 reason 已经是一句可以直接展示的中文推荐理由 —— 前端只负责渲染。
 */

/** 意图类型：商品推荐 / 闲聊（只介绍能力，不推荐商品） */
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

/** 本次请求的解析结果（用于展示「已理解：贴纸 · ≤ ¥100」） */
export interface AssistantIntentVO {
  type: AssistantIntentType
  categories: AssistantCategoryVO[]
  keywords: string[]
  budget: AssistantBudgetVO | null
  sort: 'recommend' | 'price-asc' | 'price-desc'
}

/** 一条推荐（对应商城里的一件真实商品） */
export interface AssistantProductVO {
  id: number
  title: string
  price: number
  stock: number
  /** 封面图：assets 相对路径或完整 URL，交给 ProductThumb 解析 */
  coverImage: string | null
  categoryId: number
  categoryName: string
  sellerName: string
  /** 推荐理由（后端生成，前端直接展示） */
  reason: string
  /** 匹配分，仅用于调试/排序展示 */
  score: number
}

/** POST /api/assistant/chat 的返回 */
export interface AssistantReplyVO {
  reply: string
  intent: AssistantIntentVO
  recommendations: AssistantProductVO[]
  totalCandidates: number
  engine: 'local-catalog'
  generatedAt: string
  /** 本次回复所属的会话 id（登录后后端落库才有；未登录为 null） */
  conversationId: number | null
}

/** 发一条消息时的请求体 */
export interface AssistantChatPayload {
  message: string
  /** 带上会话 id 就是「续写这一轮」；不带则由后端自动开新会话（登录时） */
  conversationId?: number
  /** 仅未登录 / 无会话时作为上下文（后端在续写会话时以数据库为准） */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

/* ------------------------------ 历史会话 ------------------------------ */

/** 历史会话里的一条消息 */
export interface AssistantMessageVO {
  id: number
  role: 'user' | 'assistant'
  content: string
  /** 当时的推荐商品快照；没有推荐时为空数组 */
  recommendations: AssistantProductVO[]
  /** 当时的意图解析；老数据 / 用户消息为 null */
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
  /** 最后一条消息预览（后端已截断） */
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

/** 历史列表的分页参数 */
export interface AssistantConversationListParams {
  page?: number
  pageSize?: number
}
