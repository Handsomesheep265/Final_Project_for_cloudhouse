/**
 * 个人主页接口
 * ----------------------------------------------------------------------------
 * 与 backend/src/routes/profileRoutes.ts 一一对应：
 *   GET    /api/profile                        资料 + 统计
 *   PATCH  /api/profile                        改昵称 / 头像 / 简介
 *   GET    /api/profile/favorites              我的收藏
 *   POST   /api/profile/favorites/:productId   收藏（幂等）
 *   DELETE /api/profile/favorites/:productId   取消收藏（幂等）
 *   GET    /api/profile/products               我发布的商品（含下架）
 */
import { request } from './client'
import type {
  FavoriteListVO,
  FavoriteToggleVO,
  ProfileVO,
  SellerProductListVO,
  UpdateProfilePayload,
} from '../types/profile'

const PROFILE_PATH = '/api/profile'

export interface PageParams {
  page?: number
  pageSize?: number
}

/** 拼查询串；没传的参数不写进去，避免出现 `?page=undefined` */
function toQuery(params: PageParams): string {
  const search = new URLSearchParams()
  if (params.page !== undefined) search.set('page', String(params.page))
  if (params.pageSize !== undefined) search.set('pageSize', String(params.pageSize))

  const query = search.toString()
  return query ? `?${query}` : ''
}

export const profileApi = {
  /** GET /api/profile —— 当前登录用户的资料与统计 */
  getProfile: () => request<ProfileVO>(PROFILE_PATH),

  /** PATCH /api/profile —— 只传要改的字段，返回更新后的完整资料 */
  updateProfile: (payload: UpdateProfilePayload) =>
    request<ProfileVO>(PROFILE_PATH, { method: 'PATCH', body: payload }),

  /** GET /api/profile/favorites */
  listFavorites: (params: PageParams = {}) =>
    request<FavoriteListVO>(`${PROFILE_PATH}/favorites${toQuery(params)}`),

  /** POST /api/profile/favorites/:productId —— 幂等 */
  addFavorite: (productId: number) =>
    request<FavoriteToggleVO>(`${PROFILE_PATH}/favorites/${productId}`, { method: 'POST' }),

  /** DELETE /api/profile/favorites/:productId —— 幂等 */
  removeFavorite: (productId: number) =>
    request<FavoriteToggleVO>(`${PROFILE_PATH}/favorites/${productId}`, { method: 'DELETE' }),

  /** GET /api/profile/products —— 我发布的商品（含下架） */
  listMyProducts: (params: PageParams = {}) =>
    request<SellerProductListVO>(`${PROFILE_PATH}/products${toQuery(params)}`),
}
