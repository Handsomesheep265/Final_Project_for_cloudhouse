/**
 * 认证服务层（Service）
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. 注册 —— 校验邮箱/密码/昵称，查重，加盐哈希后入库；
 *   2. 登录 —— 按邮箱取用户，校验密码，检查账号状态，签发 JWT；
 *   3. 当前用户 —— /api/auth/me 用，把 token 里的 userId 换成最新资料。
 *
 * 不负责：SQL（repositories）、HTTP 状态码与响应包装（controllers）、
 *         密码算法（utils/password）、token 格式（utils/token）。
 *
 * 两个刻意的设计：
 *   - 登录失败一律 40101「邮箱或密码不正确」，不区分「邮箱不存在」和「密码错」，
 *     避免被用来枚举站内注册过的邮箱；
 *   - 邮箱不存在时也跑一次哈希计算，让两条分支的耗时接近，避免时序差异泄露账号是否存在。
 */
import { authRepository, AuthRepository } from '../repositories/authRepositories'
import type { AuthUserEntity, NewUserEntity } from '../types/auth.entity'
import type { LoginDTO, RegisterDTO } from '../types/auth.dto'
import type { AuthSessionVO, AuthUserVO } from '../types/auth.vo'
import { hashPassword, verifyPassword } from '../utils/password'
import { signToken } from '../utils/token'

/* ============================== 业务错误 ============================== */

/**
 * 错误码分段（与购物车 / 订单 / 个人主页错开）：
 *   400xx 参数问题   401xx 未登录/凭证错误   403xx 无权限   409xx 冲突
 *
 * 注意 40020~40022 留给认证模块，新增前先全局搜一下 code: 4002 别撞号。
 */
const AUTH_ERROR_SPECS = {
  invalidEmail: { code: 40020, httpStatus: 400, message: '邮箱格式不正确' },
  invalidPassword: { code: 40021, httpStatus: 400, message: '密码不合法' },
  invalidNickname: { code: 40022, httpStatus: 400, message: '昵称不合法' },
  badCredentials: { code: 40101, httpStatus: 401, message: '邮箱或密码不正确' },
  unauthorized: { code: 40102, httpStatus: 401, message: '请先登录' },
  accountDisabled: { code: 40301, httpStatus: 403, message: '账号已被禁用，请联系管理员' },
  emailTaken: { code: 40920, httpStatus: 409, message: '该邮箱已被注册' },
} as const

export type AuthErrorSpec = (typeof AUTH_ERROR_SPECS)[keyof typeof AUTH_ERROR_SPECS]

/** 认证业务异常：带业务码与建议的 HTTP 状态码，由统一错误中间件转换 */
export class AuthError extends Error {
  readonly code: number
  readonly httpStatus: number

  constructor(spec: AuthErrorSpec, detail?: string) {
    super(detail ?? spec.message)
    this.name = 'AuthError'
    this.code = spec.code
    this.httpStatus = spec.httpStatus
  }
}

/** 供 controller / 脚本 / 测试引用错误码 */
export const AUTH_ERRORS = AUTH_ERROR_SPECS

/* ============================== 常量与工具 ============================== */

const EMAIL_MAX = 100
const NICKNAME_MAX = 50
const PASSWORD_MIN = 6
const PASSWORD_MAX = 64

/** 不用 RFC 5322 全量正则：登录/注册场景只需要挡住明显不是邮箱的输入 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 演示账号的占位密码哈希（seed.sql 里的 bcrypt 串），只用来在日志里给提示 */
const BCRYPT_PREFIX = '$2'

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** 邮箱：去空白 + 转小写（与 MySQL 的大小写不敏感比较保持一致） */
function normalizeEmail(raw: unknown): string {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (email.length === 0) {
    throw new AuthError(AUTH_ERROR_SPECS.invalidEmail, '邮箱不能为空')
  }
  if (email.length > EMAIL_MAX) {
    throw new AuthError(AUTH_ERROR_SPECS.invalidEmail, `邮箱不能超过 ${EMAIL_MAX} 个字符`)
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new AuthError(AUTH_ERROR_SPECS.invalidEmail)
  }
  return email
}

/**
 * 密码：不 trim —— 首尾空格也是密码的一部分，trim 会让「a b」和「ab」变成同一个密码。
 * 但纯空白仍然拒绝，那是明显的误输入。
 */
function normalizePassword(raw: unknown): string {
  const password = typeof raw === 'string' ? raw : ''
  if (password.length === 0) {
    throw new AuthError(AUTH_ERROR_SPECS.invalidPassword, '密码不能为空')
  }
  if (password.trim().length === 0) {
    throw new AuthError(AUTH_ERROR_SPECS.invalidPassword, '密码不能全是空格')
  }
  if (password.length < PASSWORD_MIN) {
    throw new AuthError(AUTH_ERROR_SPECS.invalidPassword, `密码至少 ${PASSWORD_MIN} 位`)
  }
  if (password.length > PASSWORD_MAX) {
    throw new AuthError(AUTH_ERROR_SPECS.invalidPassword, `密码不能超过 ${PASSWORD_MAX} 位`)
  }
  return password
}

