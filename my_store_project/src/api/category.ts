/**
 * 分类接口
 * ----------------------------------------------------------------------------
 * GET /api/categories —— 全部一级分类（按 sortOrder，带在售商品数）。
 * 导航栏的「全部」是前端聚合项（id = 0），不落库，由页面自己拼在最前面。
 */
import { request } from './client'
import type { CategoryListVO } from '../types/category'

export const categoryApi = {
  list: () => request<CategoryListVO>('/api/categories'),
}
