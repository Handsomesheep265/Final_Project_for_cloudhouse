/**
 * AI 手帐助手 · 仓储层（Repository）
 * ----------------------------------------------------------------------------
 * 只做数据访问：按「分类 / 预算 / 关键词」在 products 表里检索候选商品。
 *
 * 两条硬约束（对应需求「仅在商城现有产品数据库中检索」）：
 *   1. 只查 products 表，不接任何外部商品源 / 模型编造；
 *   2. 只返回在售（status = 1）且有库存（stock > 0）的商品 —— 推荐一个买不到的东西
 *      比不推荐更糟。
 *
 * 所有筛选条件都用占位符参数化，动态拼接的只有 service 校验过的整数与枚举；
 * 关键词用 LIKE 而不是全文索引：对话里的词往往只是标题的一两个片段（如「莫兰迪」），
 * 在 15 条种子数据的量级下 LIKE 足够快，也更好解释「为什么命中」。
 */
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { pool } from '../config/database'
import type {
  AssistantConversationEntity,
  AssistantMessageEntity,
  AssistantMessageRole,
  AssistantPriceRangeEntity,
  AssistantProductEntity,
  AssistantTurnEntity,
} from '../types/assistant.entity'
import type { AssistantIntentVO, AssistantProductVO } from '../types/assistant.vo'

/** 推荐排序：综合 / 价格升序 / 价格降序 */
export type AssistantSort = 'recommend' | 'price-asc' | 'price-desc'

/** 检索条件 */
export interface AssistantSearchFilters {
  /** 命中分类；空数组表示不限分类 */
  categoryIds: number[]
  /** 最低价（含） */
  minPrice: number | null
  /** 最高价（含） */
  maxPrice: number | null
  /** 风格关键词；命中标题或描述之一即可 */
  keywords: string[]
  sort: AssistantSort
  /** 最多取多少条候选（service 已限上限） */
  limit: number
}

/* ============================== SQL ============================== */

/** 推荐候选需要的列（rating / sales 是派生指标，与商品列表口径一致） */
const SELECT_CANDIDATES = `
  SELECT
    p.id            AS id,
    p.title         AS title,
    p.description   AS description,
    p.price         AS price,
    p.stock         AS stock,
    p.category_id   AS category_id,
    c.name          AS category_name,
    u.nickname      AS seller_name,
    (
      SELECT pi.image_url FROM product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.sort_order ASC, pi.id ASC
      LIMIT 1
    )               AS image_url,
    (
      SELECT COALESCE(AVG(r.rating), 0) FROM reviews r WHERE r.product_id = p.id
    )               AS rating,
    (
      SELECT COALESCE(SUM(oi.quantity), 0)
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id = p.id AND o.status <> 'CANCELED'
    )               AS sales
  FROM products p
  INNER JOIN users u      ON u.id = p.seller_id
  INNER JOIN categories c ON c.id = p.category_id
  WHERE p.status = 1 AND p.stock > 0
`

/** 排序方式 → ORDER BY（别名在 ORDER BY 里可用） */
const ORDER_BY: Record<AssistantSort, string> = {
  recommend: 'sales DESC, rating DESC, p.price ASC, p.id ASC',
  'price-asc': 'p.price ASC, sales DESC, p.id ASC',
  'price-desc': 'p.price DESC, sales DESC, p.id ASC',
}

/** 某分类（或全站）的在售有货价格区间与数量，用于「预算内没有」时给替代建议 */
const SELECT_PRICE_RANGE_HEAD = `
  SELECT
    MIN(p.price) AS min_price,
    MAX(p.price) AS max_price,
    COUNT(*)     AS product_count
  FROM products p
  WHERE p.status = 1 AND p.stock > 0
`

/* ------------------------- 对话落库（会话 / 消息） ------------------------- */

const INSERT_CONVERSATION = `
  INSERT INTO assistant_conversations (user_id, title)
  VALUES (?, ?)
`

/**
 * 会话的公共列 + 两个派生列：
 *   message_count —— 消息条数（列表页显示「N 条」）
 *   last_message  —— 最后一条消息原文（列表页做预览，截断在 service 层）
 * 用相关子查询而不是 GROUP BY：会话量小、写法直观，也能用上
 * idx_assistant_messages_conversation (conversation_id, id) 索引。
 */
