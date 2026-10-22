/**
 * 登录凭证（HS256 JWT）
 * ----------------------------------------------------------------------------
 * 为什么手写而不是引 jsonwebtoken：
 *   JWT 的 HS256 就是「base64url(header).base64url(payload) + HMAC-SHA256 签名」，
 *   30 行能写完；本项目后端刻意保持「零额外依赖」，npm 镜像不通时也能跑。
 *   以后要换成 jsonwebtoken / jose，只要保持 signToken / verifyToken 的签名不变即可。
 *
 * 载荷只放四样：
 *   sub  用户 ID（业务数据一律不给 token，避免改资料后旧 token 里的昵称过期）
 *   iat  签发时间（秒）
 *   exp  过期时间（秒）
 *   jti  唯一随机串：保证「同一秒内签发的两个 token 也不一样」。
 *        没有它的话，登出后马上重新登录会得到与旧 token 完全相同的串（签名是确定的），
 *        于是刚拿到的新 token 立刻命中黑名单，用户会莫名其妙又被登出。
 *
 * 前端用法：请求头 `Authorization: Bearer <token>`。
 * 服务端校验见 src/middlewares/auth.ts；过期/被篡改都会返回 40102。
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env'

/** 固定头部：只支持 HS256，收到别的 alg 直接拒绝（防 alg=none 类攻击） */
const HEADER_JSON = JSON.stringify({ alg: 'HS256', typ: 'JWT' })
const HEADER_BASE64URL = Buffer.from(HEADER_JSON, 'utf8').toString('base64url')

/** JWT 载荷 */
export interface TokenClaims {
  /** 用户 ID */
  sub: number
  /** 签发时间（秒级时间戳） */
  iat: number
  /** 过期时间（秒级时间戳） */
  exp: number
  /** 唯一标识，保证同一秒签发的 token 也不相同 */
  jti: string
}

/** 签发结果：token 给前端，expiresAt 给前端做「快要过期」的提示 */
export interface IssuedToken {
  token: string
  expiresAt: Date
}

/** 校验失败的原因（只写服务端日志，不告诉客户端细节） */
export type TokenFailure = 'malformed' | 'expired' | 'bad-signature' | 'bad-claims'

export type TokenVerification =
  | { ok: true; userId: number; issuedAt: Date; expiresAt: Date }
  | { ok: false; reason: TokenFailure }

function sign(unsigned: string): string {
  return createHmac('sha256', env.auth.jwtSecret).update(unsigned).digest('base64url')
}

/**
 * token 指纹。
 * 退出登录 / 重置密码时要把「这个 token」记进黑名单，但数据库里不该存 token 原文
 * （一旦库被看到，等于拿到别人的登录凭证）。用 SHA-256 存指纹即可：
 * 校验时算一次指纹去比对，原文永远只存在于客户端。
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** 签发 token；now 可注入，方便测试过期逻辑 */
export function signToken(userId: number, now: number = Date.now()): IssuedToken {
  const issuedAt = Math.floor(now / 1000)
  const expiresAt = issuedAt + env.auth.tokenTtlSeconds
  const claims: TokenClaims = {
    sub: userId,
    iat: issuedAt,
    exp: expiresAt,
    // 16 字节随机量足够避免碰撞；同一秒多次登录 / 续期也各是各的 token
    jti: randomBytes(16).toString('base64url'),
  }
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  const unsigned = `${HEADER_BASE64URL}.${payload}`

  return {
    token: `${unsigned}.${sign(unsigned)}`,
    expiresAt: new Date(expiresAt * 1000),
  }
}

/**
 * 校验 token。
 * 不抛错：任何异常都收敛成 { ok: false, reason }，
 * 让中间件只决定「认不认这个用户」，不用套 try/catch。
 */
export function verifyToken(token: string, now: number = Date.now()): TokenVerification {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }

  const headerPart = parts[0]
  const payloadPart = parts[1]
  const signaturePart = parts[2]
  if (!headerPart || !payloadPart || !signaturePart) return { ok: false, reason: 'malformed' }
  // 头部必须完全一致：alg 必须是 HS256
  if (headerPart !== HEADER_BASE64URL) return { ok: false, reason: 'malformed' }

  // 先验签，再解析载荷：不信任任何未经验签的内容
  const expected = Buffer.from(sign(`${headerPart}.${payloadPart}`), 'base64url')
  const given = Buffer.from(signaturePart, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad-signature' }
  }

  let claims: unknown
  try {
    claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'bad-claims' }
  }

  if (typeof claims !== 'object' || claims === null) return { ok: false, reason: 'bad-claims' }
  const { sub, exp } = claims as Partial<TokenClaims>
  if (
    typeof sub !== 'number' || !Number.isInteger(sub) || sub <= 0 ||
    typeof exp !== 'number' || !Number.isInteger(exp)
  ) {
    return { ok: false, reason: 'bad-claims' }
  }

  if (exp * 1000 <= now) return { ok: false, reason: 'expired' }

  // iat 在签名内，可信；重置密码时用它判断「这个 token 是不是重置之前签的」
  const { iat } = claims as Partial<TokenClaims>
  const issuedAt = typeof iat === 'number' && Number.isInteger(iat) ? iat : exp

  return { ok: true, userId: sub, issuedAt: new Date(issuedAt * 1000), expiresAt: new Date(exp * 1000) }
}
