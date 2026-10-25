import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import ProductThumb from '../components/ProductThumb'
import {
  ChevronRightIcon,
  HistoryIcon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
  TrashIcon,
} from '../components/Icons'
import { assistantApi } from '../api/assistant'
import { ApiError } from '../api/client'
import { selectAuthStatus, useAuthStore } from '../stores/authStore'
import {
  ASSISTANT_SUGGESTIONS,
  selectAssistantMessages,
  selectAssistantThinking,
  useAssistantStore,
} from '../stores/assistantStore'
import type { AssistantMessage } from '../stores/assistantStore'
import type {
  AssistantConversationVO,
  AssistantIntentVO,
  AssistantProductVO,
} from '../types/assistant'
import { formatDateTime, formatPrice } from '../utils/format'
import { ROUTES, loginPath, productPath } from '../router/paths'
import styles from './AssistantPage.module.css'

/** 输入框最大高度（超过就内部滚动），约 5 行 */
const TEXTAREA_MAX_HEIGHT = 132
/** 侧边栏一次拉多少条历史会话 */
const HISTORY_PAGE_SIZE = 30

type HistoryStatus = 'idle' | 'loading' | 'ready' | 'error'

/** 「已理解：贴纸 · ≤ ¥100」这种标签，只展示后端确实解析出的条件 */
function describeIntent(intent: AssistantIntentVO): string {
  const parts: string[] = []

  if (intent.categories.length > 0) {
    parts.push(intent.categories.map((category) => category.name).join(' / '))
  }

  const min = intent.budget?.min ?? null
  const max = intent.budget?.max ?? null
  if (min !== null && max !== null) parts.push(`¥${min}~¥${max}`)
  else if (max !== null) parts.push(`≤ ¥${max}`)
  else if (min !== null) parts.push(`≥ ¥${min}`)

  if (intent.keywords.length > 0) parts.push(intent.keywords.join('、'))

  return parts.join(' · ')
}

/** 侧边栏的时间：'MM-DD HH:mm'，比完整日期短一些 */
function shortTime(iso: string): string {
  const formatted = formatDateTime(iso)
  return formatted.length >= 16 ? formatted.slice(5) : formatted
}

/**
 * AI 手帐助手（/assistant）
 * ----------------------------------------------------------------------------
 * 入口是全局悬浮按钮（components/AssistantFab.tsx）：任何页面点它都会来到这里。
 *
 * 页面结构：
 *   页头 → 主体（左侧历史侧边栏 + 右侧聊天列）→ 底部输入条
 *
 * 侧边栏（本次新增）：
 *   - 历史对话列表：点一条就把那轮对话加载到右侧（消息 + 商品卡快照）；
 *   - 每条可删除（先二次确认，删除当前打开的会话会回到开场白）；
 *   - 「新对话」清空当前画面，下一句话由后端自动建新会话；
 *   - 未登录时显示登录引导（历史是用户私有数据，接口需要 token）。
 *
 * 桌面端侧边栏常驻；窄屏（< 880px）变成抽屉，由页头「历史」按钮开合。
 */
