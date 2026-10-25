/**
 * AI 手帐助手 · 请求 DTO（入参）
 * ----------------------------------------------------------------------------
 * 沿用其它模块的约定：字段写成「可选 + 宽松类型」，校验全部在 service，
 * controller 原样透传，避免非法输入变成 500。
 */
export interface AssistantChatDTO {
  /** 用户这条消息，1 ~ 500 字符 */
  message?: unknown
  /**
   * 会话 id（落库后新增）：
   *   - 传了 → 续写这个会话（同时忽略 history，用数据库里的消息做上下文）；
   *   - 不传 → 登录用户自动开一个新会话；未登录用户不落库。
   */
  conversationId?: unknown
  /**
   * 可选的对话历史（最多取最近 6 条）。
   * 只在「未登录 / 没有 conversationId」时作为上下文来源；
   * 已登录且带 conversationId 时以数据库为准，避免客户端伪造上下文。
   */
  history?: unknown
}

/** POST /api/assistant/conversations —— 开启一轮新对话 */
export interface CreateConversationDTO {
  /** 会话标题，1 ~ 40 字；不传则由 service 生成默认标题 */
  title?: unknown
}

/** GET /api/assistant/conversations —— 历史会话列表的查询参数 */
export interface AssistantPageQueryDTO {
  page?: string | undefined
  pageSize?: string | undefined
}
