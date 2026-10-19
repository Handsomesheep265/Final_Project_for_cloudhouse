/**
 * MySQL 连接池
 * ----------------------------------------------------------------------------
 * 配置来自 src/config/env.ts（那里负责加载 .env 并校验环境变量），
 * 其它模块统一通过 pool 访问数据库。
 */
import { createPool } from 'mysql2/promise'
import type { Pool } from 'mysql2/promise'
import { env } from './env'

export const pool: Pool = createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  // 中文与 emoji 都靠 utf8mb4
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: env.db.poolSize,
  queueLimit: 0,
  // DECIMAL(10,2) 直接返回 number：金额量级远小于 2^53，这里换取调用方便利
  decimalNumbers: true,
  // 让 UPDATE 的 affectedRows 统计“匹配到的行”，仓储层才能用它判断记录是否存在
  flags: ['FOUND_ROWS'],
})

/** 探活：启动时与 /health 都会用它 */
export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}

/** 优雅关闭：进程退出前释放连接池 */
export async function closePool(): Promise<void> {
  await pool.end()
}
