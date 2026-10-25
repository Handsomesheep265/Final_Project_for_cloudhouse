/**
 * AI 手帐助手 · 实体（Entity）
 * ----------------------------------------------------------------------------
 * 助手不自己造商品，也不编价格：候选商品全部来自 products 表（在售、有库存）。
 * 这个文件只描述「推荐候选」需要的那几列，不重复商品模块的完整实体。
 *
 * 从「对话落库」开始，这里还描述两类持久化实体：
 *   AssistantConversationEntity —— 一轮会话（列表页用，带消息数与最后一条预览）
 *   AssistantMessageEntity      —— 会话里的一条消息（含当时的结构化推荐快照）
 */
import type { AssistantIntentVO, AssistantProductVO } from './assistant.vo'

export interface AssistantProductEntity {
  id: number
  title: string
  description: string | null
  price: number
  stock: number
  categoryId: number
  categoryName: string
  sellerName: string
  /** 封面图（product_images 里 sort_order 最小的那张），无图为 null */
  imageUrl: string | null
  /** 评价平均分，没有评价为 0 */
  rating: number
  /** 累计销量（order_items 数量之和，不含已取消订单） */
  sales: number
}

/** 某个分类（或全站）的价格区间，用于「预算内没有」时给替代建议 */
export interface AssistantPriceRangeEntity {
  minPrice: number | null
  maxPrice: number | null
  productCount: number
}

/** 消息角色（与前端一致） */
export type AssistantMessageRole = 'user' | 'assistant'

/** 一轮会话（assistant_conversations 一行 + 两个派生列） */
export interface AssistantConversationEntity {
  id: number
  userId: number
  title: string
  /** 该会话的消息条数（含用户与助手） */
  messageCount: number
  /** 最后一条消息的原文（列表里截断展示） */
  lastMessage: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * 一条消息（assistant_messages 一行）。
 * recommendations / intent 是「当时」的快照：历史对话回放时商品卡能原样还原，
 * 即使商品后来改价、下架也不会变形。
 */
export interface AssistantMessageEntity {
  id: number
  conversationId: number
  role: AssistantMessageRole
  content: string
  recommendations: AssistantProductVO[]
  intent: AssistantIntentVO | null
  createdAt: Date
}

/** 写入一轮对话需要的数据（一次用户提问 + 一条助手回复） */
export interface AssistantTurnEntity {
  userContent: string
  assistantContent: string
  recommendations: AssistantProductVO[]
  intent: AssistantIntentVO
}
