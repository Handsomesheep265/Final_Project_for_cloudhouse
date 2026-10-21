/**
 * 商品控制器（Controller）
 * ----------------------------------------------------------------------------
 * 和购物车 / 订单控制器不同的一点：商品详情是**公开接口**，
 * 未登录也能看，所以这里不强制 requireUserId，而是 readUserId（可能是 null）。
 * 登录状态下 service 会额外带上 isFavorite / cartQuantity 两个「我的状态」。
 *
 * 业务规则（商品是否存在、limit 边界、状态文案）都在 productService，
 * 失败时抛 ProductError，由 src/middlewares/errorHandler.ts 统一转换。
 */
import type { Request, RequestHandler, Response } from 'express'
import type { AuthenticatedRequest } from '../middlewares/auth'
import { productService, ProductService } from '../services/productService'
import type { ApiResponse } from '../types/common'
import type { RelatedProductQueryDTO } from '../types/product.dto'

/** 统一成功响应 */
function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { code: 0, message: 'ok', data }
  res.status(status).json(body)
}

/**
 * 读当前用户（可选）。
 * 有合法身份就返回 id，没有就返回 null —— 详情页不因为“没登录”而打不开，
 * 只是 isFavorite / cartQuantity 会退回默认值。
 */
function readUserId(req: Request): number | null {
  const { userId } = req as AuthenticatedRequest
  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) return null
  return userId
}

/** 路径参数里的商品 ID：只取字符串，格式校验交给 service */
function readProductIdParam(req: Request): number {
  const raw = req.params.productId
  return Number(typeof raw === 'string' ? raw : '')
}

/** 查询串取值（数组取第一个，对象当作没传） */
function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

/** 读相关推荐参数（原样字符串，解析与边界在 service） */
function readRelatedQuery(req: Request): RelatedProductQueryDTO {
  return { limit: queryString(req.query.limit) }
}

export interface ProductController {
  /** 商品详情 */
  getProductDetail: RequestHandler
  /** 相关推荐 */
  listRelatedProducts: RequestHandler
}

/**
 * 工厂函数：注入不同的 ProductService 便于做 mock 单元测试；
 * 默认实例见文件末尾的 productController。
 */
export function createProductController(service: ProductService): ProductController {
  return {
    /**
     * GET /api/products/:productId —— 商品详情
     * 返回商品、全部图片、卖家、分类、评价统计，以及当前用户的收藏/购物车状态。
     */
    getProductDetail: async (req, res) => {
      const userId = readUserId(req)
      sendSuccess(res, await service.getProductDetail(userId, readProductIdParam(req)))
    },

    /**
     * GET /api/products/:productId/related?limit=6 —— 相关推荐
     * 同分类、在售、排除自己；limit 默认 6，最大 12。
     */
    listRelatedProducts: async (req, res) => {
      sendSuccess(res, await service.listRelatedProducts(readProductIdParam(req), readRelatedQuery(req)))
    },
  }
}

/** 默认实例：service 用真实仓储层（连接池见 src/config/database.ts） */
export const productController: ProductController = createProductController(productService)