/** 昵称：不传就用邮箱前缀（注册表单只填邮箱密码也能用），最长 50 字符 */
function normalizeNickname(raw: unknown, email: string): string {
  const nickname = typeof raw === 'string' ? raw.trim() : ''
  if (nickname.length === 0) {
    return email.slice(0, email.indexOf('@')).slice(0, NICKNAME_MAX) || '手帐同好'
  }
  if (nickname.length > NICKNAME_MAX) {
    throw new AuthError(AUTH_ERROR_SPECS.invalidNickname, `昵称不能超过 ${NICKNAME_MAX} 个字符`)
  }
  return nickname
}

/** MySQL 唯一键冲突（并发注册同一邮箱时靠它兜底） */
function isDuplicateEntry(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  return code === 'ER_DUP_ENTRY' || code === 'ER_DUP_KEY'
}

function toAuthUserVO(entity: AuthUserEntity): AuthUserVO {
  return {
    id: entity.id,
    nickname: entity.nickname,
    email: entity.email ?? '',
    avatarUrl: entity.avatarUrl,
    bio: entity.bio,
    joinedAt: entity.createdAt.toISOString(),
  }
}

/** 组会话：签 token + 带上用户资料，注册和登录共用 */
function buildSession(entity: AuthUserEntity): AuthSessionVO {
  const { token, expiresAt } = signToken(entity.id)
  return {
    token,
    tokenType: 'Bearer',
    expiresAt: expiresAt.toISOString(),
    user: toAuthUserVO(entity),
  }
}

/* ============================== 服务实现 ============================== */

export class AuthService {
  constructor(private readonly repo: AuthRepository) {}

  /**
   * 注册
   * ------------------------------------------------------------------
   * 1. 校验三件套（邮箱格式、密码长度、昵称长度）；
   * 2. 先查一次邮箱是否占用，给出友好的 40920（并发场景由唯一索引兜底）；
   * 3. 加盐哈希后入库，随即签发 token —— 注册完直接就是登录状态，前端不用再登一次。
   */
  async register(dto: RegisterDTO): Promise<AuthSessionVO> {
    const email = normalizeEmail(dto.email)
    const password = normalizePassword(dto.password)
    const nickname = normalizeNickname(dto.nickname, email)

    const existing = await this.repo.findByEmail(email)
    if (existing) {
      throw new AuthError(AUTH_ERROR_SPECS.emailTaken)
    }

    const passwordHash = await hashPassword(password)
    const newUser: NewUserEntity = { nickname, email, passwordHash }

    let userId: number
    try {
      userId = await this.repo.insertUser(newUser)
    } catch (error) {
      // 两个请求同时注册同一邮箱：谁后落库谁撞唯一索引
      if (isDuplicateEntry(error)) {
        throw new AuthError(AUTH_ERROR_SPECS.emailTaken)
      }
      throw error
    }

    const created = await this.repo.findById(userId)
    if (!created) {
      throw new AuthError(AUTH_ERROR_SPECS.unauthorized, '注册成功但未能读取账号，请稍后重试')
    }
    return buildSession(created)
  }

  /**
   * 登录
   * ------------------------------------------------------------------
   * 顺序有讲究：先校验密码，再看 status。
   * 如果先判 status，输入任意密码都能试出「这个账号存在且被禁用」，等于泄露账号存在性。
   */
  async login(dto: LoginDTO): Promise<AuthSessionVO> {
    const email = normalizeEmail(dto.email)
    const password = normalizePassword(dto.password)

    const user = await this.repo.findByEmail(email)
    if (!user) {
      // 邮箱不存在也做一次同等代价的哈希，抹平与「密码错」分支的耗时差异
      await hashPassword(password)
      throw new AuthError(AUTH_ERROR_SPECS.badCredentials)
    }

    const matched = await verifyPassword(password, user.passwordHash)
    if (!matched) {
      if (user.passwordHash.startsWith(BCRYPT_PREFIX)) {
        console.warn(
          `[auth] 用户 ${user.id}（${user.email}）的密码仍是 seed.sql 里的 BCrypt 占位串，无法登录；` +
            '执行 npm run db:passwords 可重置为统一演示密码',
        )
      }
      throw new AuthError(AUTH_ERROR_SPECS.badCredentials)
    }

    if (user.status !== 1) {
      throw new AuthError(AUTH_ERROR_SPECS.accountDisabled)
    }

    return buildSession(user)
  }

  /**
   * 当前登录用户（GET /api/auth/me）
   * token 只带 userId，资料每次现查：改了昵称/头像后旧 token 也能拿到新资料。
   */
  async getCurrentUser(userId: number): Promise<AuthUserVO> {
    if (!isPositiveInteger(userId)) {
      throw new AuthError(AUTH_ERROR_SPECS.unauthorized)
    }

    const user = await this.repo.findById(userId)
    if (!user || user.status !== 1) {
      // token 里的用户被删/被禁用：当作登录失效，让前端清掉本地 token 重新登录
      throw new AuthError(AUTH_ERROR_SPECS.unauthorized, '登录状态已失效，请重新登录')
    }

    return toAuthUserVO(user)
  }
}

/** 默认实例：仓储层用 src/config/database.ts 的连接池；单元测试可 new AuthService(fakeRepo) */
export const authService: AuthService = new AuthService(authRepository)
