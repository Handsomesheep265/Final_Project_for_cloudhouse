/**
 * AI 手帐助手接口
 * ----------------------------------------------------------------------------
 * 与 backend/src/routes/assistantRoutes.ts 对应：
 *   POST   /api/assistant/chat                    聊天（登录时落库）
 *   GET    /api/assistant/conversations           我的历史对话（分页）
 *   POST   /api/assistant/conversations           开启一轮新对话
 *   GET    /api/assistant/conversations/:id       某个对话的完整消息
 *   DELETE /api/assistant/conversations/:id       删除对话
 *
 * 聊天公开；历史相关接口需要登录（未登录会 401 40102，由全局拦截器处理）。
 */
import { request } from './client'
import type {
  AssistantChatPayload,
  AssistantConversationDetailVO,
  AssistantConversationListParams,
  AssistantConversationListVO,
  AssistantReplyVO,
} from '../types/assistant'

const BASE = '/api/assistant'

/** 拼查询串：不传的参数不写进去 */
function toQuery(params: AssistantConversationListParams): string {
  const search = new URLSearchParams()
  if (params.page !== undefined) search.set('page', String(params.page))
  if (params.pageSize !== undefined) search.set('pageSize', String(params.pageSize))
  const query = search.toString()
  return query ? `?${query}` : ''
}

export const assistantApi = {
  /** 发一条消息，拿到「回复 + 结构化推荐商品 + 会话 id」 */
  chat: (payload: AssistantChatPayload) =>
    request<AssistantReplyVO>(`${BASE}/chat`, { method: 'POST', body: payload }),

  /** 我的历史对话列表（按最近聊的倒序） */
  listConversations: (params: AssistantConversationListParams = {}) =>
    request<AssistantConversationListVO>(`${BASE}/conversations${toQuery(params)}`),

  /** 开启一轮新对话（空会话，第一条消息会落进去） */
  createConversation: (title?: string) =>
    request<AssistantConversationDetailVO>(`${BASE}/conversations`, {
      method: 'POST',
      body: title === undefined ? {} : { title },
    }),

  /** 查看某个对话的完整消息（历史回放） */
  getConversation: (conversationId: number) =>
    request<AssistantConversationDetailVO>(
      `${BASE}/conversations/${encodeURIComponent(String(conversationId))}`,
    ),

  /** 删除某个对话（连同消息） */
  deleteConversation: (conversationId: number) =>
    request<null>(`${BASE}/conversations/${encodeURIComponent(String(conversationId))}`, {
      method: 'DELETE',
    }),
}
