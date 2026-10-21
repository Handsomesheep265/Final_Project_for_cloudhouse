/**
 * 密码哈希（scrypt）
 * ----------------------------------------------------------------------------
 * 为什么用 node:crypto 的 scrypt 而不是 bcrypt：
 *   1. scrypt 与 bcrypt 同属「加盐 + 慢哈希」，能抵抗彩虹表与离线暴力破解；
 *   2. 它是 Node 内置模块，零依赖 —— 本项目后端目前只有 express / mysql2 / cors，
 *      为一个哈希函数引入原生模块（node-gyp 编译）不划算，也容易在 Windows 上装崩；
 *   3. 算法参数写进哈希串里，以后调高成本不用改表结构。
 *
 * 存储格式（$ 分隔，正好 6 段）：
 *     scrypt$<N>$<r>$<p>$<salt 的 hex>$<derivedKey 的 hex>
 * 例：scrypt$16384$8$1$3f2c...$9a1b...
 *
 * ⚠️ users 表里 id 1~6 的演示账号还是 bcrypt 占位串（$2a$10$...，明文未知），
 *    本项目不校验它；需要登录演示账号请执行 npm run db:passwords 重置成新哈希。
 *    见 src/scripts/reset-demo-passwords.ts。
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import type { ScryptOptions } from 'node:crypto'

/** 成本参数：N=2^14 时单次哈希约 16MB 内存、几十毫秒，够挡住离线爆破又不拖慢登录 */
const COST_N = 16_384
const BLOCK_SIZE_R = 8
const PARALLELIZATION_P = 1
/** 派生密钥长度（字节） */
const KEY_LENGTH = 64
/** 盐长度（字节） */
const SALT_LENGTH = 16

const ALGORITHM = 'scrypt'
/** 串里出现的合法上限，防止有人塞个 N=2^30 的哈希把进程内存打爆 */
const MAX_COST_N = 1 << 20
const MAX_BLOCK_SIZE_R = 32
const MAX_PARALLELIZATION_P = 16

const HASH_PATTERN = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([0-9a-f]+)\$([0-9a-f]+)$/

function scryptAsync(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, options, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

/**
 * 生成哈希。
 * scrypt 是 CPU 密集操作，这里用异步实现（libuv 线程池），
 * 同一个进程里的其它请求不会被一个登录请求卡住。
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derivedKey = await scryptAsync(password, salt, {
    N: COST_N,
    r: BLOCK_SIZE_R,
    p: PARALLELIZATION_P,
    // 默认 maxmem 是 32MB，128 * N * r 正好 16MB，显式写出来免得以后调参数时踩线
    maxmem: 128 * COST_N * BLOCK_SIZE_R * 2,
  })

  return [
    ALGORITHM,
    COST_N,
    BLOCK_SIZE_R,
    PARALLELIZATION_P,
    salt.toString('hex'),
    derivedKey.toString('hex'),
  ].join('$')
}

/** 是否是本模块生成的哈希（用来区分演示数据的 bcrypt 占位串） */
export function isScryptHash(stored: string): boolean {
  return stored.startsWith(`${ALGORITHM}$`)
}

/**
 * 校验密码。
 * - 哈希格式不认识（bcrypt 占位串、被截断的串等）一律返回 false，不抛错，
 *   由 service 决定对外怎么提示；
 * - 比较用 timingSafeEqual，避免按字节短路造成的时序侧信道。
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const matched = HASH_PATTERN.exec(stored)
  if (!matched) return false

  const [, rawN, rawR, rawP, saltHex, hashHex] = matched
  const N = Number(rawN)
  const r = Number(rawR)
  const p = Number(rawP)

  if (
    !Number.isInteger(N) || N < 2 || N > MAX_COST_N ||
    !Number.isInteger(r) || r < 1 || r > MAX_BLOCK_SIZE_R ||
    !Number.isInteger(p) || p < 1 || p > MAX_PARALLELIZATION_P ||
    !saltHex || !hashHex
  ) {
    return false
  }

  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false

  let actual: Buffer
  try {
    actual = await scryptAsync(password, salt, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    })
  } catch {
    // 参数极端（内存申请失败等）时按「密码不对」处理，不把内部错误抛给调用方
    return false
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
