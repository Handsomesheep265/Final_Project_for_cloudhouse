/**
 * 认证服务层（Service）
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. 注册 —— 校验邮箱/密码/昵称，查重，加盐哈希后入库；
 *   2. 登录 —— 按邮箱取用户，校验密码，检查账号状态，签发 JWT；
 *   3. 当前会话 —— /api/auth/me 用，顺带续签 token；
 *   4. 退出登录 —— 把当前 token 的指纹写进黑名单（JWT 无状态，必须靠服务端记住）；
 *   5. 找回密码 —— 发一次性重置链接；用链接里的令牌改密码，并让此前所有 token 失效。
 *
 * 不负责：SQL（repositories）、HTTP 状态码与响应包装（controllers）、
 *         密码算法（utils/password）、token 格式（utils/token）、发信（mailService）。
 *
 * 三个刻意的设计：
 *   - 登录失败一律 40101「邮箱或密码不正确」，不区分「邮箱不存在」和「密码错」，
 *     避免被用来枚举站内注册过的邮箱；
 *   - 邮箱不存在时也跑一次哈希计算，让两条分支的耗时接近，避免时序差异泄露账号是否存在；
 *   - 找回密码接口对「邮箱是否存在」返回同一句 accepted=true，同理防枚举。
 */
import { randomBytes } from 'node:crypto'
import { env } from '../config/env'
import { authRepository, AuthRepository } from '../repositories/authRepositories'
import { isDevMailMode, mailService } from './mailService'
import type { AuthUserEntity, NewUserEntity } from '../types/auth.entity'
import type { ForgotPasswordDTO, LoginDTO, RegisterDTO, ResetPasswordDTO } from '../types/auth.dto'
import type {
  AuthSessionVO,
  AuthUserVO,
  ForgotPasswordResultVO,
  ResetPasswordResultVO,
} from '../types/auth.vo'
import { hashPassword, verifyPassword } from '../utils/password'
import { hashToken, signToken } from '../utils/token'

/* ============================== 业务错误 ============================== */

/**
 * 错误码分段（与购物车 / 订单 / 个人主页错开）：
 *   400xx 参数问题   401xx 未登录/凭证错误   403xx 无权限   409xx 冲突
 *
 * 注意 40020~40024 留给认证模块，新增前先全局搜一下 code: 4002 别撞号。
 */
