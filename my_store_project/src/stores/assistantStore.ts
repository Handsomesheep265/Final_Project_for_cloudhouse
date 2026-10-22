/**
 * AI 手帐助手 · 前端本地对话状态
 * ----------------------------------------------------------------------------
 * 现在还没有后端接口，所以助手回复由 src/utils/assistantReplies.ts 在本地生成
 * （关键词匹配 + 占位话术）。等接口就绪时，只需要把 send() 里的
 * `replyTo(content)` 换成一次真实请求即可，页面与组件都不用改。
 *
 * 消息只放在内存里（不落 localStorage）：
 * 这些是演示回复，持久化反而会让人误以为是真实历史；清空按钮 / 刷新即回到开场白。
 */
import { create } from 'zustand'
import { replyTo } from '../utils/assistantReplies'

export type AssistantRole = 'user' | 'assistant'

export interface AssistantMessage {
  id: string
  role: AssistantRole
  content: string
  /** 生成时间（毫秒），用于展示「刚刚」或后续排序 */
  at: number
}

/** 开场白：说明身份 + 能做什么 + 本地演示的边界 */
export const ASSISTANT_GREETING =
  '你好，我是手帐集市的小助手 ✨\n可以帮你挑本子、配胶带、想排版思路，也能写手帐文案。\n现在是本地演示版：回复由前端示例生成，接入接口后会换成真实模型。'

/** 首次进入时的推荐问题 */
export const ASSISTANT_SUGGESTIONS = [
  '帮我写一条手帐文案',
  '推荐适合新手的手帐本',
  '预算 100 元怎么配一整套',
  '胶带配色有什么建议',
]

function createMessage(role: AssistantRole, content: string): AssistantMessage {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    at: Date.now(),
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface AssistantState {
  messages: AssistantMessage[]
  /** 助手「正在输入」状态，用于禁用发送并显示三个点 */
  thinking: boolean
}

interface AssistantActions {
  /** 发送一条用户消息，并拿到一条（本地生成的）回复 */
  send: (text: string) => Promise<void>
  /** 清空对话，回到开场白 */
  clear: () => void
}

export interface AssistantStore extends AssistantState, AssistantActions {}

export const useAssistantStore = create<AssistantStore>()((set, get) => ({
  messages: [createMessage('assistant', ASSISTANT_GREETING)],
  thinking: false,

  send: async (text) => {
    const content = text.trim()
    // 空内容 / 上一条还没回复完：直接忽略，避免连点发多条
    if (!content || get().thinking) return

    set((state) => ({
      messages: [...state.messages, createMessage('user', content)],
      thinking: true,
    }))

    // 模拟一下「思考」耗时，让界面有真实对话的节奏
    await sleep(420 + Math.random() * 380)

    set((state) => ({
      messages: [...state.messages, createMessage('assistant', replyTo(content))],
      thinking: false,
    }))
  },

  clear: () => {
    set({ messages: [createMessage('assistant', ASSISTANT_GREETING)], thinking: false })
  },
}))

/* ------------------------------ 派生数据 ------------------------------ */

export const selectAssistantMessages = (state: AssistantStore): AssistantMessage[] =>
  state.messages
export const selectAssistantThinking = (state: AssistantStore): boolean => state.thinking
