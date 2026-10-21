/**
 * 重置演示账号密码（开发辅助脚本）
 * ----------------------------------------------------------------------------
 * 背景：src/sql/seed.sql 里 6 个演示卖家（id 1~6）的 password_hash 是 BCrypt 占位串，
 *       明文没人知道，所以登录接口对它们必然返回「邮箱或密码不正确」。
 *       想用 seller1@example.com 登录看「我的商品 / 我的订单」，就得先把哈希换掉。
 *
 * 用法（在 backend/ 目录下）：
 *   npm run db:passwords               # 重置为 123456
 *   npm run db:passwords -- 我的密码    # 重置为自定义密码（至少 6 位）
 *
 * 安全边界：
 *   - 只改「不是 scrypt 哈希」的行，也就是从没通过注册接口创建过的账号；
 *     你自己注册的账号密码不会被覆盖；
 *   - 只更新 password_hash，不动昵称/邮箱/状态，商品/订单/购物车一律不受影响。
 */
import type { RowDataPacket } from 'mysql2/promise'
import { closePool, pool } from '../config/database'
import { hashPassword, isScryptHash } from '../utils/password'

const DEFAULT_PASSWORD = '123456'
const MIN_PASSWORD_LENGTH = 6

interface UserRow extends RowDataPacket {
  id: number
  nickname: string
  email: string | null
  password_hash: string
}

async function main(): Promise<void> {
  const password = process.argv[2] ?? DEFAULT_PASSWORD
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`密码至少 ${MIN_PASSWORD_LENGTH} 位，当前传入 "${password}"`)
  }

  const [rows] = await pool.execute<UserRow[]>(
    'SELECT id, nickname, email, password_hash FROM users ORDER BY id',
  )
  const targets = rows.filter((row) => !isScryptHash(row.password_hash))

  if (targets.length === 0) {
    console.log('没有需要重置的账号：所有用户的密码都已经是 scrypt 哈希。')
    return
  }

  for (const user of targets) {
    const hash = await hashPassword(password)
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id])
    console.log(`✅ 已重置 ${user.email ?? `用户 ${user.id}`}（${user.nickname}）的密码`)
  }

  console.log(`\n共重置 ${targets.length} 个账号，密码统一为：${password}`)
  console.log('提示：这只影响密码，其它数据（商品 / 订单 / 购物车 / 收藏）没有任何改动。')
}

main()
  .catch((error: unknown) => {
    console.error('重置失败：', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => closePool())
