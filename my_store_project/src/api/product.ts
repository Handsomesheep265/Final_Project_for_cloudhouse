/**
 * 商品接口
 * ----------------------------------------------------------------------------
 * 与 backend/src/routes/productRoutes.ts 一一对应：
 *   GET /api/products                    商品列表（分类筛选 + 排序 + 分页）
 *   GET /api/products/:productId         商品详情（公开，未登录也能看）
 *   GET /api/products/:productId/related 相关推荐
 */
import { request } from './client'
import type {
  ProductDetailVO,
  ProductListVO,
  ProductSort,
  RelatedProductListVO,
} from '../types/product'

const PRODUCT_PATH = '/api/products'

export interface ProductListParams {
  /** 分类 id；不传或 0 表示全部 */
  categoryId?: number
  /** 只看有货 */
  onlyInStock?: boolean
  sort?: ProductSort
  page?: number
  pageSize?: number
}

export const productApi = {
  /**
   * GET /api/products —— 商品列表
   * 参数拼成查询串；false / undefined 不写进去，避免 `onlyInStock=false` 这种噪音。
   */
  list: (params: ProductListParams = {}) => {
    const search = new URLSearchParams()
    if (params.categoryId !== undefined && params.categoryId > 0) {
      search.set('categoryId', String(params.categoryId))
    }
    if (params.onlyInStock) search.set('onlyInStock', '1')
    if (params.sort !== undefined) search.set('sort', params.sort)
    if (params.page !== undefined) search.set('page', String(params.page))
    if (params.pageSize !== undefined) search.set('pageSize', String(params.pageSize))

    const query = search.toString()
    return request<ProductListVO>(`${PRODUCT_PATH}${query ? `?${query}` : ''}`)
  },

  /** GET /api/products/:productId */
  getDetail: (productId: number) => request<ProductDetailVO>(`${PRODUCT_PATH}/${productId}`),

  /** GET /api/products/:productId/related —— 同分类在售商品，默认 6 条 */
  getRelated: (productId: number, limit = 6) =>
    request<RelatedProductListVO>(`${PRODUCT_PATH}/${productId}/related?limit=${limit}`),
}
