/**
 * 认证仓储层（Repository）
 * ----------------------------------------------------------------------------
 * 只做数据访问：按邮箱 / ID 查用户、插入新用户、改密码哈希。
 * 业务规则（邮箱格式、密码强度、账号是否禁用、错误码）一律在 authService。
 *
 * 与 profileRepositories 的区别：
 *   那边的查询刻意不带 password_hash（个人主页永远不需要密码）；
 *   这里必须带，因为登录要校验。所以本文件是唯一「读得到密码哈希」的地方，
 *   调用方只能是 authService，绝不能把结果直接丢给 controller。
 *
 * 邮箱大小写：MySQL 的 utf8mb4_0900_ai_ci 排序规则本身不区分大小写，
 * 加上 service 统一转小写，'A@B.com' 和 'a@b.com' 会命中同一行。
 */
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { pool } from '../config/database'
import type { AuthUserEntity, NewUserEntity } from '../types/auth.entity'

/* ============================== SQL ============================== */

const AUTH_USER_COLUMNS = `
  id, nickname, email, password_hash, avatar_url, bio, status, created_at
`

const SELECT_BY_EMAIL = `
  SELECT ${AUTH_USER_COLUMNS}
  FROM users
  WHERE email = ?
  LIMIT 1
`

const SELECT_BY_ID = `
  SELECT ${AUTH_USER_COLUMNS}
  FROM users
  WHERE id = ?
  LIMIT 1
`

/**
 * 注册：status 不显式写，走表默认值 1（正常）。
 * email 上有 UNIQUE 索引，并发注册同一邮箱时第二个请求会拿到 ER_DUP_ENTRY，
 * 由 service 翻译成 40920「该邮箱已被注册」。
 */
const INSERT_USER = `
  INSERT INTO users (nickname, email, password_hash)
  VALUES (?, ?, ?)
`

const UPDATE_PASSWORD_HASH = `
  UPDATE users
  SET password_hash = ?
  WHERE id = ?
`

/* --------------------------- 登录态安全（黑名单 / 重置令牌） --------------------------- */

/**
 * 登出：把 token 指纹写进黑名单。
 * INSERT IGNORE：重复退出（多个标签页同时点）不会报唯一键冲突。
 */
const INSERT_REVOKED_TOKEN = `
  INSERT IGNORE INTO revoked_tokens (token_hash, user_id, expires_at)
  VALUES (?, ?, ?)
`

/** 顺手清理已过期的黑名单记录（token 自己都过期了，再留着没意义） */
const DELETE_EXPIRED_REVOKED_TOKENS = `
  DELETE FROM revoked_tokens
  WHERE expires_at < NOW()
`

/**
 * 判断 token 是否已被服务端作废：
 *   revoked > 0 —— 这条 token 本人被登出过（精确匹配指纹）；
 *   stale   > 0 —— 该用户重置过密码，签发时间早于时间线的 token 全部失效。
 */
const SELECT_TOKEN_REJECTED = `
  SELECT
    (SELECT COUNT(*) FROM revoked_tokens      WHERE token_hash = ?)                    AS revoked,
    (SELECT COUNT(*) FROM user_token_epochs   WHERE user_id = ? AND valid_after > ?)    AS stale
`

/** 重置密码后让该用户此前的所有 token 失效（只保留一行，覆盖写） */
const UPSERT_TOKEN_EPOCH = `
  INSERT INTO user_token_epochs (user_id, valid_after)
  VALUES (?, ?)
  ON DUPLICATE KEY UPDATE valid_after = VALUES(valid_after)
`

const INSERT_RESET_TOKEN = `
  INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
  VALUES (?, ?, ?)
`

const SELECT_RESET_TOKEN = `
  SELECT id, user_id, expires_at, used_at
  FROM password_reset_tokens
  WHERE token_hash = ?
  LIMIT 1
`

/** 一次性消费：只有没被用过的行才能改成已用，用 affectedRows 判断是否抢到 */
const CONSUME_RESET_TOKEN = `
  UPDATE password_reset_tokens
  SET used_at = NOW()
  WHERE id = ? AND used_at IS NULL
`

/** 发新链接时把该用户此前没用的链接全部作废（避免一堆有效链接满天飞） */
const INVALIDATE_RESET_TOKENS = `
  UPDATE password_reset_tokens
  SET used_at = NOW()
  WHERE user_id = ? AND used_at IS NULL
`

/* ============================ 行类型与映射 ============================ */

interface AuthUserRow extends RowDataPacket {
  id: number
  nickname: string
  email: string | null
  password_hash: string
  avatar_url: string | null
  bio: string | null
  status: number
  created_at: Date | string
}

interface TokenRejectedRow extends RowDataPacket {
  revoked: number | string
  stale: number | string
}

