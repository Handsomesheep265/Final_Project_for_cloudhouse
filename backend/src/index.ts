/**
 * 应用入口
 * ----------------------------------------------------------------------------
 * 装配顺序（顺序本身有语义，不要随意调整）：
 *   cors → express.json → 业务路由 → 404 兜底 → 错误中间件
 *
 * 错误中间件必须放在最后：它能接住 body 解析失败（发生在路由之前）和业务异常，
 * 统一输出 { code, message, data }。
 *
 * 优雅退出：收到 SIGINT/SIGTERM 后先停止接收新请求，再释放数据库连接池。
 */
import express from 'express'
import type { Express } from 'express'
import type { Server } from 'node:http'
import cors from 'cors'
import { env } from './config/env'
import { closePool, pingDatabase } from './config/database'
import { errorHandler } from './middlewares/errorHandler'
import { cartRouter } from './routes/cartRoutes'
import { orderRouter } from './routes/orderRoutes'
import type { ApiResponse } from './types/common'

/** 优雅退出最长等待时间，超时就强制结束，避免进程挂死 */
const SHUTDOWN_TIMEOUT_MS = 10_000

interface HealthData {
  status: 'ok'
  /** 数据库是否可用：进程活着不代表 DB 连得上 */
  db: 'ok' | 'error'
  uptime: number
}

/**
 * 停止接收新请求并释放连接池。
 * 单独导出是为了能被测试直接调用（Windows 上无法向内嵌进程投递 SIGTERM，
 * 只能靠进程内调用来验证这段逻辑）。
 */
export async function closeResources(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
  await closePool()
}

/** 组装 Express 应用（不监听端口，方便测试直接 import） */
export function createApp(): Express {
  const app = express()

  // 不暴露 Express 指纹
  app.disable('x-powered-by')

  // 跨域：默认放开（开发环境），生产用 CORS_ORIGIN 指定前端域名
  app.use(cors(env.corsOrigin ? { origin: env.corsOrigin } : undefined))
  app.use(express.json({ limit: '100kb' }))

  // 健康检查：进程活着就返回 200，数据库状态放在 data.db 里
  app.get('/health', async (_req, res) => {
    const dbReady = await pingDatabase()
    const data: HealthData = {
      status: 'ok',
      db: dbReady ? 'ok' : 'error',
      uptime: Math.round(process.uptime()),
    }
    const body: ApiResponse<HealthData> = { code: 0, message: 'ok', data }
    res.status(200).json(body)
  })

  // 业务路由
  app.use('/api/cart', cartRouter)
  app.use('/api/orders', orderRouter)

  // 未匹配到任何路由
  app.use((_req, res) => {
    const body: ApiResponse<null> = { code: 40400, message: '接口不存在', data: null }
    res.status(404).json(body)
  })

  // 错误中间件：必须最后注册
  app.use(errorHandler)

  return app
}

async function bootstrap(): Promise<void> {
  // 启动探活：连不上数据库时，生产环境直接不启动，开发环境只告警
  const dbReady = await pingDatabase()
  if (dbReady) {
    console.log(`✅ 数据库已连接：${env.db.host}:${env.db.port}/${env.db.database}`)
  } else {
    const hint = `连不上 MySQL（${env.db.host}:${env.db.port}/${env.db.database}），请确认 MySQL 已启动、backend/.env 配置正确`
    if (env.isProduction) {
      throw new Error(`[启动中止] ${hint}`)
    }
    console.warn(`⚠️  ${hint}\n   开发环境继续启动，购物车接口会返回 500。`)
  }

  const app = createApp()
  const server = app.listen(env.port, () => {
    console.log(`🚀 手帐集市后端已启动：http://127.0.0.1:${env.port}（${env.nodeEnv}）`)
    console.log('   健康检查   GET  /health')
    console.log('   购物车接口 GET  /api/cart')
    console.log('              POST /api/cart/items')
    console.log('              PATCH/DELETE /api/cart/...')
    console.log('   订单接口   POST /api/orders（结算下单）')
    console.log('              GET  /api/orders（我的订单）')
    console.log('              GET  /api/orders/:orderNo（详情）')
    console.log('              POST /api/orders/:orderNo/cancel | /pay')
  })

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`启动失败：端口 ${env.port} 已被占用，可在 backend/.env 里改 PORT`)
    } else {
      console.error('HTTP 服务启动失败：', error)
    }
    void closePool().finally(() => process.exit(1))
  })

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`\n收到 ${signal}，开始优雅退出…`)

    const forceExit = setTimeout(() => {
      console.error('优雅退出超时，强制结束进程')
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)
    // 不阻止进程在其它句柄都关闭后自然退出
    forceExit.unref()

    closeResources(server)
      .then(() => {
        clearTimeout(forceExit)
        console.log('已释放数据库连接池，退出')
        process.exit(0)
      })
      .catch((error: unknown) => {
        clearTimeout(forceExit)
        console.error('优雅退出失败：', error)
        process.exit(1)
      })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  process.on('unhandledRejection', (reason) => {
    console.error('未处理的 Promise 拒绝：', reason)
  })

  process.on('uncaughtException', (error) => {
    console.error('未捕获异常，进程即将退出：', error)
    void closePool().finally(() => process.exit(1))
  })
}

// 只有直接运行本文件才启动服务；测试 import 本文件时不会占用端口
if (require.main === module) {
  bootstrap().catch((error: unknown) => {
    console.error('启动失败：', error instanceof Error ? error.message : error)
    void closePool().finally(() => process.exit(1))
  })
}