export default function AssistantPage() {
  const messages = useAssistantStore(selectAssistantMessages)
  const thinking = useAssistantStore(selectAssistantThinking)
  const conversationId = useAssistantStore((state) => state.conversationId)
  const send = useAssistantStore((state) => state.send)
  const clear = useAssistantStore((state) => state.clear)
  const loadConversation = useAssistantStore((state) => state.loadConversation)

  const authenticated = useAuthStore(selectAuthStatus) === 'authenticated'

  const [draft, setDraft] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyItems, setHistoryItems] = useState<AssistantConversationVO[]>([])
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>('idle')
  const [historyError, setHistoryError] = useState<string | null>(null)
  /** 正在加载/删除的会话 id，用于禁用那一行 */
  const [busyId, setBusyId] = useState<number | null>(null)
  /** 正在二次确认删除的会话 id */
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const listRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  /* ------------------------------ 历史列表 ------------------------------ */

  const refreshHistory = useCallback(async () => {
    if (!authenticated) {
      setHistoryItems([])
      setHistoryStatus('idle')
      setHistoryError(null)
      return
    }

    // 已经有列表时不闪 loading，静默刷新即可
    setHistoryStatus((current) => (current === 'ready' ? 'ready' : 'loading'))
    try {
      const result = await assistantApi.listConversations({ page: 1, pageSize: HISTORY_PAGE_SIZE })
      setHistoryItems(result.list)
      setHistoryStatus('ready')
      setHistoryError(null)
    } catch (error) {
      setHistoryError(
        error instanceof ApiError ? error.message : '历史对话加载失败，请稍后重试',
      )
      setHistoryStatus('error')
    }
  }, [authenticated])

  // 进入页面 / 登录状态变化 → 拉一次历史
  useEffect(() => {
    // 数据拉取型 effect：请求历史列表后写入状态；setState 都在 await 之后
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshHistory()
  }, [refreshHistory])

  // 消息条数变化（发完一轮、加载了历史、清空）→ 静默刷新列表（标题/时间/条数会变）
  useEffect(() => {
    if (!authenticated) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshHistory()
  }, [authenticated, messages.length, refreshHistory])

  const openConversation = useCallback(
    async (id: number) => {
      // 正在等回复时不要切会话：否则这条回复会追加到刚打开的历史里
      if (busyId !== null || thinking) return
      setBusyId(id)
      setHistoryError(null)
      try {
        const detail = await assistantApi.getConversation(id)
        loadConversation(detail)
        setHistoryOpen(false)
        setConfirmId(null)
      } catch (error) {
        setHistoryError(error instanceof ApiError ? error.message : '这条对话加载失败')
        setHistoryStatus('error')
      } finally {
        setBusyId(null)
      }
    },
    [busyId, thinking, loadConversation],
  )

  const removeConversation = useCallback(
    async (id: number) => {
      if (busyId !== null || thinking) return
      setBusyId(id)
      setHistoryError(null)
      try {
        await assistantApi.deleteConversation(id)
        setConfirmId(null)
        // 删的正是当前打开的那条 → 画面回到开场白
        if (id === conversationId) clear()
        await refreshHistory()
      } catch (error) {
        setHistoryError(error instanceof ApiError ? error.message : '删除失败，请稍后重试')
      } finally {
        setBusyId(null)
      }
    },
    [busyId, thinking, conversationId, clear, refreshHistory],
  )

  const startNewConversation = useCallback(() => {
    if (thinking) return
    clear()
    setHistoryOpen(false)
    setConfirmId(null)
  }, [thinking, clear])

  /* ------------------------------ 聊天区 ------------------------------ */

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
  const hasHistory = historyItems.length > 0

  return (
    <div className={styles.page}>
      <PageHeader
        title="AI 手帐助手"
        to={ROUTES.home}
        backLabel="返回上一页"
        right={
          <button
            type="button"
            className={styles.historyToggle}
            aria-expanded={historyOpen}
            aria-controls="assistant-history"
            onClick={() => setHistoryOpen((current) => !current)}
          >
            <HistoryIcon size={16} />
            历史
          </button>
        }
      />

      <div className={styles.body}>
        {historyOpen && (
          <button
            type="button"
            className={styles.backdrop}
            aria-label="关闭历史对话"
            onClick={() => setHistoryOpen(false)}
          />
        )}

        <aside
          id="assistant-history"
          className={
            historyOpen ? `${styles.sidebar} ${styles.sidebarOpen}` : styles.sidebar
          }
          aria-label="历史对话"
        >
          <div className={styles.sidebarHead}>
            <h2 className={styles.sidebarTitle}>历史对话</h2>
            <button
              type="button"
              className={styles.newBtn}
              onClick={startNewConversation}
              title="开启一轮新对话"
            >
              <PlusIcon size={14} />
              新对话
            </button>
          </div>

          {!authenticated ? (
            <div className={styles.sidebarEmpty}>
              <p className={styles.sidebarEmptyTitle}>登录后可保存历史</p>
              <p className={styles.sidebarEmptyText}>
                登录后每一轮对话都会自动保存，随时可以回来接着聊。
              </p>
              <Link className={styles.sidebarLink} to={loginPath(ROUTES.assistant)}>
                去登录
              </Link>
            </div>
          ) : historyStatus === 'loading' && !hasHistory ? (
            <p className={styles.sidebarHint}>正在加载历史对话…</p>
          ) : historyStatus === 'error' && !hasHistory ? (
            <div className={styles.sidebarEmpty}>
              <p className={styles.sidebarEmptyTitle}>历史加载失败</p>
              <p className={styles.sidebarEmptyText}>{historyError ?? '请稍后重试'}</p>
              <button type="button" className={styles.sidebarLink} onClick={() => void refreshHistory()}>
                重试
              </button>
            </div>
          ) : !hasHistory ? (
            <div className={styles.sidebarEmpty}>
              <p className={styles.sidebarEmptyTitle}>还没有历史对话</p>
              <p className={styles.sidebarEmptyText}>在右侧问一句，对话会自动出现在这里。</p>
            </div>
          ) : (
            <>
              <ul className={styles.conversationList}>
                {historyItems.map((item) => {
                  const active = item.id === conversationId
                  const busy = busyId === item.id
                  return (
                    <li
                      key={item.id}
                      className={active ? `${styles.conversationItem} ${styles.conversationItemActive}` : styles.conversationItem}
                    >
                      <button
                        type="button"
                        className={styles.conversationMain}
                        disabled={busy}
                        aria-current={active ? 'true' : undefined}
                        onClick={() => void openConversation(item.id)}
                      >
                        <span className={styles.conversationTitle}>{item.title}</span>
                        <span className={styles.conversationMeta}>
                          {item.messageCount} 条 · {shortTime(item.updatedAt)}
                        </span>
                      </button>

                      {confirmId === item.id ? (
                        <span className={styles.confirm}>
                          <button
                            type="button"
                            className={styles.confirmDelete}
                            disabled={busy}
                            onClick={() => void removeConversation(item.id)}
                          >
                            {busy ? '删除中…' : '删除'}
                          </button>
                          <button
                            type="button"
                            className={styles.confirmCancel}
                            onClick={() => setConfirmId(null)}
                          >
                            取消
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={styles.conversationDelete}
                          aria-label={`删除对话 ${item.title}`}
                          disabled={busy}
                          onClick={() => setConfirmId(item.id)}
                        >
                          <TrashIcon size={14} />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>

              {historyError !== null && (
                <p className={styles.sidebarError} role="status">
                  {historyError}
                </p>
              )}
            </>
          )}
        </aside>

        <div className={styles.chatColumn}>
          <main className={styles.main} ref={listRef}>
            <p className={styles.notice}>
              推荐只来自商城在售商品，价格与库存以商品详情为准，点卡片可以直接去看看。
            </p>

            <ol className={styles.messages} aria-live="polite" aria-label="对话记录">
              {messages.map((message) => (
                <MessageItem key={message.id} message={message} />
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
              placeholder="问问类型、预算、风格，比如「100 元以内的贴纸」"
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
      </div>
    </div>
  )
}

/**
 * 气泡里要显示的文字。
 * 后端的 reply 是「给纯文本客户端的完整版」：简介 + 编号商品清单 + 收尾建议。
 * 现在商品清单已经渲染成卡片了，再在气泡里重复一遍就显得很冗余，
 * 所以有推荐卡时只保留首段（简介）和最后一段（收尾建议）。
 * 没有推荐（闲聊 / 出错）时原样显示。
 */
function bubbleText(message: AssistantMessage): string {
  if (!message.recommendations || message.recommendations.length === 0) return message.content

  const blocks = message.content
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.length > 0)

  if (blocks.length <= 2) return message.content

  const first = blocks[0] ?? ''
  const last = blocks[blocks.length - 1] ?? ''
  return `${first}\n\n${last}`
}

/** 单条消息：助手在左、用户在右；助手消息可附带商品卡与「已理解」标签 */
function MessageItem({ message }: { message: AssistantMessage }) {
  const isUser = message.role === 'user'
  const intentLabel = !isUser && message.intent ? describeIntent(message.intent) : ''
  const recommendations = !isUser ? (message.recommendations ?? []) : []
  const text = bubbleText(message)

  return (
    <li className={isUser ? styles.rowUser : styles.rowAssistant}>
      {!isUser && (
        <span className={styles.avatar} aria-hidden="true">
          <SparklesIcon size={15} />
        </span>
      )}

      <div className={isUser ? `${styles.messageBody} ${styles.messageBodyUser}` : styles.messageBody}>
        <p
          className={
            isUser
              ? styles.bubbleUser
              : message.tone === 'error'
                ? `${styles.bubbleAssistant} ${styles.bubbleError}`
                : styles.bubbleAssistant
          }
        >
          {text.split('\n').map((line, index) => (
            <span key={`${message.id}-${index}`} className={styles.line}>
              {line}
            </span>
          ))}
        </p>

        {intentLabel.length > 0 && recommendations.length > 0 && (
          <p className={styles.intentChip}>
            <span className={styles.intentChipLabel}>已理解</span>
            {intentLabel}
          </p>
        )}

        {recommendations.length > 0 && (
          <ul className={styles.products} aria-label="推荐商品">
            {recommendations.map((product) => (
              <li key={product.id}>
                <RecommendationCard product={product} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

/** 推荐商品卡：整卡可点，进入商品详情 */
function RecommendationCard({ product }: { product: AssistantProductVO }) {
  return (
    <Link className={styles.productCard} to={productPath(product.id)}>
      <span className={styles.productThumb}>
        <ProductThumb
          src={product.coverImage}
          alt={product.title}
          seed={product.id}
          compact
        />
      </span>

      <span className={styles.productInfo}>
        <span className={styles.productTitle}>{product.title}</span>
        <span className={styles.productMeta}>
          <span className={styles.productPrice}>¥{formatPrice(product.price)}</span>
          <span className={styles.productCategory}>{product.categoryName}</span>
          <span className={styles.productSeller}>{product.sellerName}</span>
        </span>
        <span className={styles.productReason}>{product.reason}</span>
      </span>

      <span className={styles.productArrow} aria-hidden="true">
        <ChevronRightIcon size={16} />
      </span>
    </Link>
  )
}