interface ResetTokenRow extends RowDataPacket {
  id: number
  user_id: number
  expires_at: Date | string
  used_at: Date | string | null
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function mapUserRow(row: AuthUserRow): AuthUserEntity {
  return {
    id: row.id,
    nickname: row.nickname,
    email: row.email,
    passwordHash: row.password_hash,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    status: row.status,
    createdAt: toDate(row.created_at),
  }
}

/* ============================== 仓储实现 ============================== */

export class AuthRepository {
  constructor(private readonly db: Pool) {}

  /** 登录用：按邮箱查（含密码哈希）；不存在返回 null */
  async findByEmail(email: string): Promise<AuthUserEntity | null> {
    const [rows] = await this.db.execute<AuthUserRow[]>(SELECT_BY_EMAIL, [email])
    const row = rows[0]
    return row ? mapUserRow(row) : null
  }

  /** 按 ID 查（签发 token 后回读一次，确认账号还在、没被禁用） */
  async findById(userId: number): Promise<AuthUserEntity | null> {
    const [rows] = await this.db.execute<AuthUserRow[]>(SELECT_BY_ID, [userId])
    const row = rows[0]
    return row ? mapUserRow(row) : null
  }

  /** 插入新用户，返回自增 ID */
  async insertUser(user: NewUserEntity): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(INSERT_USER, [
      user.nickname,
      user.email,
      user.passwordHash,
    ])
    return result.insertId
  }

  /**
   * 改密码哈希（找回密码 / 重置演示账号用）。
   * @returns 是否命中记录
   */
  async updatePasswordHash(userId: number, passwordHash: string): Promise<boolean> {
    const [result] = await this.db.execute<ResultSetHeader>(UPDATE_PASSWORD_HASH, [
      passwordHash,
      userId,
    ])
    return result.affectedRows > 0
  }

  /* ---------------------- 登出黑名单 / 凭证时间线 ---------------------- */

  /** 把某个 token 的指纹加入黑名单（登出时调用） */
  async revokeToken(tokenHash: string, userId: number, expiresAt: Date): Promise<void> {
    await this.db.execute(INSERT_REVOKED_TOKEN, [tokenHash, userId, expiresAt])
    // 顺手清理过期记录：这张表只用来挡「还没过期的旧 token」，过期行纯属垃圾
    await this.db.execute(DELETE_EXPIRED_REVOKED_TOKENS)
  }

  /** token 是否已被作废（黑名单命中，或早于用户的重置时间线） */
  async isTokenRejected(userId: number, tokenHash: string, issuedAt: Date): Promise<boolean> {
    const [rows] = await this.db.execute<TokenRejectedRow[]>(SELECT_TOKEN_REJECTED, [
      tokenHash,
      userId,
      issuedAt,
    ])
    const row = rows[0]
    return Number(row?.revoked ?? 0) > 0 || Number(row?.stale ?? 0) > 0
  }

  /** 重置密码后：让该用户此前签发的 token 全部失效 */
  async setTokenValidAfter(userId: number, validAfter: Date): Promise<void> {
    await this.db.execute(UPSERT_TOKEN_EPOCH, [userId, validAfter])
  }

  /* ---------------------------- 找回密码令牌 ---------------------------- */

  /** 写入一次性重置令牌（只存指纹） */
  async createPasswordResetToken(userId: number, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.execute(INSERT_RESET_TOKEN, [userId, tokenHash, expiresAt])
  }

  /** 按指纹查重置令牌；不存在返回 null（过期/已用在 service 里判断） */
  async findPasswordResetToken(tokenHash: string): Promise<{
    id: number
    userId: number
    expiresAt: Date
    usedAt: Date | null
  } | null> {
    const [rows] = await this.db.execute<ResetTokenRow[]>(SELECT_RESET_TOKEN, [tokenHash])
    const row = rows[0]
    if (!row) return null

    return {
      id: row.id,
      userId: row.user_id,
      expiresAt: toDate(row.expires_at),
      usedAt: row.used_at === null ? null : toDate(row.used_at),
    }
  }

  /** 消费令牌：并发下只有第一个请求能拿到 true */
  async consumePasswordResetToken(id: number): Promise<boolean> {
    const [result] = await this.db.execute<ResultSetHeader>(CONSUME_RESET_TOKEN, [id])
    return result.affectedRows > 0
  }

  /** 作废该用户所有未使用的重置令牌（重新申请时调用） */
  async invalidatePasswordResetTokens(userId: number): Promise<void> {
    await this.db.execute(INVALIDATE_RESET_TOKENS, [userId])
  }
}

/** 默认实例：连接池来自 src/config/database.ts；单元测试可 new AuthRepository(fakePool) */
export const authRepository: AuthRepository = new AuthRepository(pool)
