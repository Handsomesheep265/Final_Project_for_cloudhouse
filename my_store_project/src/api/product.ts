/**
 * 商品接口
 * ----------------------------------------------------------------------------
 * 与 backend/src/routes/productRoutes.ts 一一对应：
 *   GET /api/products/:productId          商品详情（公开，未登录也能看）
 *   GET /api/products/:productId/related  相关推荐
 */
import { request } from './client'
import type { ProductDetailVO, RelatedProductListVO } from '../types/product'

const PRODUCT_PATH = '/api/products'

export const productApi = {
  /** GET /api/products/:productId */
  getDetail: (productId: number) => request<ProductDetailVO>(`${PRODUCT_PATH}/${productId}`),

  /** GET /api/products/:productId/related —— 同分类在售商品，默认 6 条 */
  getRelated: (productId: number, limit = 6) =>
    request<RelatedProductListVO>(`${PRODUCT_PATH}/${productId}/related?limit=${limit}`),
}
