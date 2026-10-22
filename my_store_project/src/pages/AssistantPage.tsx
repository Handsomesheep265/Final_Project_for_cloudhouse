import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import PageHeader from '../components/PageHeader'
import { SendIcon, SparklesIcon } from '../components/Icons'
import {
  ASSISTANT_SUGGESTIONS,
  selectAssistantMessages,
  selectAssistantThinking,
  useAssistantStore,
} from '../stores/assistantStore'
import type { AssistantMessage } from '../stores/assistantStore'
import { ROUTES } from '../router/paths'
import styles from './AssistantPage.module.css'

/** 输入框最大高度（超过就内部滚动），约 5 行 */
const TEXTAREA_MAX_HEIGHT = 132

/**
 * AI 手帐助手（/assistant）
 * ----------------------------------------------------------------------------
 * 入口是全局悬浮按钮（components/AssistantFab.tsx）：任何页面点它都会来到这里。
 * 页面结构：页头 → 说明条 → 消息流（含开场推荐问题）→ 底部固定输入条。
 *
 * 当前没有后端：消息回复由 stores/assistantStore.ts 调 utils/assistantReplies.ts
 * 在本地生成。接入真实接口时只改 store 的 send()，本页不需要动。
 */
export default function AssistantPage() {
  const messages = useAssistantStore(selectAssistantMessages)
  const thinking = useAssistantStore(selectAssistantThinking)
  const send = useAssistantStore((state) => state.send)
  const clear = useAssistantStore((state) => state.clear)

  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  /** 新消息 / 正在输入时滚到底部 */
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  /** 输入框高度随内容增长（到上限后内部滚动） */
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`
  }, [draft])

  const submit = useCallback(() => {
    const text = draft.trim()
    if (!text || thinking) return
    setDraft('')
    void send(text)
  }, [draft, thinking, send])

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      submit()
    },
    [submit],
  )

  /** Enter 发送，Shift + Enter 换行（和常见聊天软件一致） */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
      event.preventDefault()
      submit()
    },
    [submit],
  )

  const handleSuggestion = useCallback(
    (text: string) => {
      if (thinking) return
      void send(text)
    },
    [send, thinking],
  )

  const showSuggestions = messages.length <= 1 && !thinking

  return (
    <div className={styles.page}>
      <PageHeader
        title="AI 手帐助手"
        to={ROUTES.home}
        backLabel="返回上一页"
        right={
          messages.length > 1 ? (
            <button type="button" className={styles.clearBtn} onClick={clear}>
              清空对话
            </button>
          ) : null
        }
      />

      <main className={styles.main} ref={listRef}>
        <p className={styles.notice}>
          本地演示版：回复由前端示例生成，后端接口接入后会换成真实模型。
        </p>

        <ol className={styles.messages} aria-live="polite" aria-label="对话记录">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {thinking && (
            <li className={styles.rowAssistant}>
              <span className={styles.avatar} aria-hidden="true">
                <SparklesIcon size={15} />
              </span>
              <span className={styles.typing} aria-label="助手正在输入">
                <i />
                <i />
                <i />
              </span>
            </li>
          )}
        </ol>

        {showSuggestions && (
          <div className={styles.suggestions}>
            <p className={styles.suggestionsTitle}>可以这样问</p>
            <div className={styles.suggestionList}>
              {ASSISTANT_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={styles.suggestion}
                  onClick={() => handleSuggestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <form className={styles.composer} onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={draft}
          rows={1}
          placeholder="问问排版、配色、选品，或让我写条文案…"
          aria-label="输入消息"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          className={styles.sendBtn}
          disabled={draft.trim().length === 0 || thinking}
          aria-label="发送"
        >
          <SendIcon size={18} />
        </button>
      </form>
    </div>
  )
}

/** 单条消息：助手在左、用户在右 */
function MessageBubble({ message }: { message: AssistantMessage }) {
  const isUser = message.role === 'user'

  return (
    <li className={isUser ? styles.rowUser : styles.rowAssistant}>
      {!isUser && (
        <span className={styles.avatar} aria-hidden="true">
          <SparklesIcon size={15} />
        </span>
      )}

      <p className={isUser ? styles.bubbleUser : styles.bubbleAssistant}>
        {message.content.split('\n').map((line, index) => (
          <span key={`${message.id}-${index}`} className={styles.line}>
            {line}
          </span>
        ))}
      </p>
    </li>
  )
}
