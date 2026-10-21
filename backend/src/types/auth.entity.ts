/**
 * 认证模块 · 实体（Entity）
 * ----------------------------------------------------------------------------
 * 表结构沿用 docs/DATABASE_DESIGN.md 里的 users，没有新增字段、没有新增表：
 *   id / nickname / email / password_hash / avatar_url / bio / status / created_at
 *
 * ⚠️ 和其它模块最大的区别：这里的实体带 passwordHash。
 *    它只在 authService 内部用于校验密码，绝不进 VO、不写日志、不进响应体。
 *    其它模块要读用户资料请走 profileRepositories（那边的查询刻意不带这一列）。
 */

/** users 表的一行（含密码哈希，仅认证模块使用） */
export interface AuthUserEntity {
  id: number
  nickname: string
  /** 邮箱：注册时必填，历史演示数据可能有 null */
  email: string | null
  /** scrypt 哈希串；也可能是历史遗留的 bcrypt 占位串（校验必然失败） */
  passwordHash: string
  avatarUrl: string | null
  bio: string | null
  /** 1 正常，0 禁用 */
  status: number
  createdAt: Date
}

/** 新注册用户要写入的字段（其余列由数据库默认值兜住） */
export interface NewUserEntity {
  nickname: string
  /** 已规范化为小写、去空白 */
  email: string
  passwordHash: string
}
