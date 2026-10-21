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
}

/** 默认实例：连接池来自 src/config/database.ts；单元测试可 new AuthRepository(fakePool) */
export const authRepository: AuthRepository = new AuthRepository(pool)