const CONVERSATION_COLUMNS = `
  c.id            AS id,
  c.user_id       AS user_id,
  c.title         AS title,
  c.created_at    AS created_at,
  c.updated_at    AS updated_at,
  (
    SELECT COUNT(*) FROM assistant_messages m WHERE m.conversation_id = c.id
  )               AS message_count,
  (
    SELECT m.content FROM assistant_messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.id DESC
    LIMIT 1
  )               AS last_message
`

const SELECT_CONVERSATION = `
  SELECT ${CONVERSATION_COLUMNS}
  FROM assistant_conversations c
  WHERE c.id = ? AND c.user_id = ?
  LIMIT 1
`

const SELECT_CONVERSATIONS = `
  SELECT ${CONVERSATION_COLUMNS}
  FROM assistant_conversations c
  WHERE c.user_id = ?
  ORDER BY c.updated_at DESC, c.id DESC
  LIMIT ? OFFSET ?
`

const COUNT_CONVERSATIONS = `
  SELECT COUNT(*) AS total
  FROM assistant_conversations
  WHERE user_id = ?
`

/** 会话内消息：按 id 升序（最早的在上） */
const SELECT_MESSAGES = `
  SELECT id, conversation_id, role, content, recommendations, intent, created_at
  FROM assistant_messages
  WHERE conversation_id = ?
  ORDER BY id ASC
`

/** 取最近 N 条消息做上下文（倒序取，service 再反转） */
const SELECT_RECENT_MESSAGES = `
  SELECT role, content
  FROM assistant_messages
  WHERE conversation_id = ?
  ORDER BY id DESC
  LIMIT ?
`

const INSERT_MESSAGE = `
  INSERT INTO assistant_messages (conversation_id, role, content, recommendations, intent)
  VALUES (?, ?, ?, ?, ?)
`

/** 有新消息就摸一下会话的 updated_at（列表按它倒序） */
const TOUCH_CONVERSATION = `
  UPDATE assistant_conversations
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`

const DELETE_MESSAGES = `
  DELETE FROM assistant_messages
  WHERE conversation_id = ?
`

const DELETE_CONVERSATION = `
  DELETE FROM assistant_conversations
  WHERE id = ? AND user_id = ?
`

/** 只查归属，用于删除前的权限校验 */
const SELECT_CONVERSATION_OWNER = `
  SELECT id FROM assistant_conversations
  WHERE id = ? AND user_id = ?
  LIMIT 1
`

/* ============================ 行类型与映射 ============================ */

interface CandidateRow extends RowDataPacket {
  id: number
  title: string
  description: string | null
  price: number | string
  stock: number
  category_id: number
  category_name: string
  seller_name: string | null
  image_url: string | null
  rating: number | string
  sales: number | string
}

interface PriceRangeRow extends RowDataPacket {
  min_price: number | string | null
  max_price: number | string | null
  product_count: number | string
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapCandidateRow(row: CandidateRow): AssistantProductEntity {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: toNumber(row.price),
    stock: row.stock,
    categoryId: row.category_id,
    categoryName: row.category_name,
    sellerName: row.seller_name ?? '匿名手作人',
    imageUrl: row.image_url,
    rating: toNumber(row.rating),
    sales: toNumber(row.sales),
  }
}

/* ------------------------- 会话 / 消息的行与映射 ------------------------- */

interface ConversationRow extends RowDataPacket {
  id: number
  user_id: number
  title: string
  created_at: Date | string
  updated_at: Date | string
  message_count: number | string
  last_message: string | null
}

interface MessageRow extends RowDataPacket {
  id: number
  conversation_id: number
  role: string
  content: string
  recommendations: unknown
  intent: unknown
  created_at: Date | string
}

/**
 * JSON 列的取值兼容：
 *   mysql2 一般会把 JSON 列解析成对象/数组返回，但旧版本或某些配置下是字符串，
 *   这里两种都接受；解析失败按 null 处理，不让一条脏数据把整个历史接口搞挂。
 */
function parseStoredJson<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }
  if (typeof value === 'object') return value as T
  return null
}

function mapConversationRow(row: ConversationRow): AssistantConversationEntity {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    messageCount: toNumber(row.message_count),
    lastMessage: row.last_message,
    createdAt: toDateValue(row.created_at),
    updatedAt: toDateValue(row.updated_at),
  }
}

