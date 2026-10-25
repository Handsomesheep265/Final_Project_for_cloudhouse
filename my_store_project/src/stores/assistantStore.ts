/**
 * AI 手帐助手 · 对话状态（接真实后端接口）
 * ----------------------------------------------------------------------------
 * 消息与推荐都来自 POST /api/assistant/chat：
 *   - reply            → 气泡里的文字
 *   - recommendations  → 气泡下方的商品卡（点卡片进商品详情）
 *   - intent           → 「已理解：贴纸 · ≤ ¥100」这样的筛选标签
 *   - conversationId   → 登录后后端落库的会话 id，续写时带回去
 *
 * 几个约定：
 *   1. 页面里的消息只放在内存（刷新回到开场白）；真正的「历史对话」在后端数据库，
 *      由 /api/assistant/conversations 提供（历史列表 UI 后续再接）；
 *   2. 已登录时把 conversationId 带在请求里，这一轮问答就会落到同一个会话；
 *      「清空对话」会重置 conversationId，下一条消息自动开启新会话；
 *   3. 未登录时后端不落库，conversationId 始终为 null，只能靠 history 做上下文；
 *   4. 请求失败（后端没启动、接口报错）时追加一条 tone='error' 的助手消息，
 *      样式区分开，并且不进入下一轮 history。
 */
import { create } from 'zustand'
import { ApiError } from '../api/client'
import { assistantApi } from '../api/assistant'
import type {
  AssistantConversationDetailVO,
  AssistantIntentVO,
  AssistantProductVO,
  AssistantReplyVO,
} from '../types/assistant'

export type AssistantRole = 'user' | 'assistant'

export interface AssistantMessage {
  id: string
  role: AssistantRole
  content: string
  /** 生成时间（毫秒） */
  at: number
  /** 仅助手消息：结构化推荐（为空表示这次没有商品推荐） */
  recommendations?: AssistantProductVO[]
  /** 仅助手消息：后端解析出的意图，用于展示筛选标签 */
  intent?: AssistantIntentVO
  /** 错误提示消息：红色样式，并且不参与下一轮上下文 */
  tone?: 'normal' | 'error'
}

/** 开场白：说明身份 + 能力边界 */
export const ASSISTANT_GREETING = [
  '你好，我是手帐集市的小助手 ✨',
  '我会在商城的在售商品里帮你挑本子、贴纸、胶带、印章、笔和素材包，并说明为什么推荐它。',
  '告诉我「类型 + 预算 + 风格」就行，比如「100 元以内的贴纸，复古风」。',
].join('\n')

/** 首次进入时的推荐问题（都能被后端解析成「分类 + 预算」） */
export const ASSISTANT_SUGGESTIONS = [
  '100 元以内的贴纸',
  '新手用的手帐本，预算 50 元',
  '送人的胶带，莫兰迪色',
  '50~80 元的胶带',
]

/** 带给后端的上下文条数（后端只取其中的用户消息） */
const HISTORY_LIMIT = 6

function createMessage(
  role: AssistantRole,
  content: string,
  options: { tone?: 'normal' | 'error' } = {},
): AssistantMessage {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    at: Date.now(),
    ...(options.tone === 'error' ? { tone: 'error' as const } : {}),
  }
}

/** 后端回复 → 一条助手消息 */
function createReplyMessage(reply: AssistantReplyVO): AssistantMessage {
  return {
    ...createMessage('assistant', reply.reply),
    ...(reply.recommendations.length > 0 ? { recommendations: reply.recommendations } : {}),
    ...(reply.intent ? { intent: reply.intent } : {}),
  }
}

/** 取最近几条消息作为上下文；错误消息不参与 */
function toHistory(messages: AssistantMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((message) => message.tone !== 'error' && message.content.trim().length > 0)
    .slice(-HISTORY_LIMIT)
    .map((message) => ({ role: message.role, content: message.content }))
}

interface AssistantState {
  messages: AssistantMessage[]
  /** 助手「正在输入」状态，用于禁用发送并显示三个点 */
  thinking: boolean
  /**
   * 当前对话在后端的会话 id（登录后第一句回复才会拿到）。
   * 后续发送带上它，这一轮问答就会落到同一个会话里；
   * 点了「清空对话」会重置为 null，下一句自然开启一轮新对话。
   */
  conversationId: number | null
}

interface AssistantActions {
  /** 发送一条用户消息，并请求后端生成回复 */
  send: (text: string) => Promise<void>
  /** 清空对话，回到开场白（下一句会开启新会话） */
  clear: () => void
  /** 打开一条历史对话：用后端返回的消息替换当前画面 */
  loadConversation: (detail: AssistantConversationDetailVO) => void
}

export interface AssistantStore extends AssistantState, AssistantActions {}

export const useAssistantStore = create<AssistantStore>()((set, get) => ({
  messages: [createMessage('assistant', ASSISTANT_GREETING)],
  thinking: false,
  conversationId: null,

  send: async (text) => {
    const content = text.trim()
    // 空内容 / 上一条还没回复完：直接忽略，避免连点发多条
    if (!content || get().thinking) return

    // 续写会话时后端会以数据库里的消息为准，history 只对未登录场景有意义；
    // 这里仍然带上，保证「未登录也能追问」的体验。
    const history = toHistory(get().messages)
    const conversationId = get().conversationId
    set((state) => ({
      messages: [...state.messages, createMessage('user', content)],
      thinking: true,
    }))

    try {
      const reply = await assistantApi.chat({
        message: content,
        ...(conversationId !== null ? { conversationId } : {}),
        history,
      })
      set((state) => ({
        messages: [...state.messages, createReplyMessage(reply)],
        thinking: false,
        // 登录用户会拿到 id；未登录是 null，保持不变即可
        conversationId: reply.conversationId ?? state.conversationId,
      }))
    } catch (error) {
      const reason =
        error instanceof ApiError ? error.message : '助手暂时不可用，请稍后再试'
      set((state) => ({
        messages: [
          ...state.messages,
          createMessage('assistant', `抱歉，${reason}`, { tone: 'error' }),
        ],
        thinking: false,
      }))
    }
  },

  clear: () => {
    set({
      messages: [createMessage('assistant', ASSISTANT_GREETING)],
      thinking: false,
      // 从下一条消息开始就是新会话（后端会新建一行 conversations）
      conversationId: null,
    })
  },

  loadConversation: (detail) => {
    const messages: AssistantMessage[] = detail.messages.map((message) => ({
      ...createMessage(message.role, message.content),
      // 历史消息用后端记录的时间，而不是「现在」
      at: Number.isNaN(Date.parse(message.createdAt)) ? Date.now() : Date.parse(message.createdAt),
      ...(message.recommendations.length > 0
        ? { recommendations: message.recommendations }
        : {}),
      ...(message.intent ? { intent: message.intent } : {}),
    }))

    set({
      conversationId: detail.id,
      thinking: false,
      // 空会话（刚新建还没聊）仍然显示开场白
      messages: messages.length > 0 ? messages : [createMessage('assistant', ASSISTANT_GREETING)],
    })
  },
}))

/* ------------------------------ 派生数据 ------------------------------ */

export const selectAssistantMessages = (state: AssistantStore): AssistantMessage[] =>
  state.messages
export const selectAssistantThinking = (state: AssistantStore): boolean => state.thinking