const AUTH_ERROR_SPECS = {
  invalidEmail: { code: 40020, httpStatus: 400, message: '邮箱格式不正确' },
  invalidPassword: { code: 40021, httpStatus: 400, message: '密码不合法' },
  invalidNickname: { code: 40022, httpStatus: 400, message: '昵称不合法' },
  invalidResetToken: { code: 40023, httpStatus: 400, message: '重置链接无效或已过期' },
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
/** 32 字节随机数转 base64url 后是 43 个字符；低于这个长度必然是瞎编的 */
const RESET_TOKEN_MIN_LENGTH = 20

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
   * 当前会话（GET /api/auth/me）
   * ------------------------------------------------------------------
   * 返回的是「新会话」而不是单个用户对象：每次带着旧 token 来确认身份，
   * 都会重新签一个 token 并把有效期往后推（滑动续期）。
   * 效果就是「只要 7 天内打开过应用，就一直不用重新登录」。
   *
   * 续期的同时会把**刚出示的旧 token** 加进黑名单（凭证轮换）：
   * 这样同一台设备任意时刻只有一个有效凭证，退出登录时把它拉黑就够了，
   * 不会留下「以前签发、还没过期」的可用旧 token。
   */
  async getSession(
    userId: number,
    presented?: { token: string; expiresAt: Date },
  ): Promise<AuthSessionVO> {
    if (!isPositiveInteger(userId)) {
      throw new AuthError(AUTH_ERROR_SPECS.unauthorized)
    }

    const user = await this.repo.findById(userId)
    if (!user || user.status !== 1) {
      // token 里的用户被删/被禁用：当作登录失效，让前端清掉本地 token 重新登录
      throw new AuthError(AUTH_ERROR_SPECS.unauthorized, '登录状态已失效，请重新登录')
    }

    const session = buildSession(user)

    if (presented) {
      try {
        await this.repo.revokeToken(hashToken(presented.token), user.id, presented.expiresAt)
      } catch (error) {
        // 轮换失败不该让用户登不进来：记日志，旧 token 继续有效到过期
        console.error('[auth] 续期时作废旧 token 失败：', error)
      }
    }

    return session
  }

  /**
   * 退出登录（POST /api/auth/logout）
   * ------------------------------------------------------------------
   * 把当前 token 的指纹写进黑名单。前端同时会删掉本地 token，
   * 但「服务端记住这条 token 已作废」才是关键：JWT 是无状态的，
   * 不记黑名单的话，登出后旧 token 在有效期内依然能调接口。
   */
  async logout(userId: number, token: string, expiresAt: Date): Promise<void> {
    if (!isPositiveInteger(userId) || token.length === 0) {
      throw new AuthError(AUTH_ERROR_SPECS.unauthorized)
    }

    await this.repo.revokeToken(hashToken(token), userId, expiresAt)
  }

  /**
   * 申请重置密码（POST /api/auth/forgot-password）
   * ------------------------------------------------------------------
   * 无论邮箱是否注册过都返回同一句 accepted=true（防账号枚举）；
   * 只有确实存在且状态正常的账号才生成令牌、发邮件。
   * 重新申请时会把该用户此前没用的链接全部作废，只保留最新一封。
   */
  async requestPasswordReset(dto: ForgotPasswordDTO): Promise<ForgotPasswordResultVO> {
    const email = normalizeEmail(dto.email)
    const expiresInMinutes = env.auth.resetTtlMinutes
    const result: ForgotPasswordResultVO = { accepted: true, expiresInMinutes, devResetUrl: null }

    const user = await this.repo.findByEmail(email)
    if (!user || user.status !== 1) {
      // 邮箱不存在 / 账号被禁用：静默返回，不给攻击者「这个邮箱存在」的信号
      return result
    }

    await this.repo.invalidatePasswordResetTokens(user.id)

    // 32 字节随机量做令牌：足够长，且只把 SHA-256 指纹存库（库泄露也拿不到可用令牌）
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000)
    await this.repo.createPasswordResetToken(user.id, hashToken(token), expiresAt)

    const resetUrl = `${env.auth.webOrigin}/reset-password?token=${encodeURIComponent(token)}`
    await mailService.sendPasswordReset({
      to: user.email ?? email,
      nickname: user.nickname,
      resetUrl,
      expiresInMinutes,
    })

    // 本地没配 SMTP：非生产环境把链接直接回给前端，界面才能走通
    if (isDevMailMode) {
      result.devResetUrl = resetUrl
    }
    return result
  }

  /**
   * 用一次性令牌重置密码（POST /api/auth/reset-password）
   * ------------------------------------------------------------------
   * 成功后做两件事：
   *   1. 令牌标记为已用（一次性，重复点击 / 链接被转发都无效）；
   *   2. 把用户的「凭证时间线」推到当前时间 —— 之前签发的所有 token 立刻失效，
   *      即「改完密码所有设备都要重新登录」。
   * 这一步同时解决「密码泄露后旧会话还在」的问题，也是找回密码该有的语义。
   */
  async resetPassword(dto: ResetPasswordDTO): Promise<ResetPasswordResultVO> {
    const token = typeof dto.token === 'string' ? dto.token.trim() : ''
    if (token.length < RESET_TOKEN_MIN_LENGTH) {
      throw new AuthError(AUTH_ERROR_SPECS.invalidResetToken)
    }
    const password = normalizePassword(dto.password)

    const record = await this.repo.findPasswordResetToken(hashToken(token))
    if (!record || record.usedAt !== null || record.expiresAt.getTime() <= Date.now()) {
      throw new AuthError(AUTH_ERROR_SPECS.invalidResetToken)
    }

    // 先抢占令牌：并发两个请求只有一个能成功，避免同一链接改两次密码
    const consumed = await this.repo.consumePasswordResetToken(record.id)
    if (!consumed) {
      throw new AuthError(AUTH_ERROR_SPECS.invalidResetToken)
    }

    const user = await this.repo.findById(record.userId)
    if (!user || user.status !== 1) {
      throw new AuthError(AUTH_ERROR_SPECS.invalidResetToken)
    }

    await this.repo.updatePasswordHash(user.id, await hashPassword(password))
    // 让此前所有 token 失效（含其它设备 / 其它标签页）
    await this.repo.setTokenValidAfter(user.id, new Date())
    // 剩下的未使用链接也一并作废
    await this.repo.invalidatePasswordResetTokens(user.id)

    return { reset: true }
  }
}

/** 默认实例：仓储层用 src/config/database.ts 的连接池；单元测试可 new AuthService(fakeRepo) */
export const authService: AuthService = new AuthService(authRepository)
