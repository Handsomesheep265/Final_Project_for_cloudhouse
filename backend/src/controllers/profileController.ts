/**
 * 个人主页控制器（Controller）
 * ----------------------------------------------------------------------------
 * 只做三件事（与购物车 / 订单控制器同构）：
 *   1. 从请求里取出参数：userId 来自鉴权中间件，其余来自 body / query / 路径；
 *   2. 调 service；
 *   3. 用统一响应体 { code, message, data } 返回。
 *
 * 注意：URL 里没有任何用户标识 —— 主页永远是「当前登录用户」的主页，
 * 既避免了越权参数，也省掉了「你不能看别人主页」这类判断。
 *
 * 业务规则（昵称长度、商品是否存在、分页边界）都在 profileService 里，
 * 失败时抛 ProfileError，由 src/middlewares/errorHandler.ts 统一转换。
 */
import type { Request, RequestHandler, Response } from 'express'
import type { AuthenticatedRequest } from '../middlewares/auth'
import { PROFILE_ERRORS, ProfileError, profileService, ProfileService } from '../services/profileService'
import type { ApiResponse } from '../types/common'
import type { ProfilePageQueryDTO, UpdateProfileDTO } from '../types/profile.dto'

/** 统一成功响应 */
function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { code: 0, message: 'ok', data }
  res.status(status).json(body)
}

/** 取当前登录用户；缺失或非法时按业务错误抛出 */
function requireUserId(req: Request): number {
  const { userId } = req as AuthenticatedRequest
  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
    throw new ProfileError(PROFILE_ERRORS.invalidUserId, '未获取到登录用户，请先登录')
  }
  return userId
}

/** 请求体兜底：没有 body 时按空对象处理，交给 service 报参数错误 */
function readBody<T>(req: Request): T {
  return (req.body ?? {}) as T
}

/** 路径参数里的商品 ID：只取字符串，格式校验交给 service */
function readProductIdParam(req: Request): number {
  const raw = req.params.productId
  return Number(typeof raw === 'string' ? raw : '')
}

/**
 * 查询串取值。
 * Express 把 `?page=1&page=2` 解析成数组，这里取第一个；
 * 对象形式一律当作没传，由 service 用默认值兜住。
 */
function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

/** 读分页参数（原样字符串，解析与校验在 service） */
function readPageQuery(req: Request): ProfilePageQueryDTO {
  return {
    page: queryString(req.query.page),
    pageSize: queryString(req.query.pageSize),
  }
}

export interface ProfileController {
  /** 个人资料 + 统计 */
  getProfile: RequestHandler
  /** 更新个人资料 */
  updateProfile: RequestHandler
  /** 我的收藏 */
  listFavorites: RequestHandler
  /** 加收藏 */
  addFavorite: RequestHandler
  /** 取消收藏 */
  removeFavorite: RequestHandler
  /** 我的商品 */
  listMyProducts: RequestHandler
}

/**
 * 工厂函数：注入不同的 ProfileService 便于做 mock 单元测试；
 * 默认实例见文件末尾的 profileController。
 */
export function createProfileController(service: ProfileService): ProfileController {
  return {
    /** GET /api/profile —— 昵称/头像/简介 + 商品·收藏·订单·评价数量 */
    getProfile: async (req, res) => {
      const userId = requireUserId(req)
      sendSuccess(res, await service.getProfile(userId))
    },

    /**
     * PATCH /api/profile —— 更新资料
     * body 只传要改的字段：{ nickname?, avatarUrl?, bio? }，传 null 表示清空。
     * 返回完整资料，前端直接替换本地状态。
     */
    updateProfile: async (req, res) => {
      const userId = requireUserId(req)
      const dto = readBody<UpdateProfileDTO>(req)
      sendSuccess(res, await service.updateProfile(userId, dto))
    },

    /** GET /api/profile/favorites?page=1&pageSize=12 —— 我的收藏 */
    listFavorites: async (req, res) => {
      const userId = requireUserId(req)
      sendSuccess(res, await service.listFavorites(userId, readPageQuery(req)))
    },

    /**
     * POST /api/profile/favorites/:productId —— 收藏商品（幂等）
     * 返回 { favorited: true, item }，item 可以直接插进列表，不用再拉一次。
     */
    addFavorite: async (req, res) => {
      const userId = requireUserId(req)
      sendSuccess(res, await service.addFavorite(userId, readProductIdParam(req)), 201)
    },

    /** DELETE /api/profile/favorites/:productId —— 取消收藏（幂等） */
    removeFavorite: async (req, res) => {
      const userId = requireUserId(req)
      sendSuccess(res, await service.removeFavorite(userId, readProductIdParam(req)))
    },

    /** GET /api/profile/products?page=1&pageSize=12 —— 我发布的商品（含下架） */
    listMyProducts: async (req, res) => {
      const userId = requireUserId(req)
      sendSuccess(res, await service.listMyProducts(userId, readPageQuery(req)))
    },
  }
}

/** 默认实例：service 用真实仓储层（连接池见 src/config/database.ts） */
export const profileController: ProfileController = createProfileController(profileService)
