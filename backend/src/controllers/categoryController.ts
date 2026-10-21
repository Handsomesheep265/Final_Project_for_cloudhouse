/**
 * 分类控制器（Controller）
 * ----------------------------------------------------------------------------
 * 分类是公开只读数据，只有「列表」一个接口：
 *   GET /api/categories → { list, total, productTotal }
 *
 * 导航栏直接用 list（已按 sortOrder 排好），productTotal 给「全部」用。
 */
import type { RequestHandler, Response } from 'express'
import { categoryService, CategoryService } from '../services/categoryService'
import type { ApiResponse } from '../types/common'

/** 统一成功响应 */
function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { code: 0, message: 'ok', data }
  res.status(status).json(body)
}

export interface CategoryController {
  /** 分类列表 */
  listCategories: RequestHandler
}

/**
 * 工厂函数：注入不同的 CategoryService 便于做 mock 单元测试；
 * 默认实例见文件末尾的 categoryController。
 */
export function createCategoryController(service: CategoryService): CategoryController {
  return {
    /** GET /api/categories —— 全部分类（带在售商品数）+ 全站在售总数 */
    listCategories: async (_req, res) => {
      sendSuccess(res, await service.listCategories())
    },
  }
}

/** 默认实例：service 用真实仓储层（连接池见 src/config/database.ts） */
export const categoryController: CategoryController = createCategoryController(categoryService)
