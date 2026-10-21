/**
 * 搜索控制器（Controller）
 * ----------------------------------------------------------------------------
 * 只做三件事：取查询参数 → 调 service → 统一响应体。
 * 搜索是公开接口（不需要登录），所以这里不读 userId。
 *
 * 业务规则（关键词至少 2 个字符、type 取值、分页上限）都在 searchService，
 * 失败时抛 SearchError，由 src/middlewares/errorHandler.ts 统一转换。
 */
import type { Request, RequestHandler, Response } from 'express'
import { searchService, SearchService } from '../services/searchService'
import type { ApiResponse } from '../types/common'
import type { SearchQueryDTO } from '../types/search.dto'

/** 统一成功响应 */
function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { code: 0, message: 'ok', data }
  res.status(status).json(body)
}

/** 查询串取值（数组取第一个，对象当作没传） */
function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

/** 读搜索参数（原样字符串，解析与校验在 service） */
function readSearchQuery(req: Request): SearchQueryDTO {
  return {
    keyword: queryString(req.query.keyword),
    type: queryString(req.query.type),
    page: queryString(req.query.page),
    pageSize: queryString(req.query.pageSize),
  }
}

export interface SearchController {
  /** 搜索商品 + 店铺 */
  search: RequestHandler
}

/**
 * 工厂函数：注入不同的 SearchService 便于做 mock 单元测试；
 * 默认实例见文件末尾的 searchController。
 */
export function createSearchController(service: SearchService): SearchController {
  return {
    /**
     * GET /api/search?keyword=手帐&type=all&page=1&pageSize=10
     * 返回 { keyword, type, products, shops }，按 type 决定哪一组为 null。
     * 关键词不足 2 个字符返回 40013，type 非法返回 40014，分页非法返回 40015。
     */
    search: async (req, res) => {
      sendSuccess(res, await service.search(readSearchQuery(req)))
    },
  }
}

/** 默认实例：service 用真实仓储层（连接池见 src/config/database.ts） */
export const searchController: SearchController = createSearchController(searchService)
