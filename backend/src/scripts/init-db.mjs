/**
 * 数据库初始化脚本
 * ----------------------------------------------------------------------------
 * 作用：
 *   1. 目标库不存在时自动创建（字符集 utf8mb4）
 *   2. 依次执行 sql/schema.sql、sql/orders.sql 建表（CREATE TABLE IF NOT EXISTS，可重复执行）
 *   3. 执行 sql/search-index.sql 补全文索引（先查 information_schema，已存在就跳过）
 *   4. products 为空时执行 sql/seed.sql 灌种子数据（避免重复插入图片）
 *
 * 用法：
 *   npm run db:init
 *   node src/scripts/init-db.mjs
 *
 * 依赖 backend/.env 里的 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME。
 * 目录关系：本文件在 src/scripts/，SQL 在 src/sql/，.env 在 backend/ 根目录。
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createConnection } from 'mysql2/promise'
import { config as loadDotenv } from 'dotenv'

const scriptsDir = import.meta.dirname
const backendDir = join(scriptsDir, '..', '..')
const sqlDir = join(scriptsDir, '..', 'sql')

loadDotenv({ path: join(backendDir, '.env'), quiet: true })

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = '',
} = process.env

if (!DB_NAME) {
  console.error('❌ 缺少 DB_NAME，请参考 backend/.env.example 配置 backend/.env')
  process.exit(1)
}

// 库名要拼进 DDL，先校验字符集，避免注入
if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) {
  console.error(`❌ DB_NAME 只能包含字母、数字、下划线，当前值：${DB_NAME}`)
  process.exit(1)
}

const TABLES = [
  'users',
  'categories',
  'products',
  'product_images',
  'cart_items',
  'orders',
  'order_items',
  'payments',
]

/**
 * 建表与索引脚本按模块拆分，执行顺序固定：
 *   schema.sql       用户 / 商品 / 购物车 / 评价 / 收藏
 *   orders.sql       订单 / 订单明细 / 支付
 *   search-index.sql 商品名 + 昵称的 ngram 全文索引（幂等，已存在则跳过）
 * 三个脚本都可以重复执行。
 */
const SCHEMA_FILES = ['schema.sql', 'orders.sql', 'search-index.sql']

const baseConfig = {
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  charset: 'utf8mb4',
}

console.log(`→ 目标数据库：${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`)

// 1) 确保库存在（不指定 database 连接）
const bootstrap = await createConnection(baseConfig)
try {
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`,
  )
  console.log(`✔ 数据库 ${DB_NAME} 已就绪`)
} finally {
  await bootstrap.end()
}

// 2) 连接目标库执行脚本
const connection = await createConnection({
  ...baseConfig,
  database: DB_NAME,
  multipleStatements: true,
})

async function runSqlFile(fileName) {
  const sql = await readFile(join(sqlDir, fileName), 'utf8')
  await connection.query(sql)
  console.log(`✔ 已执行 sql/${fileName}`)
}

try {
  for (const file of SCHEMA_FILES) {
    await runSqlFile(file)
  }

  const [productRows] = await connection.query('SELECT COUNT(*) AS count FROM products')
  const productCount = Number(productRows[0].count)
  if (productCount === 0) {
    await runSqlFile('seed.sql')
    console.log('✔ 已写入种子数据')
  } else {
    console.log(`ℹ products 已有 ${productCount} 行，跳过 seed.sql（避免重复数据）`)
  }

  console.log('→ 各表行数：')
  for (const table of TABLES) {
    const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``)
    console.log(`   ${table.padEnd(15)} ${rows[0].count}`)
  }

  console.log('✅ 数据库初始化完成')
} catch (error) {
  console.error('❌ 初始化失败：', error.message)
  process.exitCode = 1
} finally {
  await connection.end()
}
