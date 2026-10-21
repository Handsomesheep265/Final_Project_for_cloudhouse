/**
 * 环境变量集中解析
 * ----------------------------------------------------------------------------
 * 全项目只在这里读 process.env，并在这里加载 .env。
 *
 * 为什么单独一个模块：src/config/database.ts 在“模块初始化”时就会读数据库配置，
 * 如果靠在 index.ts 里按顺序写 import 'dotenv/config'，一旦有人调整 import 顺序，
 * .env 就可能晚于连接池创建而失效。让 database.ts 依赖本模块，
 * 加载顺序由模块依赖图保证，不依赖书写顺序。
 */
import { config as loadDotenv } from 'dotenv'

// 必须在下面任何 process.env 读取之前执行
// quiet: 关掉 dotenv 每次启动打印的「injected env (N) from .env」横幅
loadDotenv({ quiet: true })

function readString(key: string, fallback: string): string {
  const value = process.env[key]
  return value === undefined || value === '' ? fallback : value
}

/** 必填项：缺失时直接抛错，避免带着错配置跑起来 */
function readRequiredString(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`缺少环境变量 ${key}，请参考 backend/.env.example 创建 backend/.env`)
  }
  return value
}

function readInt(key: string, fallback: number): number {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`环境变量 ${key} 必须是正整数，当前值：${raw}`)
  }
  return parsed
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return fallback
  const normalized = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  throw new Error(`环境变量 ${key} 必须是 true / false，当前值：${raw}`)
}

export interface DatabaseEnv {
  host: string
  port: number
  user: string
  password: string
  database: string
  poolSize: number
}

export interface AuthEnv {
  /** JWT 签名密钥（HS256），生产环境必须显式配置 */
  jwtSecret: string
  /** 登录凭证有效期（秒） */
  tokenTtlSeconds: number
  /** 是否允许用 x-user-id 请求头冒充登录用户（仅本地联调，生产强制关闭） */
  allowDemoHeader: boolean
}

export interface AppEnv {
  nodeEnv: string
  isProduction: boolean
  /** HTTP 监听端口 */
  port: number
  /** 允许的跨域来源；null 表示不限制（开发环境默认） */
  corsOrigin: string | null
  db: DatabaseEnv
  auth: AuthEnv
}

const nodeEnv = readString('NODE_ENV', 'development')
const isProduction = nodeEnv === 'production'

/** 开发环境的默认密钥：只在本地用，生产环境没配 JWT_SECRET 会直接启动失败 */
const DEV_JWT_SECRET = 'journal-bazaar-dev-only-secret-change-me'
const MIN_JWT_SECRET_LENGTH = 32

function readJwtSecret(): string {
  if (!isProduction) {
    return readString('JWT_SECRET', DEV_JWT_SECRET)
  }
  const secret = readRequiredString('JWT_SECRET')
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `生产环境的 JWT_SECRET 至少需要 ${MIN_JWT_SECRET_LENGTH} 个字符，建议用 openssl rand -base64 48 生成`,
    )
  }
  return secret
}

export const env: AppEnv = {
  nodeEnv,
  isProduction,
  port: readInt('PORT', 3000),
  corsOrigin: readString('CORS_ORIGIN', '') || null,
  auth: {
    jwtSecret: readJwtSecret(),
    // 默认 7 天：课程项目不做刷新 token，过期就重新登录
    tokenTtlSeconds: readInt('AUTH_TOKEN_TTL_HOURS', 168) * 3600,
    // 生产环境一律关闭占位鉴权，避免任何人改个请求头就变成别人
    allowDemoHeader: readBool('AUTH_DEMO_HEADER', !isProduction),
  },
  db: {
    host: readString('DB_HOST', '127.0.0.1'),
    port: readInt('DB_PORT', 3306),
    user: readString('DB_USER', 'root'),
    password: readString('DB_PASSWORD', ''),
    database: readRequiredString('DB_NAME'),
    poolSize: readInt('DB_POOL_SIZE', 10),
  },
}