function mapMessageRow(row: MessageRow): AssistantMessageEntity {
  const role: AssistantMessageRole = row.role === 'user' ? 'user' : 'assistant'
  const recommendations = parseStoredJson<AssistantProductVO[]>(row.recommendations) ?? []
  const intent = parseStoredJson<AssistantIntentVO>(row.intent)

  return {
    id: row.id,
    conversationId: row.conversation_id,
    role,
    content: row.content,
    recommendations: Array.isArray(recommendations) ? recommendations : [],
    intent,
    createdAt: toDateValue(row.created_at),
  }
}

function toDateValue(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/** 拼 WHERE 片段；只拼固定的 `AND xxx`，用户输入一律走 ? 占位符 */
function buildWhere(filters: Pick<AssistantSearchFilters, 'categoryIds' | 'minPrice' | 'maxPrice' | 'keywords'>): {
  where: string
  params: Array<string | number>
} {
  const conditions: string[] = []
  const params: Array<string | number> = []

  if (filters.categoryIds.length > 0) {
    conditions.push(`p.category_id IN (${filters.categoryIds.map(() => '?').join(', ')})`)
    params.push(...filters.categoryIds)
  }
  if (filters.minPrice !== null) {
    conditions.push('p.price >= ?')
    params.push(filters.minPrice)
  }
  if (filters.maxPrice !== null) {
    conditions.push('p.price <= ?')
    params.push(filters.maxPrice)
  }
  if (filters.keywords.length > 0) {
    // 任一关键词命中标题或描述即可
    const ors = filters.keywords.map(() => '(p.title LIKE ? OR COALESCE(p.description, \'\') LIKE ?)')
    conditions.push(`(${ors.join(' OR ')})`)
    for (const keyword of filters.keywords) {
      const like = `%${keyword}%`
      params.push(like, like)
    }
  }

  return {
    where: conditions.map((condition) => ` AND ${condition}`).join(''),
    params,
  }
}

/* ============================== 仓储实现 ============================== */

export class AssistantRepository {
  constructor(private readonly db: Pool) {}

  /** 按条件检索候选商品（在售 + 有货） */
  async searchCandidates(filters: AssistantSearchFilters): Promise<AssistantProductEntity[]> {
    const { where, params } = buildWhere(filters)
    // LIMIT 直接拼接：service 校验过的正整数，不存在注入
    const [rows] = await this.db.execute<CandidateRow[]>(
      `${SELECT_CANDIDATES}${where} ORDER BY ${ORDER_BY[filters.sort]} LIMIT ${filters.limit}`,
      params,
    )
    return rows.map(mapCandidateRow)
  }

  /** 候选总数（用于回复里的「共 N 件」） */
  async countCandidates(
    filters: Pick<AssistantSearchFilters, 'categoryIds' | 'minPrice' | 'maxPrice' | 'keywords'>,
  ): Promise<number> {
    const { where, params } = buildWhere(filters)
    const [rows] = await this.db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM products p WHERE p.status = 1 AND p.stock > 0${where}`,
      params,
    )
    const row = rows[0] as { total?: number | string } | undefined
    return toNumber(row?.total)
  }

  /** 指定分类（空数组 = 全站）的在售有货价格区间 */
  async findPriceRange(categoryIds: number[]): Promise<AssistantPriceRangeEntity> {
    let where = ''
    const params: number[] = []
    if (categoryIds.length > 0) {
      where = ` AND p.category_id IN (${categoryIds.map(() => '?').join(', ')})`
      params.push(...categoryIds)
    }

    const [rows] = await this.db.execute<PriceRangeRow[]>(
      `${SELECT_PRICE_RANGE_HEAD}${where}`,
      params,
    )
    const row = rows[0]
    const min = row?.min_price === null || row?.min_price === undefined ? null : toNumber(row.min_price)
    const max = row?.max_price === null || row?.max_price === undefined ? null : toNumber(row.max_price)

    return {
      minPrice: min,
      maxPrice: max,
      productCount: toNumber(row?.product_count),
    }
  }

  /* ------------------------------ 会话（落库） ------------------------------ */

  /** 新建一个空会话（「开启一轮新对话」） */
  async createConversation(userId: number, title: string): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(INSERT_CONVERSATION, [userId, title])
    return result.insertId
  }

  /**
   * 新建会话 + 写入第一轮问答（同一事务）。
   * 对应「已登录、没带 conversationId」的第一次提问：
   * 要么会话和两条消息都落库，要么全都不落，避免出现空会话。
   */
  async createConversationWithTurn(
    userId: number,
    title: string,
    turn: AssistantTurnEntity,
  ): Promise<number> {
    const connection = await this.db.getConnection()
    try {
      await connection.beginTransaction()

      const [result] = await connection.execute<ResultSetHeader>(INSERT_CONVERSATION, [
        userId,
        title,
      ])
      const conversationId = result.insertId

      await this.insertTurn(connection, conversationId, turn)
      await connection.commit()
      return conversationId
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  /** 往已有会话追加一轮问答（同一事务） */
  async appendTurn(conversationId: number, turn: AssistantTurnEntity): Promise<void> {
    const connection = await this.db.getConnection()
    try {
      await connection.beginTransaction()
      await this.insertTurn(connection, conversationId, turn)
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  /** 按 id + 所属用户查会话；不存在或不是本人的返回 null */
  async findConversation(
    userId: number,
    conversationId: number,
  ): Promise<AssistantConversationEntity | null> {
    const [rows] = await this.db.execute<ConversationRow[]>(SELECT_CONVERSATION, [
      conversationId,
      userId,
    ])
    const row = rows[0]
    return row ? mapConversationRow(row) : null
  }

  /** 我的历史会话（按最近聊的倒序，分页） */
  async listConversations(
    userId: number,
    options: { limit: number; offset: number },
  ): Promise<AssistantConversationEntity[]> {
    // LIMIT / OFFSET 直接拼接：service 校验过的正整数
    const [rows] = await this.db.execute<ConversationRow[]>(
      `${SELECT_CONVERSATIONS}`,
      [userId, options.limit, options.offset],
    )
    return rows.map(mapConversationRow)
  }

  /** 我的会话总数 */
  async countConversations(userId: number): Promise<number> {
    const [rows] = await this.db.execute<RowDataPacket[]>(COUNT_CONVERSATIONS, [userId])
    const row = rows[0] as { total?: number | string } | undefined
    return toNumber(row?.total)
  }

  /** 会话里的全部消息（按时间正序，用于历史回放） */
  async findMessages(conversationId: number): Promise<AssistantMessageEntity[]> {
    const [rows] = await this.db.execute<MessageRow[]>(SELECT_MESSAGES, [conversationId])
    return rows.map(mapMessageRow)
  }

  /**
   * 最近 N 条消息（按时间正序返回）。
   * 用于「续写会话」时构造上下文：以数据库为准，不信任客户端传来的 history。
   */
  async findRecentMessages(
    conversationId: number,
    limit: number,
  ): Promise<Array<{ role: AssistantMessageRole; content: string }>> {
    const [rows] = await this.db.execute<RowDataPacket[]>(SELECT_RECENT_MESSAGES, [
      conversationId,
      limit,
    ])

    return rows
      .map((row) => {
        const record = row as { role?: unknown; content?: unknown }
        const role: AssistantMessageRole = record.role === 'user' ? 'user' : 'assistant'
        return { role, content: typeof record.content === 'string' ? record.content : '' }
      })
      .reverse()
  }

  /** 删除会话及其消息（事务）；不是本人的会话返回 false */
  async deleteConversation(userId: number, conversationId: number): Promise<boolean> {
    const connection = await this.db.getConnection()
    try {
      await connection.beginTransaction()

      const [rows] = await connection.execute<RowDataPacket[]>(SELECT_CONVERSATION_OWNER, [
        conversationId,
        userId,
      ])
      if (rows.length === 0) {
        await connection.rollback()
        return false
      }

      await connection.execute(DELETE_MESSAGES, [conversationId])
      await connection.execute(DELETE_CONVERSATION, [conversationId, userId])
      await connection.commit()
      return true
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  /** 写一轮问答：一条用户消息 + 一条助手消息（含结构化快照），再摸一下会话时间 */
  private async insertTurn(
    connection: PoolConnection,
    conversationId: number,
    turn: AssistantTurnEntity,
  ): Promise<void> {
    await connection.execute(INSERT_MESSAGE, [
      conversationId,
      'user',
      turn.userContent,
      null,
      null,
    ])
    await connection.execute(INSERT_MESSAGE, [
      conversationId,
      'assistant',
      turn.assistantContent,
      JSON.stringify(turn.recommendations),
      JSON.stringify(turn.intent),
    ])
    await connection.execute(TOUCH_CONVERSATION, [conversationId])
  }
}

/** 默认实例：连接池来自 src/config/database.ts */
export const assistantRepository = new AssistantRepository(pool)
